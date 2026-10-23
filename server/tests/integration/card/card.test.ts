/**
 * The card on disk: written from a plugin's definition, checked against Agent Plugins 1.0's own schema and
 * against que's part.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardOf, cardText, definePlugin } from "@que/core";
import { validateCard, writeCard } from "../../../harness/src/card/card.js";

const work = mkdtempSync(join(tmpdir(), "que-card-"));
after(() => rmSync(work, { recursive: true, force: true }));

const source = join(import.meta.dirname, "../mount/fixtures/plugins/source");

const good = cardOf(
  definePlugin({
    name: "notes",
    title: "Notes",
    description: "How the team writes.",
  }),
);

test("writeCard writes plugin.json from the definition, with the version its package.json gives", async () => {
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
    ["find"],
  );
});

test("writeCard stops, writing nothing, on a plugin that breaks the contract", async () => {
  const dir = join(work, "old");
  cpSync(
    join(import.meta.dirname, "../mount/fixtures/plugins/old-layout"),
    dir,
    { recursive: true },
  );
  await assert.rejects(
    writeCard(dir),
    /que's files are in io\.github\.matta-kelly\.que\//,
  );
});

test("validateCard takes a card cardOf makes", () => {
  assert.doesNotThrow(() => validateCard(good, "the card"));
  assert.doesNotThrow(() =>
    validateCard(JSON.parse(cardText(good)), "the card"),
  );
});

test("validateCard refuses a card the standard's schema refuses", () => {
  assert.throws(
    () => validateCard({ ...good, name: "Notes", tools: [] }, "the card"),
    (error: Error) => {
      assert.match(error.message, /^the card breaks Agent Plugins 1\.0:/);
      assert.match(error.message, /\/name must match pattern/);
      assert.match(error.message, /must NOT have additional properties/);
      return true;
    },
  );
});

test("validateCard refuses a card whose que part is not the shape que reads", () => {
  assert.throws(
    () =>
      validateCard(
        {
          ...good,
          extensions: {
            "io.github.matta-kelly.que": {
              ...good.extensions["io.github.matta-kelly.que"],
              format: 2,
            },
          },
        },
        "the card",
      ),
    /the card's io\.github\.matta-kelly\.que part is invalid:\n- format must be 1/,
  );
});
