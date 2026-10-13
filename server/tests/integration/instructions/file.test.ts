/**
 * The user's instructions, from the file a deployment names: read from disk.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromFile } from "../../../harness/src/access/instructions.js";

test("the text is the content of the file, and a change to the file is in the next read", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "que-")), "agents.md");
  await writeFile(file, "No emojis.");
  assert.equal(await fromFile(file), "No emojis.");
  await writeFile(file, "Be terse.");
  assert.equal(await fromFile(file), "Be terse.");
});

test("a file that cannot be read gives an error that names the setting and the path", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "que-")), "none.md");
  await assert.rejects(fromFile(file), (error: Error) => {
    assert.match(error.message, /DEV_USER_INSTRUCTIONS/);
    assert.ok(error.message.includes(file));
    return true;
  });
});
