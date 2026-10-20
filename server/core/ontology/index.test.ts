import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as z from "zod";
import { base, linksOf } from "basis";
import { harness, plugin, que } from "@que/core/ontology";

type Name = keyof typeof plugin.types | keyof typeof harness.types;

/** A note parsed by the schema that holds its type. */
const parse = (type: Name, node: unknown): unknown =>
  type in plugin.types
    ? plugin.parse(type as keyof typeof plugin.types, node)
    : harness.parse(type as keyof typeof harness.types, node);

/**
 * The files of basis that importing `specifier` loads, in a new process, so that
 * nothing this test file has imported counts.
 */
const basisLoadedBy = (specifier: string) =>
  new Promise<string[]>((resolve, reject) => {
    const probe = `
      import { registerHooks } from "node:module";
      const loaded = [];
      registerHooks({
        resolve(specifier, context, nextResolve) {
          const resolved = nextResolve(specifier, context);
          if (resolved.url.includes("/node_modules/basis/")) loaded.push(resolved.url);
          return resolved;
        },
      });
      await import(${JSON.stringify(specifier)});
      console.log(JSON.stringify(loaded));
    `;
    execFile(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", probe],
      { cwd: import.meta.dirname, timeout: 20_000 },
      (error, out) =>
        error ? reject(error) : resolve(JSON.parse(out) as string[]),
    );
  });

test("@que/core/ontology gives the schemas plugin and harness, and harness imports plugin", () => {
  assert.deepEqual(Object.keys(plugin.types), [
    "plugin",
    "op",
    "skill",
    "capability",
    "case",
  ]);
  assert.deepEqual(plugin.imports, []);
  assert.deepEqual(Object.keys(harness.types), [
    "agent",
    "model",
    "loop",
    "deployment",
  ]);
  assert.deepEqual(harness.imports, [plugin]);
});

test("que, deprecated, holds the nine types of plugin and harness, as the same objects", () => {
  const nine = { ...plugin.types, ...harness.types };
  assert.equal(que.name, "que");
  assert.deepEqual(Object.keys(que.types), Object.keys(nine));
  for (const [name, type] of Object.entries(que.types))
    assert.equal(type, nine[name as Name], name);
  assert.equal(typeof que.parse, "function");
});

test("importing @que/core does not load basis, and importing @que/core/ontology does", async () => {
  assert.deepEqual(await basisLoadedBy("@que/core"), []);
  // The probe sees basis when it is loaded, so the empty list above is not for want of looking.
  assert.notDeepEqual(await basisLoadedBy("@que/core/ontology"), []);
});

const odoo = {
  name: "odoo",
  type: "plugin",
  description: "Odoo, the ERP.",
  title: "Odoo",
  ops: ["[[find-partners]]", "[[read-partner]]"],
  skills: ["[[odoo-search]]"],
  capabilities: ["[[find-company]]"],
};

const findCompany = {
  name: "find-company-by-name",
  type: "case",
  description: "The agent finds a company the user names.",
  capability: "[[find-company]]",
};

/** The note with these fields left out. */
const without = (node: Record<string, unknown>, ...fields: string[]) =>
  Object.fromEntries(
    Object.entries(node).filter(([field]) => !fields.includes(field)),
  );

/** The one issue a parse that fails gives, so a test can say why it failed. */
const issueOf = (type: Name, node: unknown) => {
  try {
    parse(type, node);
  } catch (error) {
    assert.ok(error instanceof z.ZodError);
    assert.equal(error.issues.length, 1);
    return error.issues[0];
  }
  assert.fail(`the ${type} note parsed`);
};

test("an odoo plugin note with its ops, a skill and find-company parses", () => {
  assert.deepEqual(parse("plugin", odoo), {
    ...odoo,
    ops: ["find-partners", "read-partner"],
    skills: ["odoo-search"],
    capabilities: ["find-company"],
  });
});

test("an op, a skill and a capability note each parse with a title", () => {
  for (const type of ["op", "skill", "capability"] as const) {
    const node = {
      name: "find-company",
      type,
      description: "Finds a company.",
      title: "Find a company",
    };
    assert.deepEqual(parse(type, node), node);
  }
});

test("a find-company case note parses", () => {
  assert.deepEqual(parse("case", findCompany), {
    ...findCompany,
    capability: "find-company",
  });
});

test("a note with no description fails, on its description", () => {
  const issue = issueOf("plugin", without(odoo, "description"));
  assert.equal(issue.code, "invalid_type");
  assert.deepEqual(issue.path, ["description"]);
});

/** A note of each type that has a title: plugin, op, skill and capability. */
const titled = (["plugin", "op", "skill", "capability"] as const).map(
  (type) => ({
    name: "find-company",
    type,
    description: "Finds a company.",
    title: "Find a company",
  }),
);

test("a plugin, op, skill or capability note with no title fails, on its title", () => {
  for (const node of titled) {
    const issue = issueOf(node.type, without(node, "title"));
    assert.equal(issue.code, "invalid_type");
    assert.deepEqual(issue.path, ["title"]);
  }
});

