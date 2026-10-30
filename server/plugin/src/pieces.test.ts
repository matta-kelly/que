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
  /** The kind it says, written as given. None when left out. */
  kind?: string;
  /** A credential, a zod object of one url, when true. */
  credential?: boolean;
  /** A connect, when true. */
  connect?: boolean;
  /** A whoami, when true. */
  whoami?: boolean;
  /** What its skill, `<name>-guide`, lists in its allowed-tools, space-separated. None when left out. */
  skillUses?: string[];
  /** What its ops, each `<name>-find`, list in their uses. None when left out. */
  opUses?: string[];
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
    kind,
    credential,
    connect,
    whoami,
    skillUses,
    opUses,
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
    kind && `kind: ${text(kind)}`,
    credential && "credential: z.object({ url: z.string() })",
    connect && "connect: async () => ({})",
    whoami && 'whoami: async () => ({ id: 1, name: "Que" })',
    usesOps && `usesOps: ${text(usesOps)}`,
    usesSkills && `usesSkills: ${text(usesSkills)}`,
    roles &&
      `roles: ${text(roles.map((role) => ({ name: role, type: "access-role", description: "A login." })))}`,
    `ops: [${ops
      .map(
        (role) =>
          `{ name: ${text(`${name}-find`)}, type: "op", title: "Find", description: "Finds a thing.", ${role ? `role: ${text(role)}, ` : ""}${opUses ? `uses: ${text(opUses)}, ` : ""}input: z.object({}), run: async () => ({}) }`,
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
    [`${name}/skills/${name}-guide/SKILL.md`]: `---\nname: ${name}-guide\ndescription: How to find.\n${skillUses ? `allowed-tools: ${text(skillUses.join(" "))}\n` : ""}metadata:\n  title: Guide\n---\nFind it.\n`,
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
      await said(
        plugin("odoo"),
        plugin("pim", { kind: "domain", usesOps: ["odoo-guide"] }),
      )
    ).map(([path, rule, field]) => [path, rule, field]),
    [[definitionOf("pim"), "basis/link", "/usesOps"]],
  );
});

test("a root of plugins finds a plugin that uses an op of a plugin that uses others, naming both", async () => {
  const problems = await said(
    plugin("odoo"),
    plugin("pim", { kind: "domain", usesOps: ["odoo-find"] }),
    plugin("sales", { kind: "domain", usesOps: ["pim-find"] }),
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
    await said(
      plugin("notes", { kind: "domain", usesSkills: ["notes-guide"] }),
    ),
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
      plugin("pim", {
        kind: "domain",
        usesOps: ["odoo-find"],
        usesSkills: ["odoo-guide"],
      }),
    ),
    [],
  );
});

/** Each problem as [path, field, message], after its fields are seen: each is a rule of the plugin schema's. */
const at = (problems: unknown[][]) =>
  problems.map(([path, , field, message]) => [path, field, message]);

const ruled = (problems: unknown[][]) => {
  for (const [, rule] of problems) assert.match(String(rule), /^plugin\//);
};

test("a root of plugins takes a plugin with no kind as a connector: its credential, connect and roles are valid, and so are those of one that says kind connector", async () => {
  for (const kind of [undefined, "connector"])
    assert.deepEqual(
      await said(
        plugin("odoo", {
          kind,
          credential: true,
          connect: true,
          roles: ["odoo-read"],
          ops: ["odoo-read"],
        }),
      ),
      [],
      `kind ${kind}`,
    );
});

test("a root of plugins takes a domain that holds no connection: no credential, no connect and no roles", async () => {
  assert.deepEqual(
    await said(
      plugin("odoo", { credential: true, connect: true }),
      plugin("pim", { kind: "domain", usesOps: ["odoo-find"] }),
    ),
    [],
  );
});

test("a root of plugins finds a domain with a credential, a connect or roles, naming each field", async () => {
  const domain = (held: Held) =>
    said(plugin("pim", { kind: "domain", ...held }));
  const cases: [Held, string][] = [
    [{ credential: true }, "/credential"],
    [{ connect: true }, "/connect"],
    [{ roles: ["pim-read"], ops: ["pim-read"] }, "/roles"],
  ];
  for (const [held, field] of cases) {
    const got = await domain(held);
    const problems = at(got);
    assert.deepEqual(
      problems.map(([path, where]) => [path, where]),
      [[definitionOf("pim"), field]],
      field,
    );
    ruled(got);
    assert.match(String(problems[0][2]), new RegExp(field.slice(1)));
    assert.match(String(problems[0][2]), /domain/);
  }
  assert.deepEqual(
    at(
      await domain({
        credential: true,
        connect: true,
        roles: ["pim-read"],
        ops: ["pim-read"],
      }),
    ).map(([path, field]) => [path, field]),
    [
      [definitionOf("pim"), "/credential"],
      [definitionOf("pim"), "/connect"],
      [definitionOf("pim"), "/roles"],
    ],
  );
});

test("a root of plugins finds usesOps and usesSkills on a plugin that does not say kind domain, saying a domain says its kind", async () => {
  for (const kind of [undefined, "connector"]) {
    const found = await said(
      plugin("odoo"),
      plugin("pim", {
        kind,
        usesOps: ["odoo-find"],
        usesSkills: ["odoo-guide"],
      }),
    );
    const problems = at(found);
    assert.deepEqual(
      problems.map(([path, field]) => [path, field]),
      [
        [definitionOf("pim"), "/usesOps"],
        [definitionOf("pim"), "/usesSkills"],
      ],
      `kind ${kind}`,
    );
    ruled(found);
    for (const [, , message] of problems)
      assert.match(String(message), /a domain says its kind/);
  }
});

const skillOf = (name: string) => `${name}/skills/${name}-guide/SKILL.md`;

test("a root of plugins takes a skill whose allowed-tools are ops, and finds each name that is no op, by basis/link on its uses", async () => {
  assert.deepEqual(
    await said(
      plugin("odoo", { skillUses: ["odoo-find"] }),
      plugin("pim", { kind: "domain", skillUses: ["odoo-find"] }),
    ),
    [],
  );
  const cases: [string, RegExp][] = [
    ["odoo-gone", /^It points at odoo-gone, which is not a node\.$/],
    // A skill is a node, and not an op.
    ["odoo-guide", /odoo-guide/],
  ];
  for (const [name, message] of cases) {
    const problems = await said(
      plugin("odoo", { skillUses: ["odoo-find", name] }),
    );
    assert.deepEqual(
      problems.map(([path, rule, field]) => [path, rule, field]),
      [[skillOf("odoo"), "basis/link", "/uses"]],
      name,
    );
    assert.match(String(problems[0][3]), message, name);
  }
});

test("a root of plugins finds a domain that gives whoami, as one with a credential, a connect or roles, and takes a connector's", async () => {
  assert.deepEqual(
    await said(
      plugin("odoo", { credential: true, connect: true, whoami: true }),
    ),
    [],
  );
  const cases: [Held, string[]][] = [
    [{ whoami: true }, ["/whoami"]],
    [{ connect: true, whoami: true }, ["/connect", "/whoami"]],
  ];
  for (const [held, fields] of cases) {
    const got = await said(plugin("pim", { kind: "domain", ...held }));
    ruled(got);
    const problems = at(got);
    assert.deepEqual(
      problems.map(([path, field]) => [path, field]).sort(),
      fields.map((field) => [definitionOf("pim"), field]),
      fields.join(" "),
    );
    const whoami = problems.find(([, field]) => field === "/whoami");
    assert.match(String(whoami?.[2]), /whoami/);
    assert.match(String(whoami?.[2]), /domain/);
  }
});

const opOf = (name: string) => `${definitionOf(name)}#ops/${name}-find`;

