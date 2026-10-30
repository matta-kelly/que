import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import * as zm from "zod/mini";
import { definePlugin, readDefinition, type Op } from "./contract.ts";

const notes = {
  name: "notes",
  type: "plugin" as const,
  title: "Notes",
  description: "How the team writes things down.",
};

const search = {
  name: "notes-search",
  type: "op" as const,
  title: "Search notes",
  description: "Find notes by a word.",
  input: z.object({ word: z.string().describe("The word to find") }),
  run: async () => [],
};

const read = {
  name: "notes-read",
  type: "access-role" as const,
  description: "Reads the notes.",
};

// The mark basis reads a definition by, under its key in the global symbol registry.
const markOf = (value: object): unknown =>
  Object.getOwnPropertyDescriptor(
    value,
    Symbol.for("@mku1tra/basis/definition"),
  )?.value;

const findNote = {
  name: "find-note",
  type: "capability" as const,
  title: "Find a note",
  description: "A person asks for a note and gets it.",
};

test("definePlugin gives the plugin node, listing what it holds by name, and each node it holds as given", () => {
  const definition = definePlugin({
    ...notes,
    roles: [read],
    ops: [{ ...search, role: "notes-read" }],
    capabilities: [findNote],
  });
  assert.deepEqual(definition.plugin, {
    ...notes,
    ops: ["notes-search"],
    roles: ["notes-read"],
    capabilities: ["find-note"],
  });
  assert.equal(definition.ops[0].run, search.run);
  assert.equal(definition.ops[0].input, search.input);
  assert.deepEqual(definition.roles, [read]);
  assert.deepEqual(definition.capabilities, [findNote]);
});

test("definePlugin marks the plugin node and each node it holds as the definition of its name and type, and not what holds them", () => {
  const definition = definePlugin({
    ...notes,
    roles: [read],
    ops: [{ ...search, role: "notes-read" }],
    capabilities: [findNote],
  });
  assert.deepEqual(
    [
      definition.plugin,
      ...definition.ops,
      ...definition.roles,
      ...definition.capabilities,
    ].map(markOf),
    [
      { name: "notes", type: "plugin" },
      { name: "notes-search", type: "op" },
      { name: "notes-read", type: "access-role" },
      { name: "find-note", type: "capability" },
    ],
  );
  assert.equal(markOf(definition), undefined);
  assert.equal(markOf(definition.ops), undefined);
});

test("definePlugin keeps a plugin's credential, connect and whoami as given", () => {
  const credential = z.object({ url: z.string() });
  const connect = async () => ({});
  const whoami = async () => ({ id: 1, name: "Ada" });
  const { plugin } = definePlugin({ ...notes, credential, connect, whoami });
  assert.equal(plugin.credential, credential);
  assert.equal(plugin.connect, connect);
  assert.equal(plugin.whoami, whoami);
});

test("definePlugin lists every fault of the plugin and of each node it holds, each after its place", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        description: "",
        ops: [{ ...search, title: "" }],
        roles: [{ ...read, description: "" }],
      }),
    {
      message: [
        "plugin notes is invalid:",
        "- description Too small: expected string to have >=1 characters",
        "- ops.notes-search title is missing",
        "- roles.notes-read description Too small: expected string to have >=1 characters",
      ].join("\n"),
    },
  );
});

test("definePlugin refuses a list of what it holds that is not a list", () => {
  assert.throws(
    () => definePlugin({ ...notes, ops: {} as never }),
    /- ops must be an array/,
  );
});

test("definePlugin refuses an op input that is not a zod object", () => {
  assert.throws(
    () => definePlugin({ ...notes, ops: [{ ...search, input: {} as never }] }),
    /- ops\.notes-search input must be a zod object/,
  );
});

test("definePlugin refuses an op input with a field that has no description", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        ops: [{ ...search, input: z.object({ word: z.string() }) }],
      }),
    /- ops\.notes-search input\.word has no description \(add \.describe\(\)\)/,
  );
});

test("definePlugin refuses an op input that a model API cannot take as JSON Schema", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        ops: [
          { ...search, input: z.object({ when: z.date().describe("When") }) },
        ],
      }),
    /- ops\.notes-search input has no JSON Schema form/,
  );
});

test("definePlugin refuses a credential that is not a zod object, and a connect that is not a function", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        credential: {} as never,
        connect: "connect" as never,
      }),
    (error: Error) => {
      assert.match(error.message, /- credential must be a zod object/);
      assert.match(error.message, /- connect must be a function/);
      return true;
    },
  );
});

test("readDefinition reads a definition by its shape, as another copy of the package makes it", () => {
  const definition = definePlugin({ ...notes, ops: [search] });
  const copy = {
    plugin: { ...definition.plugin },
    ops: [{ ...definition.ops[0] }],
    roles: [],
    capabilities: [],
  };
  assert.deepEqual(readDefinition(copy), { definition, faults: [] });
});

