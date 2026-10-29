import { test } from "node:test";
import assert from "node:assert/strict";
import { lintRoot } from "@mku1tra/basis";
import * as z from "zod";
import { folderWith, url } from "../../tests/roots.ts";
import { definePlugin, type Op } from "./contract.ts";
import { pluginFiles } from "./layout.ts";
import { piecesOf } from "./pieces.ts";

const find = (plugin: string): Op => ({
  name: `${plugin}-find`,
  type: "op",
  title: "Find",
  description: "Finds a thing.",
  input: z.object({}),
  run: async () => ({}),
});

test("piecesOf gives each node as code gives it, and the plugin's skills as its folders", () => {
  const given = piecesOf({
    dir: "odoo",
    files: pluginFiles("odoo"),
    definition: definePlugin({
      name: "odoo",
      type: "plugin",
      title: "Odoo",
      description: "A plugin.",
      ops: [find("odoo")],
    }),
    cases: [],
    skills: [],
    skillNames: ["odoo-guide"],
    problems: [],
  });
  assert.deepEqual(
    given.map(({ path, name }) => [path, name]),
    [
      [definitionOf("odoo"), "odoo"],
      [`${definitionOf("odoo")}#ops/odoo-find`, "odoo-find"],
    ],
  );
  assert.deepEqual(given[0].fields.skills, ["odoo-guide"]);
  assert.equal(typeof given[1].fields.run, "function");
});

/** What a plugin holds beside its one skill, `<name>-guide`: each op by its role, `<name>-find` when it names none. */
type Held = {
  usesOps?: string[];
  usesSkills?: string[];
  roles?: string[];
  /** Its ops, each `<name>-find`, by the role each names, if any. One with no role when none is given. */
  ops?: (string | undefined)[];
  capabilities?: string[];
  /** Its cases, each about the capability named. */
  cases?: string[];
};

const text = (value: unknown) => JSON.stringify(value);

/** The files of a plugin `name`, under its folder `<name>`, with one skill, `<name>-guide`, and what it holds. */
function plugin(name: string, held: Held = {}): Record<string, string> {
  const {
    usesOps,
    usesSkills,
    roles,
    ops = [undefined],
    capabilities,
    cases = [],
  } = held;
  const fields = [
    `name: ${text(name)}`,
    'type: "plugin"',
    `title: ${text(name)}`,
    'description: "A plugin."',
    usesOps && `usesOps: ${text(usesOps)}`,
    usesSkills && `usesSkills: ${text(usesSkills)}`,
    roles &&
      `roles: ${text(roles.map((role) => ({ name: role, type: "access-role", description: "A login." })))}`,
    `ops: [${ops
      .map(
        (role) =>
          `{ name: ${text(`${name}-find`)}, type: "op", title: "Find", description: "Finds a thing.", ${role ? `role: ${text(role)}, ` : ""}input: z.object({}), run: async () => ({}) }`,
      )
      .join(", ")}]`,
    capabilities &&
      `capabilities: ${text(capabilities.map((capability) => ({ name: capability, type: "capability", title: capability, description: "An outcome." })))}`,
  ].filter(Boolean);
  const imports = `import { definePlugin, defineCases } from ${url.plugin};
import * as z from ${url.zod};
`;
  return {
    [`${name}/package.json`]: `{ "name": ${text(name)}, "type": "module" }\n`,
    [`${name}/io.github.matta-kelly.que/index.ts`]: `${imports}export default definePlugin({ ${fields.join(", ")} });\n`,
    ...(cases.length && {
      [`${name}/io.github.matta-kelly.que/cases.ts`]: `${imports}export default defineCases(${text(
        cases.map((capability) => ({
          name: `${capability}-asked`,
          type: "case",
          description: "A behaviour of its capability.",
          capability,
          input: "Do it.",
          start: "Any.",
          good: "It is done.",
        })),
      )});\n`,
    }),
    [`${name}/skills/${name}-guide/SKILL.md`]: `---\nname: ${name}-guide\ndescription: How to find.\nmetadata:\n  title: Guide\n---\nFind it.\n`,
  };
}

/**
 * The problems of a root that holds the plugins given, each in a folder of its own, linted as one graph with the
 * plugin schema: its source is the plugins under it (plugins), as a plugin's own root is.
 */
