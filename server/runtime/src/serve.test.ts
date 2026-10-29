/**
 * que's server, through its app, on a database of its own (PGlite, served on a
 * local port) and the fixture deployment "two". Who is asking comes from
 * @que/identity, which reads DEV_USER_EMAIL at each request.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  // The server's pg pools lose their idle connections when the database stops, and each says so with an
  // error no one listens for. That is the end of the test, not a fault: any other error still ends the process.
  process.on("uncaughtException", (error) => {
    if (error.message !== "Connection terminated unexpectedly") throw error;
  });
  await database.stop();
  await db.close();
});

/** A request as the user with this email, or with no identity. */
const as = (email: string | undefined, path: string, init?: RequestInit) => {
  if (email) process.env.DEV_USER_EMAIL = email;
  else delete process.env.DEV_USER_EMAIL;
  return app.request(path, init);
};
/** A thread made by this user, through POST /threads, which answers 201 Created. */
const make = async (email: string) => {
  const made = await as(email, "/threads", { method: "POST" });
  assert.equal(made.status, 201);
  return (await made.json()) as { id: string };
};

test("a request with no identity gets 401", async () => {
  assert.equal((await as(undefined, "/threads")).status, 401);
  assert.equal(
    (await as(undefined, "/threads", { method: "POST" })).status,
    401,
  );
  assert.equal((await as(undefined, `/threads/${randomUUID()}`)).status, 401);
  assert.equal((await as(undefined, "/que/me")).status, 401);
});

test("a user lists only their own threads", async () => {
  const first = await make("ana@example.com");
  const second = await make("ana@example.com");
  const bens = await make("ben@example.com");
  const ids = async (email: string) =>
    ((await (await as(email, "/threads")).json()) as { id: string }[])
      .map((t) => t.id)
      .sort();
  assert.deepEqual(await ids("ana@example.com"), [first.id, second.id].sort());
  assert.deepEqual(await ids("ben@example.com"), [bens.id]);
  assert.deepEqual(await ids("cy@example.com"), []);
});

test("a user opens their own thread, and another user's thread or one that is not there gets 404", async () => {
  // Users of their own: the threads of the other tests are not theirs.
  const dees = await make("dee@example.com");
  const eves = await make("eve@example.com");
  const dee = await as("dee@example.com", `/threads/${dees.id}`);
  assert.equal(dee.status, 200);
  assert.equal(((await dee.json()) as { id: string }).id, dees.id);
  const eve = await as("eve@example.com", `/threads/${eves.id}`);
  assert.equal(eve.status, 200);
  assert.equal(((await eve.json()) as { id: string }).id, eves.id);
  assert.equal(
    (await as("eve@example.com", `/threads/${dees.id}`)).status,
    404,
  );
  assert.equal(
    (await as("dee@example.com", `/threads/${eves.id}`)).status,
    404,
  );
  assert.equal(
    (await as("dee@example.com", `/threads/${randomUUID()}`)).status,
    404,
  );
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
