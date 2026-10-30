/**
 * Compaction on pi after a restart: a generation pi resumes before any que
 * run on its model is summarized as its agent's loop says, not as pi's
 * defaults do. Each process of que's server is a child of its own
 * (compaction-restart.child.ts), on one database of the test's (PGlite,
 * served on a local port) and the fixture deployment "summary". The first
 * runs two chats into a request faux never answers and is killed; the second
 * runs once on another model, which starts pi's work, so pi resumes the two.
 *
 * The chats, in tokens as pi estimates them: the agent whole's (no summary)
 * holds 30,000 of its 40,000-token window, past where pi's defaults summarize
 * (16,384 short of the window). The agent late's (at 0.7 of 100,000) holds
 * 35,000. faux's first answer on the new process reports the whole prompt
 * twice (as input and as a cache write, with no cache of its own yet), so pi
 * reads about 61,000 then: under the loop's 70,000, and past where pi's
 * defaults start a summary in the background (32,768 below 83,616).
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
const data = mkdtempSync(join(tmpdir(), "que-compaction-restart-"));

after(async () => {
  await database.stop();
  // Each connection the stop ends asks PGlite if it is in a transaction, on the next turn: it must be open then.
  await new Promise((later) => setTimeout(later, 100));
  await db.close();
  rmSync(data, { recursive: true, force: true });
});

const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres@${database.getServerConn()}/postgres`,
  QUE_DEPLOYMENT: deploymentRoot(
    join(import.meta.dirname, "../../../../tests/integration/mount/fixtures"),
    "summary",
  ),
  QUE_DATA_DIR: data,
};
delete env.DEV_USER_NAME;

const child = join(import.meta.dirname, "compaction-restart.child.ts");

/** A process of que's server in `mode`: it is one node process, so a kill ends it. Its output, line by line. */
function processIn(mode: "interrupt" | "resume") {
  const proc = spawn(process.execPath, ["--import", "tsx", child, mode], {
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let out = "";
  const line = (holds: (text: string) => boolean) =>
    new Promise<string>((found, failed) => {
      proc.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString();
        const hit = out.split("\n").find(holds);
        if (hit !== undefined) found(hit);
      });
      proc.once("exit", (code) =>
        failed(
          new Error(`the ${mode} process ended (${code}) before its line`),
        ),
      );
    });
  const exited = new Promise<void>((done) => proc.once("exit", () => done()));
  return { proc, line, exited };
}

type Request = { model: string; summarizing: boolean; first: boolean };

test(
  "given two chats on pi left mid-generation by a process that is killed, when a new process resumes them before any que run on their models, then each is summarized as its agent's loop says: the chat of a loop that never summarizes is not, and one under its loop's at is not, and each request holds the chat whole",
  { timeout: 120_000 },
  async () => {
    const first = processIn("interrupt");
    await first.line((text) => text === "ready");
    first.proc.kill("SIGKILL");
    await first.exited;

    const second = processIn("resume");
    const requests = JSON.parse(
      await second.line((text) => text.startsWith("[")),
    ) as Request[];
    await second.exited;

    for (const model of ["whole-model", "wide-model"]) {
      const on = requests.filter((r) => r.model === model);
      // The resumed request, and the one after it, prepared on the new process.
      assert.ok(
        on.filter((r) => !r.summarizing).length >= 2,
        `pi did not resume the generation on ${model}, and go on from it`,
      );
      assert.equal(
        on.filter((r) => r.summarizing).length,
        0,
        `the resumed chat on ${model} was summarized, as its loop does not say`,
      );
      assert.ok(
        on.every((r) => r.first),
        `a resumed request on ${model} did not hold the chat whole`,
      );
    }
  },
);
