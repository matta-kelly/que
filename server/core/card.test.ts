import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { cardOf, cardText } from "./card.js";
import { definePlugin } from "./plugin.js";

const getFabric = {
  name: "getFabric",
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
  assert.deepEqual(cardOf(warehouse, "0.1.0"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "warehouse",
    version: "0.1.0",
    description: "The record.",
    extensions: {
      "io.github.matta-kelly.que": {
        format: 1,
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
            name: "getFabric",
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
      },
    },
  });
});

test("cardOf leaves out the version, a credential and an op's role when there are none", () => {
  const card = cardOf(
    definePlugin({
      name: "notes",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [{ ...getFabric, role: undefined }],
    }),
  );
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
      cardOf(
        definePlugin({
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
      ),
    /op notes_getFabric's schema has no JSON Schema form/,
  );
});

test("cardText is two-space JSON ending in a newline, the same bytes for the same definition", () => {
  const text = cardText(cardOf(warehouse, "0.1.0"));
  assert.equal(text, cardText(cardOf(warehouse, "0.1.0")));
  assert.ok(text.startsWith('{\n  "$schema": '));
  assert.ok(text.endsWith("}\n"));
});