test("a plugin, op, skill or capability note with a blank title fails, on its title", () => {
  for (const node of titled) {
    for (const blank of ["", " "]) {
      const issue = issueOf(node.type, { ...node, title: blank });
      assert.equal(issue.code, "invalid_format");
      assert.deepEqual(issue.path, ["title"]);
    }
  }
});

test("a note with a field not on its type fails, on that field", () => {
  // A case's input is a value the code holds, so a case note does not carry it.
  const issue = issueOf("case", { ...findCompany, input: "find Acme" });
  assert.equal(issue.code, "unrecognized_keys");
  assert.deepEqual(issue.keys, ["input"]);
});

test("a case that names two capabilities fails, on its capability", () => {
  const issue = issueOf("case", {
    ...findCompany,
    capability: ["[[find-company]]", "[[find-contact]]"],
  });
  assert.equal(issue.code, "invalid_type");
  assert.deepEqual(issue.path, ["capability"]);
});

test("a case with no capability fails, on its capability", () => {
  const issue = issueOf("case", without(findCompany, "capability"));
  assert.equal(issue.code, "invalid_type");
  assert.deepEqual(issue.path, ["capability"]);
});

test("a plugin note with no ops, skills or capabilities parses", () => {
  const node = without(odoo, "ops", "skills", "capabilities");
  assert.deepEqual(parse("plugin", node), node);
});

const chat = {
  name: "chat",
  type: "agent",
  description: "The agent a chat gets.",
  packages: ["[[odoo]]"],
  model: "[[glm-flash]]",
  loop: "[[long-chat]]",
};

const landl = {
  name: "landl",
  type: "deployment",
  description: "The landl deployment.",
  packages: ["[[odoo]]"],
  agents: ["[[chat]]"],
  loops: ["[[long-chat]]"],
  models: ["[[glm-flash]]"],
};

test("a chat agent note that uses odoo, runs on glm-flash, with the long-chat loop, parses", () => {
  assert.deepEqual(parse("agent", chat), {
    ...chat,
    packages: ["odoo"],
    model: "glm-flash",
    loop: "long-chat",
  });
});

test("a landl deployment note parses", () => {
  assert.deepEqual(parse("deployment", landl), {
    ...landl,
    packages: ["odoo"],
    agents: ["chat"],
    loops: ["long-chat"],
    models: ["glm-flash"],
  });
});

test("an agent with two models fails, on its model", () => {
  const issue = issueOf("agent", {
    ...chat,
    model: ["[[glm-flash]]", "[[minimax-m3]]"],
  });
  assert.equal(issue.code, "invalid_type");
  assert.deepEqual(issue.path, ["model"]);
});

test("an agent with two loops fails, on its loop", () => {
  const issue = issueOf("agent", {
    ...chat,
    loop: ["[[long-chat]]", "[[short-run]]"],
  });
  assert.equal(issue.code, "invalid_type");
  assert.deepEqual(issue.path, ["loop"]);
});

test("a deployment with no packages fails, on its packages", () => {
  const missing = issueOf("deployment", without(landl, "packages"));
  assert.equal(missing.code, "invalid_type");
  assert.deepEqual(missing.path, ["packages"]);
  const empty = issueOf("deployment", { ...landl, packages: [] });
  assert.equal(empty.code, "too_small");
  assert.deepEqual(empty.path, ["packages"]);
});

test("an agent, model, loop or deployment type has no field but its links", () => {
  // Each value stays in the config file, so a note of these types carries its links and no field.
  for (const name of ["agent", "model", "loop", "deployment"] as const) {
    const type = harness.types[name];
    const fields = Object.keys(type.schema.shape).filter(
      (field) => !Object.hasOwn(base, field),
    );
    assert.deepEqual(
      fields,
      linksOf(type).map((link) => link.name),
      name,
    );
  }
});

test("an agent note with no packages parses, and one with no model or no loop fails, on that link", () => {
  // Left out, packages is none. que has no model or loop of its own, so an agent names each.
  const node = without(chat, "packages");
  assert.deepEqual(parse("agent", node), {
    ...node,
    model: "glm-flash",
    loop: "long-chat",
  });
  for (const link of ["model", "loop"]) {
    const issue = issueOf("agent", without(chat, link));
    assert.equal(issue.code, "invalid_type", link);
    assert.deepEqual(issue.path, [link]);
  }
});

test("an agent note that writes its packages as [] parses", () => {
  // The config writes none as `[]`, and basis 0.2.0 takes `[]` on an optional many link.
  assert.deepEqual(parse("agent", { ...chat, packages: [] }), {
    ...chat,
    packages: [],
    model: "glm-flash",
    loop: "long-chat",
  });
});

test("a deployment note with no agents, no loops or no models fails, on that link", () => {
  for (const link of ["agents", "loops", "models"]) {
    const missing = issueOf("deployment", without(landl, link));
    assert.equal(missing.code, "invalid_type", link);
    assert.deepEqual(missing.path, [link]);
    const empty = issueOf("deployment", { ...landl, [link]: [] });
    assert.equal(empty.code, "too_small", link);
    assert.deepEqual(empty.path, [link]);
  }
});

test("a model and a loop note each parse with no field beyond the base", () => {
  for (const type of ["model", "loop"] as const) {
    const node = { name: "glm-flash", type, description: "A config." };
    assert.deepEqual(parse(type, node), node);
  }
});
