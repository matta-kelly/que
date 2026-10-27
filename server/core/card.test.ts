import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { cardOf, cardText } from "./card.js";
import { definePlugin } from "./plugin.js";

const getFabric = {
  name: "get-fabric",
  title: "Get a fabric",
  description: "One fabric by its code.",
  role: "read",
  schema: z.object({
    code: z.string().describe("The fabric code"),
    limit: z.number().int().default(5).describe("How many"),
  }),
  run: async () => ({}),
};

const warehouse = definePlugin({
  name: "warehouse",
  title: "Warehouse",
  description: "The record.",
  credential: z.object({ url: z.string().describe("The database URL") }),
  connect: async () => ({}),
  roles: [{ name: "read", description: "Reads the record." }],
  ops: [getFabric],
  capabilities: [
    {
      name: "find-fabric",
      title: "Find a fabric",
      description: "Look one up.",
    },
  ],
});

test("cardOf makes the standard's fields, and que's part as the plugin's ontology nodes", () => {
  assert.deepEqual(cardOf({ definition: warehouse, cases: [] }, "0.1.0"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "warehouse",
    version: "0.1.0",
    description: "The record.",
    extensions: {
      "io.github.matta-kelly.que": {
        format: 2,
        title: "Warehouse",
        credential: {
          type: "object",
          properties: {
            url: { type: "string", description: "The database URL" },
          },
          required: ["url"],
        },
        ops: [
          {
            name: "get-fabric",
            title: "Get a fabric",
            description: "One fabric by its code.",
            role: "read",
            input: {
              type: "object",
              properties: {
                code: { type: "string", description: "The fabric code" },
                limit: {
                  type: "integer",
                  default: 5,
                  description: "How many",
                  minimum: -9007199254740991,
                  maximum: 9007199254740991,
                },
              },
              required: ["code"],
            },
          },
        ],
        roles: [{ name: "read", description: "Reads the record." }],
        uses: { ops: [], skills: [] },
        capabilities: [
          {
            name: "find-fabric",
            title: "Find a fabric",
            description: "Look one up.",
          },
        ],
        cases: [],
      },
    },
  });
});

test("cardOf leaves out the version, a credential and an op's role when there are none", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [{ ...getFabric, role: undefined }],
    }),
    cases: [],
  });
  assert.equal("version" in card, false);
  assert.equal(
    "credential" in card.extensions["io.github.matta-kelly.que"],
    false,
  );
  assert.equal(
    "role" in card.extensions["io.github.matta-kelly.que"].ops[0],
    false,
  );
});

test("cardOf refuses an op whose schema has no JSON Schema form, naming the op", () => {
  assert.throws(
    () =>
      cardOf({
        definition: definePlugin({
          name: "notes",
          title: "Notes",
          description: "How the team writes things down.",
          ops: [
            {
              ...getFabric,
              role: undefined,
              schema: z.object({ when: z.date().describe("When") }),
            },
          ],
        }),
        cases: [],
      }),
    /op notes-get-fabric's schema has no JSON Schema form/,
  );
});

test("cardText is two-space JSON ending in a newline, the same bytes for the same definition", () => {
  const text = cardText(cardOf({ definition: warehouse, cases: [] }, "0.1.0"));
  assert.equal(
    text,
    cardText(cardOf({ definition: warehouse, cases: [] }, "0.1.0")),
  );
  assert.ok(text.startsWith('{\n  "$schema": '));
  assert.ok(text.endsWith("}\n"));
});

test("cardOf writes a schema with an id out in its place, with no $ref", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          schema: z.object({
            code: z.string().meta({ id: "Code" }).describe("A code"),
          }),
        },
      ],
    }),
    cases: [],
  });
  assert.deepEqual(
    card.extensions["io.github.matta-kelly.que"].ops[0].input.properties,
    { code: { type: "string", description: "A code" } },
  );
});

test("cardOf keeps a field named $ref, as only the places a schema sits are written out", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          schema: z.object({ $ref: z.string().describe("A reference") }),
        },
      ],
    }),
    cases: [],
  });
  assert.deepEqual(
    card.extensions["io.github.matta-kelly.que"].ops[0].input.properties,
    { $ref: { type: "string", description: "A reference" } },
  );
});

test("cardOf refuses an op whose schema is recursive, as a $ref in a card points at the card's root", () => {
  const Node: z.ZodType = z.lazy(() =>
    z.object({ children: z.array(Node).describe("Its children") }),
  );
  assert.throws(
    () =>
      cardOf({
        definition: definePlugin({
          name: "notes",
          title: "Notes",
          description: "How the team writes things down.",
          ops: [
            {
              ...getFabric,
              role: undefined,
              schema: z.object({ tree: Node.describe("A tree") }),
            },
          ],
        }),
        cases: [],
      }),
    /op notes-get-fabric's schema needs a \$ref in JSON Schema \(#[^:]*: it is recursive, or not in the schema\)/,
  );
});

test("cardOf refuses a $ref left under a keyword the card does not write out", () => {
  assert.throws(
    () =>
      cardOf({
        definition: definePlugin({
          name: "notes",
          title: "Notes",
          description: "How the team writes things down.",
          ops: [
            {
              ...getFabric,
              role: undefined,
              schema: z
                .object({ code: z.string().describe("A code") })
                .meta({ unevaluatedProperties: { $ref: "#/$defs/Code" } }),
            },
          ],
        }),
        cases: [],
      }),
    /op notes-get-fabric's schema keeps a \$ref to #\/\$defs\/ under a keyword the card does not write out/,
  );
});

test("cardOf keeps a description that names a $ref", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          schema: z.object({
            code: z.string().describe('Not a "#/$defs/Code" ref'),
          }),
        },
      ],
    }),
    cases: [],
  });
  assert.deepEqual(
    card.extensions["io.github.matta-kelly.que"].ops[0].input.properties,
    { code: { type: "string", description: 'Not a "#/$defs/Code" ref' } },
  );
});

test("cardOf keeps a default that holds a $ref, as a default is data, not a schema", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          schema: z.object({
            link: z
              .object({ $ref: z.string().describe("A reference") })
              .default({ $ref: "#top" })
              .describe("A link"),
          }),
        },
      ],
    }),
    cases: [],
  });
  assert.deepEqual(
    card.extensions["io.github.matta-kelly.que"].ops[0].input.properties,
    {
      link: {
        type: "object",
        properties: { $ref: { type: "string", description: "A reference" } },
        required: ["$ref"],
        default: { $ref: "#top" },
        description: "A link",
      },
    },
  );
});

test("cardOf puts each case on the card, by its name, as the plugin's case nodes", () => {
  const countDrafted = {
    name: "count-drafted",
    description: "Counts the drafted fabrics.",
    capability: "find-fabric",
    input: "How many fabrics are drafted?",
    start: "Some fabrics are drafted.",
    good: "The answer is one number.",
  };
  const card = cardOf({ definition: warehouse, cases: [countDrafted] });
  assert.deepEqual(card.extensions["io.github.matta-kelly.que"].cases, [
    countDrafted,
  ]);
});
