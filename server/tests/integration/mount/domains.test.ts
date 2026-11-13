/**
 * The fixture deployments' test domains: one domain for each connector they serve (the till, alpha and source), which
 * names the connector's own skill, whose `allowed-tools` list every op of that connector, so
 * that the deployment's plugins reach the connector through the control plane (K3's `controlOn`).
 *
 * Alpha holds no op: alpha-greet lists none in its `allowed-tools`, and alpha has none, so the skill lists no op. K3
 * (6b6c3b1) reaches the connector that holds a skill a domain names, so alpha-domain reaches alpha on the user's own
 * login, as till-domain reaches the till.
 *
 * Each deployment is mounted from a root of its own (deploymentRoot), as the server mounts it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Card } from "@mku1tra/que-plugin";
import { controlOn } from "@que/control-plane";
import { deploymentRoot } from "../../deployment-root.js";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";

const fixtures = join(import.meta.dirname, "fixtures");

/** The deployment `name`, mounted as the server mounts it: its plugin cards, and each card by name. */
async function mounted(name: string) {
  const { plugins } = await mountDeployment(deploymentRoot(fixtures, name));
  const cards = plugins.map((plugin) => plugin.card);
  return {
    cards,
    card: (plugin: string) => cards.find((card) => card.name === plugin),
  };
}

/** One test domain, the deployment that lists it, and the connector it is for. */
const domains = [
  { domain: "till-domain", deployment: "tools", connector: "till" },
  { domain: "alpha-domain", deployment: "prompt", connector: "alpha" },
  { domain: "source-domain", deployment: "prompt", connector: "source" },
] as const;

/** The que extension of a card: its ops, skills and domains. */
const que = (card: Card) => card.extensions["io.github.matta-kelly.que"];

test("given the fixture deployments the MCP tests serve, when each is mounted, then its plugins list a domain for each connector it serves, and no other", async () => {
  const expected = [
    { deployment: "tools", domains: ["till-domain"] },
    {
      deployment: "prompt",
      domains: ["alpha-domain", "source-domain", "till-domain"],
    },
  ];
  for (const { deployment, domains } of expected) {
    const { cards } = await mounted(deployment);
    assert.deepEqual(
      cards
        .filter((card) => que(card).kind === "domain")
        .map((card) => card.name)
        .sort(),
      domains,
      `${deployment}'s plugins list another set of domains`,
    );
  }
});

test("given each test domain, when its skill is read, then the skill lists each op of the connector the domain is for, which for alpha are none", async () => {
  for (const { domain, deployment, connector } of domains) {
    const { card } = await mounted(deployment);
    const named = card(domain);
    assert.ok(named, `${deployment} lists no ${domain}`);
    const held = card(connector);
    assert.ok(held, `${deployment} lists no ${connector}`);
    // A domain uses no skill of its own (plugin/own-use): the skill it names is its connector's, and lists the
    // connector's ops. Alpha holds no op, so alpha-greet lists none and this holds with two empty lists.
    const skills = que(named).usesSkills;
    assert.deepEqual(
      skills.length,
      1,
      `${domain} names ${skills.length} skills`,
    );
    const guide = que(held).skills.find((skill) => skill.name === skills[0]);
    assert.ok(guide, `${connector} holds no ${skills[0]}`);
    assert.deepEqual(
      [...(guide.uses ?? [])].sort(),
      que(held)
        .ops.map((op) => op.name)
        .sort(),
      `${skills[0]} does not list each of ${connector}'s ops`,
    );
  }
});

test("given each test domain, when the control plane is granted it, then the user reaches its connector and no other", async () => {
  for (const { domain, deployment, connector } of domains) {
    const { cards } = await mounted(deployment);
    const db = await PGlite.create();
    try {
      const control = controlOn(db, cards);
      // `domains()` reads the cards without awaiting the table's setup; wait for it, so closing the database later
      // never races the setup query.
      await control.grantsOf("nobody");
      const described = (await control.domains()).find(
        (candidate) => candidate.name === domain,
      );
      assert.deepEqual(
        described,
        { name: domain, connectors: [connector], roles: [] },
        `${deployment}'s ${domain} does not name ${connector}`,
      );
      await control.grant("ana", domain, "test");
      assert.deepEqual(
        await control.reachOf("ana"),
        { domains: [domain], connectors: [{ name: connector, login: "own" }] },
        `${domain} does not reach ${connector} on the user's own login`,
      );
    } finally {
      await db.close();
    }
  }
});
