import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Card } from "@mku1tra/que-plugin";
import { controlOn } from "./index.js";

// The cards' shape, as @mku1tra/que-plugin writes it: a test fixture needs no plugin code.
type Que = Card["extensions"]["io.github.matta-kelly.que"];
type Op = Que["ops"][number];
type Role = Que["roles"][number];
type Skill = Que["skills"][number];

const op = (
  name: string,
  fields: { role?: string; uses?: string[] } = {},
): Op => ({
  name,
  title: name,
  description: `The op ${name}.`,
  input: {},
  ...fields,
});
const role = (name: string): Role => ({
  name,
  description: `The ${name} role.`,
});
const skill = (name: string, uses?: string[]): Skill => ({
  name,
  ...(uses === undefined ? {} : { uses }),
});
const card = (name: string, nodes: Partial<Que> & Pick<Que, "kind">): Card => ({
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name,
  description: `The ${name} plugin.`,
  extensions: {
    "io.github.matta-kelly.que": {
      format: 6,
      title: name,
      ops: [],
      skills: [],
      roles: [],
      usesOps: [],
      usesSkills: [],
      capabilities: [],
      cases: [],
      ...nodes,
    },
  },
});

// Third-party: reached on the user's own login. `odoo-guide` is a skill it holds, which a domain names.
const odoo = card("odoo", {
  kind: "connector",
  ops: [op("odoo-write"), op("odoo-find")],
  skills: [skill("odoo-guide", ["odoo-write"])],
});
// Internal: each op runs with its role's login. Its skills name the ops they use.
const warehouse = card("warehouse", {
  kind: "connector",
  roles: [role("warehouse-reader"), role("warehouse-writer")],
  ops: [
    op("warehouse-get-fabric", { role: "warehouse-reader" }),
    op("warehouse-load", { role: "warehouse-writer" }),
  ],
  skills: [
    skill("warehouse-stock", ["warehouse-get-fabric"]),
    skill("warehouse-loading", ["warehouse-load"]),
  ],
});
// A second internal connector, reached by no fixture domain: `loginOf` never answers for it here.
const ledger = card("ledger", {
  kind: "connector",
  roles: [role("ledger-reader")],
  ops: [op("ledger-post", { role: "ledger-reader" })],
});
// Domains: `pim` names its connectors through its ops, the rest through their skills.
const pim = card("pim", {
  kind: "domain",
  ops: [op("pim-push", { uses: ["warehouse-get-fabric", "odoo-write"] })],
  usesOps: ["warehouse-get-fabric", "odoo-write"],
});
const sales = card("sales", { kind: "domain", usesSkills: ["odoo-guide"] });
const stock = card("stock", {
  kind: "domain",
  usesSkills: ["warehouse-stock"],
});
const shipping = card("shipping", {
  kind: "domain",
  usesSkills: ["warehouse-loading"],
});

const cards = [odoo, warehouse, ledger, pim, sales, stock, shipping];

test("one user's grant is not another's: a user with no grant reaches no domain and no connector", async () => {
  const cp = controlOn(new PGlite(), cards);
  await cp.grant("ben", "pim", "admin-1");
  assert.deepEqual(await cp.reachOf("ana"), { domains: [], connectors: [] });
  assert.deepEqual(await cp.grantsOf("ana"), []);
  assert.deepEqual(await cp.reachOf("cy"), { domains: [], connectors: [] });
  // The control that makes the claim falsifiable: another user's grant does reach its domain.
  assert.deepEqual(await cp.grantsOf("ben"), ["pim"]);
  assert.deepEqual((await cp.reachOf("ben")).domains, ["pim"]);
});

test("a granted domain reaches it and each connector its ops and skills name, and a revoke reaches neither", async () => {
  const cp = controlOn(new PGlite(), cards);
  await cp.grant("ana", "pim", "admin-1");
  assert.deepEqual(await cp.reachOf("ana"), {
    domains: ["pim"],
    connectors: [
      { name: "odoo", login: "own" },
      { name: "warehouse", login: { roles: ["warehouse-reader"] } },
    ],
  });
  await cp.revoke("ana", "pim");
  assert.deepEqual(await cp.reachOf("ana"), { domains: [], connectors: [] });

  await cp.grant("ben", "sales", "admin-1");
  assert.deepEqual(await cp.reachOf("ben"), {
    domains: ["sales"],
    connectors: [{ name: "odoo", login: "own" }],
  });
  await cp.revoke("ben", "sales");
  assert.deepEqual(await cp.reachOf("ben"), { domains: [], connectors: [] });
});