test("a root of plugins takes an op whose uses are ops, and finds each name that is no op, by basis/link on its uses", async () => {
  assert.deepEqual(
    await said(
      plugin("odoo"),
      plugin("warehouse"),
      plugin("pim", {
        kind: "domain",
        opUses: ["odoo-find", "warehouse-find"],
      }),
    ),
    [],
  );
  const cases: [string, RegExp][] = [
    ["odoo-gone", /^It points at odoo-gone, which is not a node\.$/],
    // A skill is a node, and not an op.
    ["odoo-guide", /odoo-guide/],
  ];
  for (const [name, message] of cases) {
    const problems = await said(
      plugin("odoo"),
      plugin("pim", { kind: "domain", opUses: ["odoo-find", name] }),
    );
    assert.deepEqual(
      problems.map(([path, rule, field]) => [path, rule, field]),
      [[opOf("pim"), "basis/link", "/uses"]],
      name,
    );
    assert.match(String(problems[0][3]), message, name);
  }
});

test("a root of plugins finds an op of a connector that lists anything in its uses, and takes one that lists none", async () => {
  for (const kind of [undefined, "connector"])
    assert.deepEqual(
      await said(plugin("odoo", { kind, opUses: [] })),
      [],
      `kind ${kind}`,
    );
  const cases: [string, Held, Record<string, string>[]][] = [
    // Another connector's op.
    ["warehouse", { opUses: ["odoo-find"] }, [plugin("odoo")]],
    [
      "warehouse",
      { kind: "connector", opUses: ["odoo-find"] },
      [plugin("odoo")],
    ],
    // Its own op.
    ["odoo", { opUses: ["odoo-find"] }, []],
  ];
  for (const [name, held, others] of cases) {
    const got = await said(...others, plugin(name, held));
    const label = `${name} ${JSON.stringify(held)}`;
    assert.equal(got.length, 1, label);
    ruled(got);
    const [[path, , , message]] = got;
    assert.ok(String(path).startsWith(definitionOf(name)), label);
    assert.match(String(message), new RegExp(`${name}-find`), label);
    assert.match(String(message), /connector/, label);
  }
});

test("a root of plugins finds a name a domain's op lists that is no connector's op, and takes a connector's", async () => {
  for (const kind of [undefined, "connector"])
    assert.deepEqual(
      await said(
        plugin("odoo", { kind }),
        plugin("pim", { kind: "domain", opUses: ["odoo-find"] }),
      ),
      [],
      `kind ${kind}`,
    );
  const cases: [string, Record<string, string>[]][] = [
    // Another domain's op.
    [
      "pim-find",
      [
        plugin("odoo"),
        plugin("pim", { kind: "domain", opUses: ["odoo-find"] }),
        plugin("sales", { kind: "domain", opUses: ["pim-find"] }),
      ],
    ],
    // Its own op, which is a domain's.
    [
      "sales-find",
      [plugin("sales", { kind: "domain", opUses: ["sales-find"] })],
    ],
  ];
  for (const [name, plugins] of cases) {
    const got = await said(...plugins);
    assert.equal(got.length, 1, name);
    ruled(got);
    const [[path, , , message]] = got;
    assert.ok(String(path).startsWith(definitionOf("sales")), name);
    assert.match(String(message), new RegExp(name), name);
    assert.match(String(message), /connector/, name);
  }
});
