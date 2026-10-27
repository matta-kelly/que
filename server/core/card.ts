/**
 * A plugin's card: its `plugin.json`, the manifest of Agent Plugins 1.0. Made from the definition, never written by
 * hand: the definition and the cases are the one source, and the card is what any reader reads with no code run.
 * The standard's fields describe the plugin to every harness; que's part, under its namespace in `extensions`, is the
 * plugin's nodes in que's ontology (plugin, op, access-role, capability, case), by the ontology's field names, each
 * thing by its name in the plugin. Skills are not in it: their folders are the standard's, and a reader reads them
 * there.
 *
 * On disk, a card is checked against the standard's own schema (kept in que, never fetched: Agent Plugins §5.2)
 * and against que's part, and held to its definition byte for byte.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// ajv 8, for JSON Schema 2020-12.
import { Ajv2020 } from "ajv/dist/2020.js";
import * as z from "zod";
import { Case } from "./case.js";
import { check, standardName, text } from "./check.js";
import { NAMESPACE, pluginFiles } from "./layout.js";
import { nameIn } from "./ontology.js";
import {
  Capability,
  Role,
  Uses,
  type Operation,
  type PluginDefinition,
} from "./plugin.js";

/** The Agent Plugins version a card targets, as its `$schema`. */
export const CARD_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

/** The version of que's part of a card. It changes when that part's shape does. */
export const CARD_FORMAT = 2;

const JsonSchema = z.record(z.string(), z.unknown(), {
  error: "must be a JSON Schema object",
});

/** que's part of a card, under its namespace: the one shape a reader of cards parses with. */
export const CardPart = z.strictObject({
  format: z.literal(CARD_FORMAT, { error: `must be ${CARD_FORMAT}` }),
  title: text,
  credential: JsonSchema.optional(),
  ops: z.array(
    z.strictObject({
      name: standardName,
      title: text,
      description: text,
      role: standardName.optional(),
      input: JsonSchema,
    }),
  ),
  roles: z.array(Role),
  uses: Uses,
  capabilities: z.array(Capability),
  cases: z.array(Case),
});

export type CardPart = z.infer<typeof CardPart>;

/** Check que's part of a card, throwing one error that lists every problem. `what` leads the error. */
export function validateCardPart(
  part: unknown,
  what: string,
): asserts part is CardPart {
  check(CardPart, part, what);
}

type Schema = Record<string, unknown>;

// The keywords whose value is a schema, a list of schemas, or a map of name to schema (JSON Schema 2020-12, the
// ones zod writes). Any other keyword holds a value (a default, an enum, a const), which is kept as it is.
const SCHEMA = [
  "items",
  "additionalProperties",
  "not",
  "contains",
  "propertyNames",
  "if",
  "then",
  "else",
];
const SCHEMAS = ["anyOf", "oneOf", "allOf", "prefixItems"];
const NAMED = ["properties", "patternProperties"];
// The keywords whose value is data, never a schema.
const VALUES = ["default", "const", "enum", "examples"];

/**
 * A JSON Schema with each `#/$defs/<name>` written out in its place, and no `$defs` left: the card is one
 * document, so a `#/...` in it would point at the card's root. Only the places a schema can sit are walked, so a
 * field or a default named `$ref` is kept. A definition that leads back to itself (a recursive schema) cannot be
 * written out, and is refused.
 */
function inline(
  schema: Schema,
  defs: Record<string, Schema>,
  what: string,
  seen: string[] = [],
): Schema {
  const { $ref, $defs, ...rest } = schema;
  void $defs;
  if (typeof $ref === "string") {
    const name = $ref.replace(/^#\/\$defs\//, "");
    if (name === $ref || !Object.hasOwn(defs, name) || seen.includes(name))
      throw new Error(
        `${what} needs a $ref in JSON Schema (${$ref}: it is recursive, or not in the schema): a card holds each schema whole, so give it one that is not`,
      );
    return inline({ ...defs[name], ...rest }, defs, what, [...seen, name]);
  }
  const walk = (s: unknown) => inline(s as Schema, defs, what, seen);
  return Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [
      key,
      typeof value !== "object" || value === null
        ? value
        : SCHEMA.includes(key)
          ? walk(value)
          : SCHEMAS.includes(key) && Array.isArray(value)
            ? value.map(walk)
            : NAMED.includes(key)
              ? Object.fromEntries(
                  Object.entries(value).map(([field, s]) => [field, walk(s)]),
                )
              : value,
    ]),
  );
}

// Whether a schema still holds a $ref to a place in the document: a "$ref" keyword whose value is text starting
// with #, in it or in any schema under it. Read as the walk reads a schema: a map of fields (properties) holds
// schemas by name, so a field named $ref is a schema; a value keyword (a default, an enum) holds data, which is
// not read; and any other keyword, one the walk does not know, is read in full, as it may hold a schema.
function holdsRef(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(holdsRef);
  if (typeof node !== "object" || node === null) return false;
  return Object.entries(node).some(([key, value]) =>
    key === "$ref"
      ? typeof value === "string" && value.startsWith("#")
      : VALUES.includes(key)
        ? false
        : NAMED.includes(key) && typeof value === "object" && value !== null
          ? Object.values(value).some(holdsRef)
          : holdsRef(value),
  );
}

