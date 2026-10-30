/**
 * A plugin's card: its `plugin.json`, the manifest of Agent Plugins 1.0. A bridge: que writes it from the plugin's
 * nodes when the plugin is published, so a harness that runs no code can read the plugin. It is never committed, and
 * nothing of que's reads it back: mount, the evals and the lint read the plugin's code. The standard's fields describe
 * the plugin to every harness; que's part, under its namespace in `extensions`, is the plugin's nodes in the plugin
 * schema (plugin, op, access-role, capability, case), by their names and fields, each live value written as data: a
 * zod schema as JSON Schema, and a function left out. A connector's skills are in it, each by name with the ops it
 * uses; a domain's are not, as a skill's folder is the standard's.
 *
 * A card is checked against the standard's own schema (kept in que, never fetched: Agent Plugins §5.2) when it is
 * made.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// ajv 8, for JSON Schema 2020-12.
import { Ajv2020 } from "ajv/dist/2020.js";
import * as z from "zod";
import type { Case } from "./case.ts";
import type { AccessRole, Capability, Definition } from "./contract.ts";
import { pluginFiles } from "./layout.ts";
import type { Skill } from "./skill.ts";
import { NAMESPACE } from "./names.ts";

/** The Agent Plugins version a card targets, as its `$schema`. */
export const CARD_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

/** The version of que's part of a card. It changes when that part's shape does. */
export const CARD_FORMAT = 5;

/** A node as a card holds it: its fields, with no type. */
type Written<N> = Omit<N, "type">;

/** A card: the standard's fields que writes, and que's part under its namespace. */
export type Card = {
  $schema: typeof CARD_SCHEMA;
  name: string;
  version?: string;
  description: string;
  extensions: {
    [NAMESPACE]: {
      format: typeof CARD_FORMAT;
      title: string;
      kind: "connector" | "domain";
      credential?: Schema;
      ops: {
        name: string;
        title: string;
        description: string;
        role?: string;
        /** The ops it uses, when it lists any: a domain op's, each a connector's op. */
        uses?: string[];
        input: Schema;
      }[];
      /** A connector's skills, each by its name with the ops it uses: a domain's are not on its card. */
      skills: { name: string; uses?: string[] }[];
      roles: Written<AccessRole>[];
      usesOps: string[];
      usesSkills: string[];
      capabilities: Written<Capability>[];
      cases: Written<Case>[];
    };
  };
};

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

// A node with no type, as a card writes it.
const written = <N extends { type: string }>({ type, ...fields }: N) => {
  void type;
  return fields;
};

/** The card of a plugin, from its nodes and its cases, and, when its package.json gives one, its version. */
export function cardOf(
  {
    definition,
    cases,
  }: { definition: Definition; cases: Case[]; skills?: Skill[] },
  version?: string,
): Card {
  const { plugin } = definition;
  return {
    $schema: CARD_SCHEMA,
    name: plugin.name,
    ...(version === undefined ? {} : { version }),
    description: plugin.description,
    extensions: {
      [NAMESPACE]: {
        format: CARD_FORMAT,
        title: plugin.title,
        // A plugin that leaves out its kind is a connector: a reader that runs no code is told so.
        kind: plugin.kind ?? "connector",
        ...(plugin.credential === undefined
          ? {}
          : {
              credential: schemaJson(
                plugin.credential,
                `plugin ${plugin.name}'s credential`,
              ),
            }),
        ops: definition.ops.map((op) => ({
          name: op.name,
          title: op.title,
          description: op.description,
          ...(op.role === undefined ? {} : { role: op.role }),
          ...(op.uses === undefined ? {} : { uses: op.uses }),
          input: schemaJson(op.input, `op ${op.name}'s input`),
        })),
        skills: [],
        roles: definition.roles.map(written),
        usesOps: plugin.usesOps ?? [],
        usesSkills: plugin.usesSkills ?? [],
        capabilities: definition.capabilities.map(written),
        cases: cases.map(written),
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

/** Check a card against the standard's schema, throwing one error that lists every problem. */
export function validateCard(card: Card, what: string): void {
  if (!standard(card))
    throw new Error(
      `${what} breaks Agent Plugins 1.0:\n- ${(standard.errors ?? [])
        .map((e) => `${e.instancePath || "(the card)"} ${e.message}`)
        .join("\n- ")}`,
    );
}

// The version the plugin in `dir`'s package.json gives, when it has one.
function versionIn(dir: string): string | undefined {
  const file = pluginFiles(dir).package;
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as { version?: string })
    .version;
}

/** The card of the plugin in `dir`, from its nodes and its cases, checked against the standard. */
export function checkedCard(
  dir: string,
  made: { definition: Definition; cases: Case[]; skills: Skill[] },
): Card {
  const card = cardOf(made, versionIn(dir));
  validateCard(card, `the card of ${made.definition.plugin.name}`);
  return card;
}