test("an internal connector reached through a skill gives the roles of the ops that skill uses", async () => {
  const cp = controlOn(new PGlite(), cards);
  await cp.grant("ana", "stock", "admin-1");
  assert.deepEqual(await cp.reachOf("ana"), {
    domains: ["stock"],
    connectors: [{ name: "warehouse", login: { roles: ["warehouse-reader"] } }],
  });
  await cp.grant("ben", "shipping", "admin-1");
  assert.deepEqual(await cp.reachOf("ben"), {
    domains: ["shipping"],
    connectors: [{ name: "warehouse", login: { roles: ["warehouse-writer"] } }],
  });
});

test("a grant of a plugin that is no domain, or that no card names, fails and names it", async () => {
  const cp = controlOn(new PGlite(), cards);
  await assert.rejects(cp.grant("ana", "odoo", "admin-1"), /odoo is no domain/);
  await assert.rejects(cp.grant("ana", "nope", "admin-1"), /nope/);
});

test("a grant of a domain no longer mounted reaches nothing, and is kept", async () => {
  const db = new PGlite();
  const mounted = controlOn(db, cards);
  await mounted.grant("ana", "pim", "admin-1");
  await mounted.grant("ana", "sales", "admin-1");

  // The deployment mounts the same database, with `pim` no longer in it.
  const remounted = controlOn(
    db,
    cards.filter((c) => c.name !== "pim"),
  );
  assert.deepEqual(await remounted.reachOf("ana"), {
    domains: ["sales"],
    connectors: [{ name: "odoo", login: "own" }],
  });
  assert.deepEqual(await remounted.grantsOf("ana"), ["pim", "sales"]);
});

test("loginOf gives the user's own id for a third-party connector, role:<role> for a role a granted domain uses, and none otherwise", async () => {
  const cp = controlOn(new PGlite(), cards);
  await cp.grant("ana", "pim", "admin-1");
  await cp.grant("bo", "shipping", "admin-1");

  assert.equal(await cp.loginOf("ana", "odoo"), "ana");
  assert.equal(
    await cp.loginOf("ana", "warehouse", "warehouse-reader"),
    "role:warehouse-reader",
  );
  assert.equal(
    await cp.loginOf("ana", "warehouse", "warehouse-writer"),
    undefined,
  );
  assert.equal(
    await cp.loginOf("bo", "warehouse", "warehouse-writer"),
    "role:warehouse-writer",
  );
  assert.equal(
    await cp.loginOf("bo", "warehouse", "warehouse-reader"),
    undefined,
  );
  // `ledger` is a card, but no granted domain reaches it; `cy` has no grant at all.
  assert.equal(await cp.loginOf("ana", "ledger", "ledger-reader"), undefined);
  assert.equal(await cp.loginOf("cy", "odoo"), undefined);
});

test("the cards decide each domain's connectors and roles, and each internal connector's roles", async () => {
  const cp = controlOn(new PGlite(), cards);
  assert.deepEqual(await cp.domains(), [
    {
      name: "pim",
      connectors: ["odoo", "warehouse"],
      roles: ["warehouse-reader"],
    },
    { name: "sales", connectors: ["odoo"], roles: [] },
    {
      name: "shipping",
      connectors: ["warehouse"],
      roles: ["warehouse-writer"],
    },
    { name: "stock", connectors: ["warehouse"], roles: ["warehouse-reader"] },
  ]);
  assert.deepEqual(await cp.roles(), [
    { name: "ledger", roles: ["ledger-reader"] },
    { name: "warehouse", roles: ["warehouse-reader", "warehouse-writer"] },
  ]);
});

test("a second setup on one database makes nothing: the table and its grants are as they were", async () => {
  const db = new PGlite();
  const first = controlOn(db, cards);
  await first.grant("ana", "pim", "admin-1");
  const stored = () =>
    db.query<{ user_id: string; domain: string; granted_by: string }>(
      "SELECT user_id, domain, granted_by FROM grants ORDER BY user_id, domain",
    );
  assert.deepEqual((await stored()).rows, [
    { user_id: "ana", domain: "pim", granted_by: "admin-1" },
  ]);

  // The deployment sets the same database up again, at its next mount.
  const second = controlOn(db, cards);

  // The second setup makes nothing: the row is the same row, and the second control plane reads it.
  assert.deepEqual((await stored()).rows, [
    { user_id: "ana", domain: "pim", granted_by: "admin-1" },
  ]);
  assert.deepEqual(await second.grantsOf("ana"), ["pim"]);
  // The one table serves both: a grant made through either is read by the other.
  await second.grant("ben", "sales", "admin-1");
  assert.deepEqual(await first.grantsOf("ben"), ["sales"]);
  const { rows } = await db.query<{ tables: number }>(
    "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'grants'",
  );
  assert.deepEqual(rows, [{ tables: 1 }]);
});