/**
 * A schema as JSON Schema, for a reader that runs no code. The card is one document, so each schema in it is
 * whole: its own `$schema` is left out, and a schema used twice, or given an id, is written out where it is used.
 */
function jsonSchema(schema: z.ZodType, what: string): Schema {
  let json: Schema;
  try {
    // The input a caller gives: a field with a default may be left out.
    json = z.toJSONSchema(schema, { io: "input", reused: "inline" }) as Schema;
  } catch (error) {
    throw new Error(
      `${what} has no JSON Schema form (${(error as Error).message}): give it one that zod can write as JSON Schema`,
      { cause: error },
    );
  }
  delete json.$schema;
  const whole = inline(
    json,
    (json.$defs ?? {}) as Record<string, Schema>,
    what,
  );
  // A keyword the walk does not know (one a later zod may write) could still hold a ref: refuse it, never pass it.
  if (holdsRef(whole))
    throw new Error(
      `${what} keeps a $ref to #/$defs/ under a keyword the card does not write out: give it a schema that has none`,
    );
  return whole;
}

const opNode = (plugin: string, op: Operation) => ({
  name: op.name,
  title: op.title,
  description: op.description,
  ...(op.role === undefined ? {} : { role: op.role }),
  input: jsonSchema(op.schema, `op ${nameIn(plugin, op.name)}'s schema`),
});

/** The card of a plugin, from its definition, its cases and, when its package.json gives one, its version. */
export function cardOf(
  { definition, cases }: { definition: PluginDefinition; cases: Case[] },
  version?: string,
): Card {
  return {
    $schema: CARD_SCHEMA,
    name: definition.name,
    ...(version === undefined ? {} : { version }),
    description: definition.description,
    extensions: {
      [NAMESPACE]: {
        format: CARD_FORMAT,
        title: definition.title,
        ...(definition.credential === undefined
          ? {}
          : {
              credential: jsonSchema(
                definition.credential,
                `plugin ${definition.name}'s credential`,
              ),
            }),
        ops: definition.ops.map((op) => opNode(definition.name, op)),
        roles: definition.roles,
        uses: definition.uses,
        capabilities: definition.capabilities,
        cases,
      },
    },
  };
}

/** A card: the standard's fields, and que's part under its namespace. */
export type Card = {
  $schema: typeof CARD_SCHEMA;
  name: string;
  version?: string;
  description: string;
  extensions: Record<typeof NAMESPACE, CardPart>;
};

/** A card as its file holds it: two-space JSON, ending in a newline, so the same definition makes the same bytes. */
export const cardText = (card: Card) => `${JSON.stringify(card, null, 2)}\n`;

const STANDARD = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "standards/agent-plugins-1.0.0/plugin.schema.json",
    ),
    "utf8",
  ),
) as object;

const standard = new Ajv2020({ allErrors: true }).compile(STANDARD);

/** Check a card against the standard's schema and que's part, throwing one error that lists every problem. */
export function validateCard(
  card: unknown,
  what: string,
): asserts card is Card {
  if (!standard(card))
    throw new Error(
      `${what} breaks Agent Plugins 1.0:\n- ${(standard.errors ?? [])
        .map((e) => `${e.instancePath || "(the card)"} ${e.message}`)
        .join("\n- ")}`,
    );
  validateCardPart(
    (card as { extensions?: Record<string, unknown> }).extensions?.[NAMESPACE],
    `${what}'s ${NAMESPACE} part is invalid`,
  );
}

// The version the plugin in `dir`'s package.json gives, when it has one.
function versionIn(dir: string): string | undefined {
  const file = pluginFiles(dir).package;
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as { version?: string })
    .version;
}

/** What a card is made from: a plugin's definition and its cases. */
type Made = { definition: PluginDefinition; cases: Case[] };

/** The text the card of the plugin in `dir` must hold, from its definition and its cases, checked. */
export function cardTextOf(dir: string, plugin: Made): string {
  const card = cardOf(plugin, versionIn(dir));
  const { definition } = plugin;
  validateCard(card, `the card of ${definition.name}`);
  return cardText(card);
}

/**
 * Throw when the plugin in `dir` has no card, or one that is not, byte for byte, what its definition and its cases
 * make. The error names the first line that differs, and the command that writes it again.
 */
export function checkCard(dir: string, plugin: Made): void {
  const file = pluginFiles(dir).card;
  const fix = `write it with \`just card ${dir}\``;
  if (!existsSync(file))
    throw new Error(`${dir} has no card (plugin.json): ${fix}`);
  const want = cardTextOf(dir, plugin).split("\n");
  const have = readFileSync(file, "utf8").split("\n");
  const line = want.findIndex((text, i) => text !== have[i]);
  if (line !== -1 || have.length !== want.length)
    throw new Error(
      `${file} is not what its definition makes (from line ${(line === -1 ? want.length : line) + 1}): ${fix}`,
    );
}
