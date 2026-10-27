/**
 * A plugin's card: its `plugin.json`, the manifest of Agent Plugins 1.0. Made from the definition, never written by
 * hand: the definition and the cases are the one source, and the card is what any reader reads with no code run.
 * The standard's fields describe the plugin to every harness; que's part, under its namespace in `extensions`, is the
 * plugin's nodes in the plugin schema (plugin, op, access-role, capability, case), by the schema's field names, each
 * thing by its name in the plugin. Skills are not in it: their folders are the standard's, and a reader reads them
 * there.
 *
 * On disk, a card is checked against the standard's own schema (kept in que, never fetched: Agent Plugins §5.2)
 * and against `Card`, and held to its definition byte for byte.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// ajv 8, for JSON Schema 2020-12.
import { Ajv2020 } from "ajv/dist/2020.js";
import * as z from "zod";
import { Case } from "./case.ts";
import { check } from "./check.ts";
import { Capability, Role, Uses, type PluginDefinition } from "./contract.ts";
import { fieldsOf, standardName, text } from "./fields.ts";
import { pluginFiles } from "./layout.ts";
import { NAMESPACE, nameIn } from "./names.ts";
import { plugin } from "./schema.ts";

/** The Agent Plugins version a card targets, as its `$schema`. */
export const CARD_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

/** The version of que's part of a card. It changes when that part's shape does. */
export const CARD_FORMAT = 2;

const { plugin: pluginType, op } = plugin.types;

/**
 * A card: the standard's fields que reads, and que's part under its namespace, each field by the plugin schema's
 * types. The one shape of a card: the writer checks what it makes with it, and the source reads a card with it.
 */
export const Card = z.object({
  $schema: z.literal(CARD_SCHEMA, { error: `must be ${CARD_SCHEMA}` }),
  name: standardName,
  version: z.string().optional(),
  description: text,
  extensions: z.object({
    [NAMESPACE]: z.strictObject({
      format: z.literal(CARD_FORMAT, { error: `must be ${CARD_FORMAT}` }),
      title: fieldsOf(pluginType).title,
      credential: fieldsOf(pluginType).credential,
      ops: z.array(
        z.strictObject({
          // Its name and role in its plugin: the card holds each thing by its name in the plugin.
          name: standardName,
          title: fieldsOf(op).title,
          description: text,
          role: standardName.optional(),
          input: fieldsOf(op).input,
        }),
      ),
      roles: z.array(Role),
      uses: Uses,
      capabilities: z.array(Capability),
      cases: z.array(Case),
    }),
  }),
});

export type Card = z.infer<typeof Card>;

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
function schemaJson(schema: z.ZodType, what: string): Schema {
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
              credential: schemaJson(
                definition.credential,
                `plugin ${definition.name}'s credential`,
              ),
            }),
        ops: definition.ops.map((op) => ({
          name: op.name,
          title: op.title,
          description: op.description,
          ...(op.role === undefined ? {} : { role: op.role }),
          input: schemaJson(
            op.schema,
            `op ${nameIn(definition.name, op.name)}'s schema`,
          ),
        })),
        roles: definition.roles,
        uses: definition.uses,
        capabilities: definition.capabilities,
        cases,
      },
    },
  };
}

/** A card as its file holds it: two-space JSON, ending in a newline, so the same definition makes the same bytes. */
export const cardText = (card: Card) => `${JSON.stringify(card, null, 2)}\n`;

// From the package root, so the path is the same from src/ and from dist/.
const STANDARD = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "../standards/agent-plugins-1.0.0/plugin.schema.json",
    ),
    "utf8",
  ),
) as object;

const standard = new Ajv2020({ allErrors: true }).compile(STANDARD);

/** Check a card against the standard's schema and `Card`, throwing one error that lists every problem. */
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
  check(Card, card, `${what} is invalid`);
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

/** The card the plugin in `dir` must have, from its definition and its cases, checked. */
export function checkedCard(dir: string, made: Made): Card {
  const card = cardOf(made, versionIn(dir));
  validateCard(card, `the card of ${made.definition.name}`);
  return card;
}

/**
 * The card of the plugin in `dir`, throwing when it has none, or one that is not, byte for byte, what its definition
 * and its cases make. The error names the first line that differs, and the command that writes it again.
 */
export function checkCard(dir: string, made: Made): Card {
  const file = pluginFiles(dir).card;
  const fix = `write it with \`just card ${dir}\``;
  if (!existsSync(file))
    throw new Error(`${dir} has no card (plugin.json): ${fix}`);
  const card = checkedCard(dir, made);
  const want = cardText(card).split("\n");
  const have = readFileSync(file, "utf8").split("\n");
  const line = want.findIndex((text, i) => text !== have[i]);
  if (line !== -1 || have.length !== want.length)
    throw new Error(
      `${file} is not what its definition makes (from line ${(line === -1 ? want.length : line) + 1}): ${fix}`,
    );
  return card;
}
