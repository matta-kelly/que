import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as z from "zod";
import { base, linksOf } from "basis";
import { que } from "@que/core/ontology";

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

test("@que/core/ontology gives a basis schema named que", async () => {
  assert.equal(que.name, "que");
  assert.equal(typeof que.parse, "function");
});

test("importing @que/core does not load basis, and importing @que/core/ontology does", async () => {
  assert.deepEqual(await basisLoadedBy("@que/core"), []);
  // The probe sees basis when it is loaded, so the empty list above is not for want of looking.
  assert.notDeepEqual(await basisLoadedBy("@que/core/ontology"), []);
});

const odoo = {
  name: "odoo",
  type: "package",
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
const issueOf = (type: keyof typeof que.types, node: unknown) => {
  try {
    que.parse(type, node);
  } catch (error) {
    assert.ok(error instanceof z.ZodError);
    assert.equal(error.issues.length, 1);
    return error.issues[0];
  }
  assert.fail(`the ${type} note parsed`);
};

test("an odoo package note with its ops, a skill and find-company parses", () => {
  assert.deepEqual(que.parse("package", odoo), {
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
    assert.deepEqual(que.parse(type, node), node);
  }
});

test("a find-company case note parses", () => {
  assert.deepEqual(que.parse("case", findCompany), {
    ...findCompany,
    capability: "find-company",
  });
});

test("a note with no description fails, on its description", () => {
  const issue = issueOf("package", without(odoo, "description"));
  assert.equal(issue.code, "invalid_type");
  assert.deepEqual(issue.path, ["description"]);
});

/** A note of each type that has a title: package, op, skill and capability. */
const titled = (["package", "op", "skill", "capability"] as const).map(
  (type) => ({
    name: "find-company",
    type,
    description: "Finds a company.",
    title: "Find a company",
  }),
);

test("a package, op, skill or capability note with no title fails, on its title", () => {
  for (const node of titled) {
    const issue = issueOf(node.type, without(node, "title"));
    assert.equal(issue.code, "invalid_type");
    assert.deepEqual(issue.path, ["title"]);
  }
});

test("a package, op, skill or capability note with a blank title fails, on its title", () => {
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

test("a package note with no ops, skills or capabilities parses", () => {
  const node = without(odoo, "ops", "skills", "capabilities");
  assert.deepEqual(que.parse("package", node), node);
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
  assert.deepEqual(que.parse("agent", chat), {
    ...chat,
    packages: ["odoo"],
    model: "glm-flash",
    loop: "long-chat",
  });
});

test("a landl deployment note parses", () => {
  assert.deepEqual(que.parse("deployment", landl), {
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
    const type = que.types[name];
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
  assert.deepEqual(que.parse("agent", node), {
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
  assert.deepEqual(que.parse("agent", { ...chat, packages: [] }), {
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
    assert.deepEqual(que.parse(type, node), node);
  }
});
