import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { command } from "./command.ts";

const fixtures = join(
  import.meta.dirname,
  "../../tests/integration/mount/fixtures",
);

test("lint says no problem for a deployment whose graph has none", async () => {
  assert.deepEqual(await command(["lint", "deployments/two"], fixtures), {
    out: "no problem",
    code: 0,
  });
});

test("lint prints each problem of a deployment's graph at its file, and ends with a fault", async () => {
  assert.deepEqual(
    await command(["lint", "deployments/agent-names-unmounted"], fixtures),
    {
      out: "deployments/agent-names-unmounted/agents/wants-delta.ts: /plugins: names the plugin delta, which the deployment does not mount (basis/link)",
      code: 1,
    },
  );
});

test("the command takes only lint and a folder, and says so", async () => {
  assert.deepEqual(await command(["check"], fixtures), {
    out: "usage: que-harness lint <deployment folder>",
    code: 2,
  });
});
