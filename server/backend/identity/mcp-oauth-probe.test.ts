/**
 * The OAuth probe for que-mcp Phase 0: an external MCP client carries the
 * Access JWT que's login issues. This test starts que's server as a process,
 * signs a token with the team's key, serves that key set on localhost, and
 * asks the server who is asking. The recorded result is in
 * `mcp-oauth-probe.md`, beside this test.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { type CryptoKey, exportJWK, generateKeyPair, SignJWT } from "jose";
import { deploymentRoot } from "../../tests/deployment-root.js";

const team = await generateKeyPair("RS256");
const kid = "the-team-key";
const audience = "the-que-application";
const publicKey = {
  ...(await exportJWK(team.publicKey)),
  kid,
  alg: "RS256",
  use: "sig",
};

/** The team domain's key set, served from this test's own localhost. */
const keys = await new Promise<{ url: string; server: Server }>((ready) => {
  const server = createServer((request, response) => {
    if (request.url !== "/cdn-cgi/access/certs") {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("the key set cannot be read");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [publicKey] }));
  });
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as AddressInfo;
    ready({ url: `http://127.0.0.1:${port}`, server });
  });
});

/** A port the server can bind, free when this test gives it up. */
const freePort = () =>
  new Promise<number>((ready) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => ready(port));
    });
  });

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 50 });
await database.start();
const port = await freePort();
const settings: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres@${database.getServerConn()}/postgres`,
  QUE_CREDENTIALS_KEY: randomBytes(32).toString("base64"),
  QUE_DEPLOYMENT: deploymentRoot(
    join(import.meta.dirname, "../../tests/integration/mount/fixtures"),
    "two",
  ),
  QUE_ACCESS_TEAM_DOMAIN: keys.url,
  QUE_ACCESS_AUDIENCE: audience,
  PORT: String(port),
};
delete settings.DEV_USER_EMAIL;
delete settings.DEV_USER_NAME;

let output = "";
const server: ChildProcess = spawn(
  process.execPath,
  ["--import", "tsx", join(import.meta.dirname, "../../runtime/src/listen.ts")],
  { env: settings, stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout?.on("data", (chunk) => (output += chunk));
server.stderr?.on("data", (chunk) => (output += chunk));

/** Waits until que's server answers, and says what the process printed when it does not. */
const listening = async () => {
  const at = `http://127.0.0.1:${port}`;
  for (let tries = 0; tries < 600; tries++) {
    try {
      if ((await fetch(`${at}/ok`)).ok) return at;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`que's server did not start:\n${output}`);
};

const at = await listening();

after(async () => {
  keys.server.close();
  if (server.exitCode === null) {
    server.kill();
    await new Promise((exited) => server.once("exit", exited));
  }
  // A connection the runtime opened at load may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

/** A token from que's login, signed by the team's key, for this email. */
const jwt = (email: string) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(keys.url)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(team.privateKey as CryptoKey);

/** A request as an external client that carries this Access token. */
const asClient = (token: string) =>
  fetch(`${at}/que/me`, {
    headers: { "cf-access-jwt-assertion": token },
  });

test("given both Access settings, when an external client presents a signed Access JWT to GET /que/me, then it gets the same que user the token's email names", async () => {
  const ana = await asClient(await jwt("ana.lima@example.com"));
  assert.equal(ana.status, 200);
  const first = (await ana.json()) as {
    id: string;
    email: string;
    name: string;
  };
  assert.equal(first.email, "ana.lima@example.com");
  assert.equal(first.name, "ana.lima");

  const again = await asClient(await jwt("ana.lima@example.com"));
  assert.equal(((await again.json()) as { id: string }).id, first.id);

  const ben = await asClient(await jwt("ben.lima@example.com"));
  const second = (await ben.json()) as { id: string; email: string };
  assert.equal(second.email, "ben.lima@example.com");
  assert.notEqual(second.id, first.id);
});

test("given the probe ran, when its record beside this test is read, then it says pass with grounds naming the verified token and the same que user", () => {
  const note = readFileSync(
    join(import.meta.dirname, "mcp-oauth-probe.md"),
    "utf8",
  );

  assert.match(note, /^Result: pass\.$/m);
  const grounds = note.split(/^Grounds:/m)[1] ?? "";
  assert.match(grounds, /ana\.lima@example\.com/);
  assert.match(grounds, /issuer/);
  assert.match(grounds, /audience/);
  assert.match(grounds, /same que user/);
});
