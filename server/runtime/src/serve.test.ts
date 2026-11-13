/**
 * que's server, through its app, on a database of its own (PGlite, served on a
 * local port) and the fixture deployment "two". Who is asking comes from
 * @que/identity, which reads DEV_USER_EMAIL at each request.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../tests/integration/mount/fixtures"),
  "two",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;
const { app } = await import("./serve.js");

after(async () => {
  await database.stop();
  await db.close();
});

/** A request as the user with this email, or with no identity. */
const as = (email: string | undefined, path: string, init?: RequestInit) => {
  if (email) process.env.DEV_USER_EMAIL = email;
  else delete process.env.DEV_USER_EMAIL;
  return app.request(path, init);
};
test("/mcp and /que/* answer 401 to a request with no identity", async () => {
  assert.equal(
    (
      await as(undefined, "/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal((await as(undefined, "/que/me")).status, 401);
});

test("/que/* answers as the signed-in user: /que/me is each user's own row", async () => {
  const ana = await as("ana@example.com", "/que/me");
  assert.equal(ana.status, 200);
  assert.equal(
    ((await ana.json()) as { email: string }).email,
    "ana@example.com",
  );
  const ben = await as("ben@example.com", "/que/me");
  assert.equal(ben.status, 200);
  assert.equal(
    ((await ben.json()) as { email: string }).email,
    "ben@example.com",
  );
});

test("/ok answers with no identity", async () => {
  assert.equal((await as(undefined, "/ok")).status, 200);
});
