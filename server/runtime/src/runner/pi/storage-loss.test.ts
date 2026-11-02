/**
 * A server that loses its storage stops serving, and says why. Each server is
 * a process of its own, que's real entry (listen.ts), on a PGlite database
 * served on a local port, and the test takes the database away under it: the
 * connection every store and the deployment's one-owner lock run on ends, and
 * the process must stop rather than answer with a storage it cannot see.
 *
 * One behavior here: a lost connection ends the process within 5 seconds, and
 * the log says it lost its storage. A start whose storage does not answer ends
 * non-zero on the driver's own message, since the stores open before the
 * server's connection does; and a new process that serves once the storage is
 * back is read on the node, where the restart loop makes it (`tests/e2e/que.sh`).
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../../tests/deployment-root.js";

const server = join(import.meta.dirname, "../../../..");
const entry = join(import.meta.dirname, "../../listen.ts");
const data = mkdtempSync(join(tmpdir(), "que-storage-loss-"));

const db = await PGlite.create();

// A child runs node, not npm, so it is given the source condition npm would give it.
const nodeOptions = [
  process.env.NODE_OPTIONS,
  "--conditions=@mku1tra/que-source",
]
  .filter(Boolean)
  .join(" ");

const env: NodeJS.ProcessEnv = {
  ...process.env,
  QUE_CREDENTIALS_KEY: randomBytes(32).toString("base64"),
  QUE_DEPLOYMENT: deploymentRoot(
    join(import.meta.dirname, "../../../../tests/integration/mount/fixtures"),
    "summary",
  ),
  QUE_DATA_DIR: data,
  NODE_OPTIONS: nodeOptions,
};

const children = new Set<ChildProcess>();

after(async () => {
  for (const proc of children) proc.kill("SIGKILL");
  // A killed server's socket closes a moment later.
  await new Promise((later) => setTimeout(later, 300));
  await db.close();
  rmSync(data, { recursive: true, force: true });
});

/** A port nothing holds, asked for just before a server binds it. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((ready) => probe.listen(0, "127.0.0.1", ready));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((closed) => probe.close(() => closed()));
  return port;
}

type Running = {
  proc: ChildProcess;
  out: () => string;
  exited: Promise<number | null>;
  listening: () => Promise<void>;
};

/** A process of que's server on `url`, listening on `port`, waited for until it prints "ready". */
function start(url: string, port: number): Running {
  const proc = spawn(process.execPath, ["--import", "tsx", entry], {
    cwd: server,
    env: { ...env, DATABASE_URL: url, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(proc);
  let out = "";
  proc.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()));
  proc.stderr?.on("data", (chunk: Buffer) => (out += chunk.toString()));
  return {
    proc,
    out: () => out,
    exited: new Promise<number | null>((done) =>
      proc.once("exit", (code) => done(code)),
    ),
    listening: async () => {
      for (let tries = 0; tries < 300; tries++) {
        if (out.includes("listens on port")) return;
        await new Promise((later) => setTimeout(later, 100));
      }
      throw new Error(`the server did not listen:\n${out}`);
    },
  };
}

test(
  "given a server that is serving, when its storage connection is lost, then within 5 seconds it stops answering, and its log says it lost its storage",
  { timeout: 60_000 },
  async () => {
    const port = await freePort();
    const served = new PGLiteSocketServer({ db, port, maxConnections: 100 });
    await served.start();
    const http = await freePort();
    const one = start(`postgresql://postgres@127.0.0.1:${port}/postgres`, http);
    await one.listening();
    assert.equal((await fetch(`http://127.0.0.1:${http}/ok`)).status, 200);

    const lost = Date.now();
    // Its own promise waits for the last connection to close, and the server under test holds one: the
    // detached sockets are what end it, and the read that matters is the process's exit below.
    void served.stop();
    const code = await Promise.race([
      one.exited,
      new Promise<"still up">((later) =>
        setTimeout(() => later("still up"), 5000),
      ),
    ]);
    assert.notEqual(
      code,
      "still up",
      `the server was still up 5 seconds after its storage was lost:\n${one.out()}`,
    );
    assert.notEqual(
      code,
      0,
      `the server ended 0, as a clean stop would:\n${one.out()}`,
    );
    assert.match(
      one.out(),
      /lost its storage/,
      `the log does not say it lost its storage:\n${one.out()}`,
    );
    assert.ok(
      Date.now() - lost < 6000,
      "the server took longer than 5 seconds to stop",
    );
  },
);
