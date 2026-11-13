import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import {
  cardOf,
  cardText,
  CARD_FORMAT,
  checkedCard,
  validateCard,
} from "./card.ts";
import { parseSkill } from "./skill.ts";
import { definePlugin } from "./contract.ts";

const getFabric = {
  name: "warehouse-get-fabric",
  type: "op" as const,
  title: "Get a fabric",
  description: "One fabric by its code.",
  role: "warehouse-read",
  input: z.object({
    code: z.string().describe("The fabric code"),
    limit: z.number().int().default(5).describe("How many"),
  }),
  run: async () => ({}),
};

const warehouse = definePlugin({
  name: "warehouse",
  type: "plugin",
  title: "Warehouse",
  description: "The record.",
  credential: z.object({ url: z.string().describe("The database URL") }),
  connect: async () => ({}),
  roles: [
    {
      name: "warehouse-read",
      type: "access-role",
      description: "Reads the record.",
    },
  ],
  ops: [getFabric],
  capabilities: [
    {
      name: "find-fabric",
      type: "capability",
      title: "Find a fabric",
      description: "Look one up.",
    },
  ],
});

test("cardOf makes the standard's fields, and que's part as the plugin's nodes, each live value as data", () => {
  assert.deepEqual(cardOf({ definition: warehouse }, "0.1.0"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "warehouse",
    version: "0.1.0",
    description: "The record.",
    extensions: {
      "io.github.matta-kelly.que": {
        format: 9,
        title: "Warehouse",
        kind: "connector",
        credential: {
          type: "object",
          properties: {
            url: { type: "string", description: "The database URL" },
          },
          required: ["url"],
        },
        ops: [
          {
            name: "warehouse-get-fabric",
            title: "Get a fabric",
            description: "One fabric by its code.",
            role: "warehouse-read",
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
        roles: [{ name: "warehouse-read", description: "Reads the record." }],
        usesOps: [],
        usesSkills: [],
        capabilities: [
          {
            name: "find-fabric",
            title: "Find a fabric",
            description: "Look one up.",
          },
        ],
        skills: [],
      },
    },
  });
});

test("cardOf leaves out the version, a credential and an op's role when there are none", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      type: "plugin",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [{ ...getFabric, role: undefined }],
    }),
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

test("cardOf writes each op's uses as the op lists them, beside the plugin's made usesOps, and leaves out the uses of an op that lists none", () => {
  const op = (name: string, uses?: string[]) => ({
    ...getFabric,
    name,
    role: undefined,
    ...(uses === undefined ? {} : { uses }),
  });
  const pim = definePlugin({
    name: "pim",
    type: "plugin",
    title: "PIM",
    description: "The products.",
    ops: [
      op("pim-push", ["warehouse-get-fabric", "odoo-write"]),
      op("pim-check", ["odoo-find"]),
      op("pim-say"),
    ],
  });
  // The plugin's usesOps, as readPlugin makes it from its ops and skills.
  const made = [
    "warehouse-get-fabric",
    "odoo-write",
    "odoo-find",
    "odoo-guide-find",
  ];
  const que = cardOf({
    definition: {
      ...pim,
      plugin: { ...pim.plugin, kind: "domain", usesOps: made },
    },
  }).extensions["io.github.matta-kelly.que"];
  assert.deepEqual(
    que.ops.map((written) => [written.name, written.uses]),
    [
      ["pim-push", ["warehouse-get-fabric", "odoo-write"]],
      ["pim-check", ["odoo-find"]],
      ["pim-say", undefined],
    ],
  );
  assert.equal("uses" in que.ops[2], false);
  assert.deepEqual(que.usesOps, made);
});

test("cardOf gives the kind a plugin says, and connector for one that leaves it out", () => {
  const pim = definePlugin({
    name: "pim",
    type: "plugin",
    title: "PIM",
    description: "The products.",
  });
  const kindOf = (kind?: "connector" | "domain") =>
    cardOf({
      definition: kind ? { ...pim, plugin: { ...pim.plugin, kind } } : pim,
    }).extensions["io.github.matta-kelly.que"].kind;
  assert.equal(kindOf("domain"), "domain");
  assert.equal(kindOf("connector"), "connector");
  assert.equal(kindOf(), "connector");
});

test("cardText is two-space JSON ending in a newline, the same bytes for the same definition", () => {
  const text = cardText(cardOf({ definition: warehouse }, "0.1.0"));
  assert.equal(text, cardText(cardOf({ definition: warehouse }, "0.1.0")));
  assert.ok(text.startsWith('{\n  "$schema": '));
  assert.ok(text.endsWith("}\n"));
});

test("cardOf writes a schema with an id out in its place, with no $ref", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      type: "plugin",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          input: z.object({
            code: z.string().meta({ id: "Code" }).describe("A code"),
          }),
        },
      ],
    }),
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
      type: "plugin",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          input: z.object({ $ref: z.string().describe("A reference") }),
        },
      ],
    }),
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
          type: "plugin",
          title: "Notes",
          description: "How the team writes things down.",
          ops: [
            {
              ...getFabric,
              role: undefined,
              input: z.object({ tree: Node.describe("A tree") }),
            },
          ],
        }),
      }),
    /op warehouse-get-fabric's input needs a \$ref in JSON Schema \(#[^:]*: it is recursive, or not in the schema\)/,
  );
});