async function said(...plugins: Record<string, string>[]) {
  const { folder, remove } = await folderWith(
    Object.assign(
      {
        "basis.config.ts": `import { pluginSchema } from ${url.plugin};
export default {
  schema: pluginSchema({
    name: "plugins",
    description: "Plugins, linted as one graph.",
    root: new URL("./", import.meta.url),
  }),
};
`,
      },
      ...plugins,
    ),
    "que-plugins-",
  );
  try {
    return (await lintRoot(folder)).problems.map(
      ({ path, rule, field, message }) => [path, rule, field, message],
    );
  } finally {
    await remove();
  }
}

const definitionOf = (name: string) =>
  `${name}/io.github.matta-kelly.que/index.ts`;

test("a root of plugins finds a name a plugin's ops use that is a skill", async () => {
  assert.deepEqual(
    (
      await said(plugin("odoo"), plugin("pim", { usesOps: ["odoo-guide"] }))
    ).map(([path, rule, field]) => [path, rule, field]),
    [[definitionOf("pim"), "basis/link", "/usesOps"]],
  );
});

test("a root of plugins finds a plugin that uses an op of a plugin that uses others, naming both", async () => {
  const problems = await said(
    plugin("odoo"),
    plugin("pim", { usesOps: ["odoo-find"] }),
    plugin("sales", { usesOps: ["pim-find"] }),
  );
  assert.deepEqual(
    problems.map(([path, rule, field]) => [path, rule, field]),
    [[definitionOf("sales"), "plugin/connector-use", "/usesOps"]],
  );
  assert.match(
    String(problems[0]?.[3]),
    /^pim-find is pim's, and pim uses other plugins' ops and skills/,
  );
});

test("a root of plugins finds a plugin that uses its own skill", async () => {
  assert.deepEqual(
    await said(plugin("notes", { usesSkills: ["notes-guide"] })),
    [
      [
        definitionOf("notes"),
        "plugin/own-use",
        "/usesSkills",
        "notes-guide is its own: a plugin uses only other plugins' ops and skills.",
      ],
    ],
  );
});

test("a root of plugins takes a plugin whose ops each name one of its roles", async () => {
  assert.deepEqual(
    await said(plugin("notes", { roles: ["notes-read"], ops: ["notes-read"] })),
    [],
  );
});

test("a root of plugins finds an op with no role when its plugin lists roles", async () => {
  assert.deepEqual(await said(plugin("notes", { roles: ["notes-read"] })), [
    [
      definitionOf("notes"),
      "plugin/op-role",
      "/ops/0",
      "notes-find names no role: the plugin lists roles (notes-read), so each op names one.",
    ],
  ]);
});

test("a root of plugins finds an op that names another plugin's role", async () => {
  assert.deepEqual(
    (
      await said(
        plugin("odoo", { roles: ["odoo-admin"], ops: ["odoo-admin"] }),
        plugin("notes", { ops: ["odoo-admin"] }),
      )
    ).filter(([path]) => path === definitionOf("notes")),
    [
      [
        definitionOf("notes"),
        "plugin/op-role",
        "/ops/0",
        "notes-find names the role odoo-admin, which is not its plugin's: the plugin lists none.",
      ],
    ],
  );
});

test("a root of plugins finds an op whose role is no node once, by basis/link", async () => {
  assert.deepEqual(await said(plugin("notes", { ops: ["notes-admin"] })), [
    [
      `${definitionOf("notes")}#ops/notes-find`,
      "basis/link",
      "/role",
      "It points at notes-admin, which is not a node.",
    ],
  ]);
});

test("a root of plugins takes a plugin whose cases are each about a capability it lists", async () => {
  assert.deepEqual(
    await said(
      plugin("odoo", {
        capabilities: ["find-company"],
        cases: ["find-company"],
      }),
    ),
    [],
  );
});

test("a root of plugins finds a case about another plugin's capability, in one graph", async () => {
  assert.deepEqual(
    await said(
      plugin("warehouse", { capabilities: ["find-fabric"] }),
      plugin("odoo", { cases: ["find-fabric"] }),
    ),
    [
      [
        definitionOf("odoo"),
        "plugin/case-capability",
        "/cases/0",
        "find-fabric-asked is about find-fabric, which odoo does not list: a case is about a capability of the plugin that holds it.",
      ],
    ],
  );
});

test("a root of plugins takes a name a plugin uses that none of them gives: it is the deployment's to give", async () => {
  assert.deepEqual(
    await said(
      plugin("pim", { usesOps: ["odoo-find"], usesSkills: ["odoo-guide"] }),
    ),
    [],
  );
});
