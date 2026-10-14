import { test } from "vitest";
import assert from "node:assert/strict";
import { runOptions } from "./run-options.ts";

const message = { type: "human", content: "hi" };

test("runOptions sends a run to go on when its stream ends, with its events kept", () => {
  assert.deepEqual(runOptions([message], {}, {}), {
    input: { messages: [message] },
    streamMode: ["messages", "updates", "custom"],
    onDisconnect: "continue",
    streamResumable: true,
    config: { configurable: {} },
  });
});

test("runOptions names what the chat picked, and keeps what the runtime's config names over it", () => {
  const picked = { agent: "lean", model: "small" };
  assert.deepEqual(runOptions([message], {}, picked).config, {
    configurable: { agent: "lean", model: "small" },
  });
  // A resume after an interrupt: the config of the run it resumes.
  const runConfig = { tags: ["resume"], configurable: { model: "big", x: 1 } };
  assert.deepEqual(runOptions([message], { runConfig }, picked).config, {
    tags: ["resume"],
    configurable: { agent: "lean", model: "big", x: 1 },
  });
});

test("runOptions sends no input for a run with no message, and a command or a checkpoint only when one is given", () => {
  const { input, ...rest } = runOptions([], {}, {});
  assert.equal(input, null);
  assert.equal("command" in rest, false);
  assert.equal("checkpoint" in rest, false);

  const command = { resume: "yes" };
  const from = runOptions([], { command, checkpointId: "cp-1" }, {});
  assert.deepEqual(from.command, command);
  assert.deepEqual(from.checkpoint, { checkpoint_id: "cp-1" });
});