test("cardOf refuses a $ref left under a keyword the card does not write out", () => {
  assert.throws(
    () =>
      cardOf({
        definition: definePlugin({
          name: "notes",
          type: "plugin",
          title: "Notes",
          description: "How the team writes things down.",
          ops: [
            {
              ...getFabric,
              role: undefined,
              input: z
                .object({ code: z.string().describe("A code") })
                .meta({ unevaluatedProperties: { $ref: "#/$defs/Code" } }),
            },
          ],
        }),
      }),
    /op warehouse-get-fabric's input keeps a \$ref to #\/\$defs\/ under a keyword the card does not write out/,
  );
});

test("cardOf keeps a description that names a $ref", () => {
  const card = cardOf({
    definition: definePlugin({
      name: "notes",
      type: "plugin",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          input: z.object({
            code: z.string().describe('Not a "#/$defs/Code" ref'),
          }),
        },
      ],
    }),
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
      type: "plugin",
      title: "Notes",
      description: "How the team writes things down.",
      ops: [
        {
          ...getFabric,
          role: undefined,
          input: z.object({
            link: z
              .object({ $ref: z.string().describe("A reference") })
              .default({ $ref: "#top" })
              .describe("A link"),
          }),
        },
      ],
    }),
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

const guide = parseSkill(
  "warehouse-guide",
  `---
name: warehouse-guide
description: How to find a fabric.
allowed-tools: warehouse-get-fabric
---

Find it by its code.`,
);
const count = parseSkill(
  "warehouse-count",
  `---
name: warehouse-count
description: How to count the fabrics.
---

Count them.`,
);

test("cardOf lists a connector's skills, each by name with its uses, none on a domain's card, and format 9", () => {
  const connector = cardOf({
    definition: warehouse,
    skills: [guide, count],
  }).extensions["io.github.matta-kelly.que"];
  assert.deepEqual(connector.skills, [
    { name: "warehouse-guide", uses: ["warehouse-get-fabric"] },
    { name: "warehouse-count" },
  ]);
  assert.equal("uses" in connector.skills[1], false);
  assert.equal(connector.format, 9);
  const pim = definePlugin({
    name: "pim",
    type: "plugin",
    title: "PIM",
    description: "The products.",
  });
  const domain = {
    ...pim,
    plugin: {
      ...pim.plugin,
      kind: "domain" as const,
      usesSkills: ["warehouse-guide"],
    },
  };
  assert.deepEqual(
    cardOf({ definition: domain, skills: [count] }).extensions[
      "io.github.matta-kelly.que"
    ].skills,
    [],
  );
});

test("validateCard takes a connector's card that lists its skills, each with its uses", () => {
  const card = cardOf({ definition: warehouse, skills: [guide] });
  assert.deepEqual(card.extensions["io.github.matta-kelly.que"].skills, [
    { name: "warehouse-guide", uses: ["warehouse-get-fabric"] },
  ]);
  assert.doesNotThrow(() => validateCard(card, "the card"));
});

test("checkedCard puts the plugin's skills on the card it checks", () => {
  const card = checkedCard("/no/such/plugin", {
    definition: warehouse,
    skills: [guide],
  });
  assert.deepEqual(card.extensions["io.github.matta-kelly.que"].skills, [
    { name: "warehouse-guide", uses: ["warehouse-get-fabric"] },
  ]);
});

/** The flag this cut adds: the op node carries it once the op type does. */
const flaggedOp = (
  op: NonNullable<ReturnType<typeof definePlugin>>["ops"][number],
) => ({ ...op, approval: true }) as typeof op & { approval: true };

test("cardOf writes an op's approval, leaves it out when the op has none, and its format is 9", () => {
  const queOf = (definition: Parameters<typeof cardOf>[0]["definition"]) =>
    cardOf({ definition }).extensions["io.github.matta-kelly.que"];

  const yes = queOf({ ...warehouse, ops: warehouse.ops.map(flaggedOp) });
  assert.equal(
    (yes.ops[0] as { approval?: boolean }).approval,
    true,
    "an op that needs a yes says so on its card",
  );
  const no = queOf(warehouse);
  assert.equal(
    "approval" in no.ops[0],
    false,
    "an op that leaves it out has no such key",
  );
  assert.equal(no.format, 9, "the card's format is 9");
  assert.equal(CARD_FORMAT, 9);
});

test("given an op whose approval is an object, when its card is made, then the card's op says approval: true and carries no function", () => {
  const definition = {
    ...warehouse,
    ops: [{ ...getFabric, role: undefined, approval: { when: () => true } }],
  } as unknown as Parameters<typeof cardOf>[0]["definition"];
  const op = cardOf({ definition }).extensions["io.github.matta-kelly.que"]
    .ops[0] as { approval?: unknown; description?: unknown };
  assert.equal(op.approval, true, "the op says a call can need approval");
  assert.equal("when" in (op as object), false, "the card carries no when");
  assert.equal(
    op.description,
    "One fabric by its code.",
    "the op's model-facing description is not overwritten",
  );
});
