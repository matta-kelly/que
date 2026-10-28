/**
 * The card on disk: written from a plugin's nodes at publish, and checked against Agent Plugins 1.0's own schema.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cardOf,
  cardText,
  definePlugin,
  validateCard,
  type Card,
} from "@mku1tra/que-plugin";
import { writeCard } from "../../../runtime/src/card/writer.js";

const work = mkdtempSync(join(tmpdir(), "que-card-"));
after(() => rmSync(work, { recursive: true, force: true }));

const source = join(import.meta.dirname, "../mount/fixtures/plugins/source");

const good = cardOf({
  definition: definePlugin({
    name: "notes",
    type: "plugin",
    title: "Notes",
    description: "How the team writes.",
  }),
  cases: [],
});

test("writeCard writes plugin.json from the plugin's nodes, with the version its package.json gives", async () => {
  const dir = join(work, "source");
  cpSync(source, dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    '{ "name": "source", "version": "1.2.0", "type": "module" }\n',
  );
  const file = await writeCard(dir);
  assert.equal(file, join(dir, "plugin.json"));
  const card = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(card.name, "source");
  assert.equal(card.version, "1.2.0");
  assert.deepEqual(
    card.extensions["io.github.matta-kelly.que"].ops.map(
      (op: { name: string }) => op.name,
    ),
    ["source-find"],
  );
});

test("writeCard stops, writing no card, on a plugin that breaks the contract", async () => {
  const dir = join(work, "bad");
  cpSync(join(import.meta.dirname, "../mount/fixtures/plugins/bad"), dir, {
    recursive: true,
  });
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  await assert.rejects(writeCard(dir), /plugin bad is invalid/);
  assert.equal(existsSync(join(dir, "plugin.json")), false);
});

test("validateCard takes a card cardOf makes", () => {
  assert.doesNotThrow(() => validateCard(good, "the card"));
  assert.doesNotThrow(() =>
    validateCard(JSON.parse(cardText(good)), "the card"),
  );
});

test("validateCard refuses a card the standard's schema refuses", () => {
  assert.throws(
    () =>
      validateCard(
        { ...good, name: "Notes", tools: [] } as unknown as Card,
        "the card",
      ),
    (error: Error) => {
      assert.match(error.message, /^the card breaks Agent Plugins 1\.0:/);
      assert.match(error.message, /\/name must match pattern/);
      assert.match(error.message, /must NOT have additional properties/);
      return true;
    },
  );
});
