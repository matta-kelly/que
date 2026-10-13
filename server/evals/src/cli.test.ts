/**
 * The command, through its real entry point, against a local server that
 * replays que's answers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { replay } from "../fixtures/replay.js";

const cli = join(import.meta.dirname, "cli.ts");
const shop = join(import.meta.dirname, "../fixtures/deployments/shop");

const command = (url: string, ...args: string[]) =>
  new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", cli, ...args],
      { env: { ...process.env, QUE_URL: url }, timeout: 20_000 },
      (error, out, err) =>
        resolve({
          code: error ? ((error.code as number | undefined) ?? 1) : 0,
          out,
          err,
        }),
    );
  });

test("the command runs each case of a deployment under each of its agents, prints the report, and ends with a fault when a run did not finish", async () => {
  // que does not finish the runs under lean.
  const server = await replay(
    (body) => body.config?.configurable?.agent === "lean",
  );
  try {
    const { code, out } = await command(server.url, shop);
    assert.equal(code, 1);
    assert.ok(out.includes("shop / find-order / find-order-by-customer\n"));
    assert.ok(out.includes("shop / find-order / find-order-not-asked\n"));
    assert.ok(
      out.includes('  [chat]\n    call     open_package {"package":"shop"}\n'),
    );
    assert.ok(
      out.includes('  [lean]\n    error    no agent "nope". Agents: chat\n'),
    );
    assert.ok(
      out.includes(
        "  [notes-only]\n    skipped  notes-only does not have shop\n",
      ),
    );
    assert.ok(out.trimEnd().endsWith("4 runs, 2 did not finish, 2 skipped"));
  } finally {
    await server.close();
  }
});

test("the command runs only the agents named, and ends with no fault when each run finished", async () => {
  const server = await replay();
  try {
    const { code, out } = await command(server.url, shop, "--agent", "chat");
    assert.equal(code, 0);
    assert.ok(!out.includes("[lean]"));
    assert.ok(out.trimEnd().endsWith("2 runs, 0 did not finish, 0 skipped"));
  } finally {
    await server.close();
  }
});

test("the command stops, and says que is not up, when nothing answers", async () => {
  const { code, out, err } = await command("http://127.0.0.1:9", shop);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.match(err, /eval: que is not up at http:\/\/127\.0\.0\.1:9/);
});
