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
  existsSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  cardOf,
  cardText,
  checkCard,
  definePlugin,
  validateCard,
} from "@que/core";
import { writeCard } from "../../../harness/src/card/writer.js";
import { loadPlugin } from "../../../harness/src/mount/plugins.js";

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

test("writeCard stops, writing no card, on a plugin that breaks the contract", async () => {
  const dir = join(work, "bad");
  cpSync(join(import.meta.dirname, "../mount/fixtures/plugins/bad"), dir, {
    recursive: true,
  });
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

// A copy of the source fixture, card and all, to change: a plugin outside que, with the package.json one has.
const copy = (name: string) => {
  const dir = join(work, name);
  cpSync(source, dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  return dir;
};

// The card of the plugin in `dir`, with its description changed, so it is no longer what the definition makes.
const staleCard = (dir: string) => {
  const file = join(dir, "plugin.json");
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace("A connector,", "A stale connector,"),
  );
};

test("checkCard takes a card that is what the definition makes", async () => {
  const dir = copy("fresh");
  const { definition } = await loadPlugin(dir);
  assert.doesNotThrow(() => checkCard(dir, definition));
});

test("checkCard refuses a plugin with no card, saying how to write it", async () => {
  const dir = copy("cardless");
  unlinkSync(join(dir, "plugin.json"));
  const { definition } = await loadPlugin(dir);
  assert.throws(
    () => checkCard(dir, definition),
    (error: Error) =>
      error.message ===
      `${dir} has no card (plugin.json): write it with \`just card ${dir}\``,
  );
});

test("checkCard refuses a card that is not what the definition makes, naming the first line that differs", async () => {
  const dir = copy("stale");
  staleCard(dir);
  const { definition } = await loadPlugin(dir);
  assert.throws(
    () => checkCard(dir, definition),
    /plugin\.json is not what its definition makes \(from line 4\): write it with `just card /,
  );
});

// The card check `just check-folder` runs, on one folder.
const checkFolder = (dir: string) =>
  execFileSync(
    process.execPath,
    ["--import", "tsx", "harness/src/card/check.ts", dir],
    {
      cwd: join(import.meta.dirname, "../../.."),
      encoding: "utf8",
      stdio: "pipe",
    },
  );

test("the check-folder card check passes a plugin whose card is right", () => {
  assert.equal(checkFolder(copy("check-fresh")), "");
});

test("the check-folder card check passes over a folder that holds no plugin", () => {
  assert.equal(checkFolder(work), "");
});

test("the check-folder card check fails a plugin in the old layout", () => {
  const dir = join(work, "check-old");
  cpSync(
    join(import.meta.dirname, "../mount/fixtures/plugins/old-layout"),
    dir,
    { recursive: true },
  );
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  assert.throws(
    () => checkFolder(dir),
    (error: { status: number; stderr: string }) =>
      error.status === 1 &&
      /que's files are in io\.github\.matta-kelly\.que\//.test(error.stderr),
  );
});

test("the check-folder card check fails a plugin whose card is stale", () => {
  const dir = copy("check-stale");
  staleCard(dir);
  assert.throws(
    () => checkFolder(dir),
    (error: { status: number; stderr: string }) =>
      error.status === 1 &&
      /plugin\.json is not what its definition makes/.test(error.stderr),
  );
});