test("readDefinition lists each fault of a value that is not a definition, after its place", () => {
  assert.deepEqual(readDefinition("notes"), {
    faults: ["it is not what definePlugin gives"],
  });
  assert.deepEqual(
    readDefinition({
      plugin: { ...notes, ops: [], roles: [], capabilities: [] },
      ops: [{ ...search, title: "" }],
      roles: {},
      capabilities: [],
    }),
    {
      faults: ["ops.notes-search title is missing", "roles must be an array"],
    },
  );
});

test("definePlugin refuses skills and cases on the plugin: its folder gives them", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        skills: ["notes-guide"],
        cases: ["notes-typo"],
      } as never),
    {
      message: [
        "plugin notes is invalid:",
        "- skills are found by folder, in skills/: a plugin's code gives none",
        "- cases are found in cases.ts: a plugin's code gives none",
      ].join("\n"),
    },
  );
});

test("readDefinition refuses skills and cases on the plugin node: its folder gives them", () => {
  const definition = definePlugin(notes);
  assert.deepEqual(
    readDefinition({
      ...definition,
      plugin: { ...definition.plugin, skills: [], cases: ["notes-typo"] },
    }),
    {
      faults: [
        "plugin skills are found by folder, in skills/: a plugin's code gives none",
        "plugin cases are found in cases.ts: a plugin's code gives none",
      ],
    },
  );
});

test("readDefinition gives a fault when the plugin node's list of what it holds is not the nodes it holds", () => {
  const definition = definePlugin({ ...notes, ops: [search] });
  assert.deepEqual(
    readDefinition({
      ...definition,
      plugin: { ...definition.plugin, ops: [] },
    }),
    {
      faults: ["plugin.ops names none, and the definition holds notes-search"],
    },
  );
});

test("definePlugin takes an op input of zod/mini, its fields described in zod's registry", () => {
  const input = zm.object({
    word: zm.string().register(zm.globalRegistry, {
      description: "The word to find",
    }),
  });
  assert.equal(
    definePlugin({ ...notes, ops: [{ ...search, input: input as never }] })
      .ops[0].input,
    input,
  );
});

// Whether two types are the same type, as the compiler reads them.
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** The context an op's run gets. */
type Context<O extends { run(ctx: never, params: never): unknown }> =
  Parameters<O["run"]>[0];

type Conn = { query(sql: string): Promise<unknown[]> };
const word = z.object({ word: z.string().describe("The word to find") });

// A type test: the compiler holds it (tsc, which runs on every test file), and each `@ts-expect-error` is an
// assertion that the line after it does not compile.
test("an op's context follows its kind: a connector op gets { conn }, and a domain op gets { ops }, as its plugin says", () => {
  const connector: Same<Context<Op<Conn, typeof word>>, { conn: Conn }> = true;
  const domain: Same<
    Context<Op<unknown, typeof word, "domain">>,
    { ops: Record<string, (params: unknown) => Promise<unknown>> }
  > = true;

  const find: Op<Conn, typeof word> = {
    ...search,
    input: word,
    run: async ({ conn }, { word }) => conn.query(word),
  };
  const findBy: Op<Conn, typeof word, "connector"> = {
    ...search,
    input: word,
    // @ts-expect-error a connector op's context has no ops
    run: async ({ ops }, { word }) => ops["notes-search"]({ word }),
  };
  const push: Op<unknown, typeof word, "domain"> = {
    ...search,
    name: "pim-push",
    input: word,
    run: async ({ ops }, { word }) => ops["notes-search"]({ word }),
  };
  const pushBy: Op<unknown, typeof word, "domain"> = {
    ...search,
    name: "pim-push",
    input: word,
    // @ts-expect-error a domain op's context has no conn
    run: async ({ conn }) => conn,
  };

  // An op in a plugin's definition takes its context from the plugin's kind.
  const pim = definePlugin({
    ...notes,
    name: "pim",
    kind: "domain",
    ops: [
      {
        ...search,
        name: "pim-push",
        run: async (ctx) => ctx.ops["notes-search"]({ word: "linen" }),
      },
    ],
  });
  definePlugin({
    ...notes,
    name: "pim",
    kind: "domain",
    ops: [
      {
        ...search,
        name: "pim-push",
        // @ts-expect-error a domain's op has no conn
        run: async (ctx) => ctx.conn,
      },
    ],
  });
  definePlugin({
    ...notes,
    ops: [
      {
        ...search,
        // @ts-expect-error a connector's op, by its plugin leaving out its kind, has no ops
        run: async (ctx) => ctx.ops["notes-read"]({}),
      },
    ],
  });

  assert.equal(connector && domain, true);
  assert.deepEqual(
    [find, findBy, push, pushBy].map(({ input }) => input),
    [word, word, word, word],
  );
  assert.equal(pim.plugin.kind, "domain");
});
