/**
 * The file routes after a restart: a file on the database and the data
 * directory is served by a server started after it was put there, through
 * GET /threads/:id/files/:file.
 *
 * The first server, a process of its own, makes the thread; the file is put as
 * a server that uploaded it leaves it (the store's `put`); the second server,
 * another process on the same PGlite database (served on a local port) and the
 * same QUE_DATA_DIR, serves it with the fixture deployment "two".
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
import { storeOn } from "@que/files";
import { deploymentRoot } from "../../deployment-root.js";

const ANA = "ana@example.com";
const runtime = join(import.meta.dirname, "..", "..", "..", "runtime");

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
const data = mkdtempSync(join(tmpdir(), "que-files-restart-"));

// A child runs node, not npm, so it is given the source condition npm would give it.
const condition = "--conditions=@mku1tra/que-source";
const nodeOptions = [process.env.NODE_OPTIONS, condition]
  .filter(Boolean)
  .join(" ");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres@${database.getServerConn()}/postgres`,
  QUE_CREDENTIALS_KEY: randomBytes(32).toString("base64"),
  QUE_DEPLOYMENT: deploymentRoot(
    join(import.meta.dirname, "..", "mount", "fixtures"),
    "two",
  ),
  QUE_DATA_DIR: data,
  DEV_USER_EMAIL: ANA,
  NODE_OPTIONS: nodeOptions,
};

const children = new Set<ChildProcess>();

after(async () => {
  for (const proc of children) proc.kill("SIGKILL");
  await database.stop();
  await db.close();
  rmSync(data, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((later) => setTimeout(later, ms));

/** A port nothing holds, asked for just before a server binds it. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((ready) => probe.listen(0, "127.0.0.1", ready));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((closed) => probe.close(() => closed()));
  return port;
}

/** A process of que's server (src/listen.ts), waited for until /ok answers. */
async function start(): Promise<{
  base: string;
  proc: ChildProcess;
  exited: Promise<void>;
}> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ["--import", "tsx", "src/listen.ts"], {
    cwd: runtime,
    env: { ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  children.add(proc);
  let out = "";
  proc.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()));
  let ended = false;
  const exited = new Promise<void>((done) =>
    proc.once("exit", () => {
      ended = true;
      children.delete(proc);
      done();
    }),
  );
  for (let tries = 0; tries < 300; tries++) {
    if (ended) throw new Error(`the server ended before it listened:\n${out}`);
    try {
      if ((await fetch(`${base}/ok`)).ok) return { base, proc, exited };
    } catch {
      // Not listening yet.
    }
    await sleep(100);
  }
  proc.kill("SIGKILL");
  throw new Error(`the server did not listen:\n${out}`);
}

test(
  "given a thread whose file is on the database and the data directory, when another server starts on the same database and data directory, then GET /threads/:id/files/:file gives its bytes and its mime",
  { timeout: 180_000 },
  async () => {
    // given: a server that makes Ana's thread, and is then stopped
    const first = await start();
    const made = await fetch(`${first.base}/threads`, { method: "POST" });
    assert.equal(made.status, 201, await made.clone().text());
    const threadId = ((await made.json()) as { id: string }).id;
    first.proc.kill("SIGKILL");
    await first.exited;

    // and: a file put for that thread, as a server that uploaded it leaves it
    const bytes = Buffer.from("id,total\n1,42\n");
    const file = await storeOn(db, data).put(threadId, {
      name: "../order.csv",
      mimeType: "text/csv",
      bytes,
    });

    // when: another server starts on the same database and data directory
    await sleep(300);
    let second:
      { base: string; proc: ChildProcess; exited: Promise<void> } | undefined;
    for (let attempt = 0; !second; attempt++) {
      try {
        second = await start();
      } catch (error) {
        if (attempt >= 10) throw error;
        await sleep(300);
      }
    }

    // then: GET /threads/:id/files/:file gives the same bytes and the mime
    const read = await fetch(
      `${second.base}/threads/${threadId}/files/${file.id}`,
    );
    assert.equal(read.status, 200, await read.clone().text());
    assert.equal(read.headers.get("content-type"), "text/csv");
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), bytes);

    // and: the list gives the file
    const list = await fetch(`${second.base}/threads/${threadId}/files`);
    assert.equal(list.status, 200, await list.clone().text());
    assert.deepEqual(await list.json(), [
      {
        id: file.id,
        name: "../order.csv",
        mimeType: "text/csv",
        size: bytes.length,
      },
    ]);

    second.proc.kill("SIGKILL");
    await second.exited;
  },
);
