/**
 * A plugin's card: its `plugin.json`, the manifest of Agent Plugins 1.0. Made from the definition, never written by
 * hand: the definition is the one source, and the card is what any reader reads with no code run. The standard's
 * fields describe the plugin to every harness; que's part, under its namespace in `extensions`, is the plugin's
 * nodes in que's ontology (plugin, op, access-role, capability), by the ontology's field names. Skills are not in
 * it: their folders are the standard's, and a reader reads them there.
 */

import * as z from "zod";
import { check, name, standardName, text } from "./check.js";
import { NAMESPACE } from "./layout.js";
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
export const CARD_FORMAT = 1;

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
      name,
      title: text,
      description: text,
      role: standardName.optional(),
      input: JsonSchema,
    }),
  ),
  roles: z.array(Role),
  uses: Uses,
  capabilities: z.array(Capability),
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
  if (JSON.stringify(whole).includes('"#/$defs/'))
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
  input: jsonSchema(op.schema, `op ${plugin}_${op.name}'s schema`),
});

/** The card of a plugin, from its definition and, when its package.json gives one, its version. */
export function cardOf(definition: PluginDefinition, version?: string): Card {
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
