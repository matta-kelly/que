import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { lintRoot, type Piece } from "@mku1tra/basis";
import { plugin } from "@mku1tra/que-plugin";
import { folderWith, url } from "../../tests/roots.ts";
import * as exported from "./index.ts";

const { harness } = exported;

test("@mku1tra/que-harness gives the schema harness, which imports plugin", () => {
  assert.deepEqual(Object.keys(harness.types), ["deployment"]);
  assert.deepEqual(harness.imports, [plugin]);
});

const landl = {
  name: "landl",
  type: "deployment",
  description: "The landl deployment.",
  plugins: ["warehouse"],
};

test("a deployment names its plugins, none or more, and nothing else", () => {
  assert.deepEqual(harness.parse("deployment", landl), landl);
  const bare = {
    name: landl.name,
    type: landl.type,
    description: landl.description,
  };
  assert.deepEqual(harness.parse("deployment", bare), bare);
  assert.throws(() =>
    harness.parse("deployment", { ...landl, agents: ["chat"] }),
  );
});

/** A piece as a source gives it: the lint names its source. */
type Given = Omit<Piece, "source">;

/**
 * The problems of a root whose schema imports the harness schema, and whose one source, code, gives `pieces`: the
 * pieces of a deployment as its code gives them, linted from its root.
 */
const said = async (pieces: Given[]) => {
  const { folder, remove } = await folderWith({
    "basis.config.ts": `import { defineSchema } from ${url.basis};
import { harness } from ${url.harness};
const pieces = ${JSON.stringify(pieces)};
export default {
  schema: defineSchema({
    name: "pieces",
    description: "A deployment's pieces, as its code gives them.",
    types: {},
    imports: [harness],
    notes: new URL("./", import.meta.url),
    sources: [function code() { return { pieces, problems: [], unread: [] }; }],
  }),
};
`,
  });
  try {
    return (await lintRoot(folder)).problems.map(
      ({ path, rule, field, message }) => [path, rule, field, message],
    );
  } finally {
    await remove();
  }
};

const piece = ({ name, ...fields }: Record<string, unknown>): Given => ({
  path: `${String(name)}.ts`,
  name: String(name),
  fields,
});

test("a deployment that names no plugin has no problem", async () => {
  assert.deepEqual(await said([piece({ ...landl, plugins: [] })]), []);
});

test("a deployment's link to a plugin that is no node fails basis/link at its plugins", async () => {
  const problems = await said([piece(landl)]);
  assert.deepEqual(
    problems.map(([path, rule, field]) => [path, rule, field]),
    [["landl.ts", "basis/link", "/plugins"]],
  );
});

// The folder of type notes is the harness schema's own root: its lint runs basis/one-definition over the package's
// exports, as the CLI does.
test("the lint of the harness schema's root finds no problem: each type note gives only prose, and each zod object the package exports is part of a type", async () => {
  const folder = fileURLToPath(harness.typeNotes!);
  assert.deepEqual((await lintRoot(folder)).problems, []);
});
