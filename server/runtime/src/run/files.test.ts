/**
 * The file routes, through que's server: a user uploads a file to their own
 * thread with POST /threads/:id/files (multipart, the part named "file"), lists
 * the thread's files, reads one back by its id, and deletes it. The bytes live
 * under QUE_DATA_DIR/files/<thread>/<id>/file, and the uploaded name is kept as
 * a name, never as a path: a file named ../order.csv keeps that name, and
 * nothing is written outside the thread's folder. Another user gets the same
 * 404 as one who is not there, and no identity gets 401. A file over the 25 MB
 * cap is a 413 with no row and no bytes, a request with no "file" part is a 400
 * naming it, and deleting a thread removes its files with it.
 *
 * On a database of its own (PGlite, served on a local port), the fixture
 * deployment "two", and a temporary QUE_DATA_DIR. Who is asking comes from
 * @que/identity, which reads DEV_USER_EMAIL at each request.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "two",
);
const data = mkdtempSync(join(tmpdir(), "que-files-routes-"));
process.env.QUE_DATA_DIR = data;
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;

const { app } = await import("../serve.js");

after(async () => {
  await database.stop();
  await db.close();
  rmSync(data, { recursive: true, force: true });
});

const ANA = "ana@example.com";
const BEN = "ben@example.com";
const MB = 1024 * 1024;
const CAP = 25 * MB;

/** A request as the user with this email, or with no identity. */
const as = (email: string | undefined, path: string, init?: RequestInit) => {
  if (email) process.env.DEV_USER_EMAIL = email;
  else delete process.env.DEV_USER_EMAIL;
  return app.request(path, init);
};

/** A thread of this user's, made through POST /threads. */
const make = async (email: string) => {
  const made = await as(email, "/threads", { method: "POST" });
  assert.equal(made.status, 201, await made.clone().text());
  return ((await made.json()) as { id: string }).id;
};

type Stored = { id: string; name: string; mimeType: string; size: number };

/** A multipart body holding one file part, named `part`, which is "file" unless a test says otherwise. */
const withFile = (
  name: string,
  mimeType: string,
  bytes: Uint8Array,
  part = "file",
) => {
  const form = new FormData();
  form.append(part, new File([bytes], name, { type: mimeType }));
  return form;
};

const upload = (email: string | undefined, threadId: string, form: FormData) =>
  as(email, `/threads/${threadId}/files`, { method: "POST", body: form });

/** The thread's files, as GET /threads/:id/files gives them. */
const listed = async (email: string, threadId: string) => {
  const response = await as(email, `/threads/${threadId}/files`);
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as Stored[];
};

/** A file, as GET /threads/:id/files/:file gives it: its mime and its bytes. */
const read = async (email: string, threadId: string, id: string) => {
  const response = await as(email, `/threads/${threadId}/files/${id}`);
  assert.equal(response.status, 200, await response.clone().text());
  return {
    mimeType: response.headers.get("content-type"),
    bytes: Buffer.from(await response.arrayBuffer()),
  };
};

const threadDir = (threadId: string) => join(data, "files", threadId);
const fileDir = (threadId: string, id: string) => join(threadDir(threadId), id);
const byId = (a: Stored, b: Stored) => a.id.localeCompare(b.id);
const meta = ({ id, name, mimeType, size }: Stored) => ({
  id,
  name,
  mimeType,
  size,
});

/** The file rows this thread holds, as the table gives them. */
const rowsOf = async (threadId: string) =>
  (
    await db.query<{ id: string }>(
      "SELECT id FROM files WHERE thread = $1 ORDER BY id",
      [threadId],
    )
  ).rows;

test("given a signed-in user and their thread, when two files are uploaded with multipart, then each is listed with its name, mime and size, GET gives its bytes and its mime, and a delete removes it from the list, the table and the disk", async () => {
  // given: Ana's thread
  const threadId = await make(ANA);
  const csv = Buffer.from("id,total\n1,42\n");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // when: a CSV and a PNG are uploaded
  const orderResponse = await upload(
    ANA,
    threadId,
    withFile("orders.csv", "text/csv", csv),
  );
  assert.equal(orderResponse.status, 201, await orderResponse.clone().text());
  const order = (await orderResponse.json()) as Stored;
  const photoResponse = await upload(
    ANA,
    threadId,
    withFile("photo.png", "image/png", png),
  );
  assert.equal(photoResponse.status, 201, await photoResponse.clone().text());
  const photo = (await photoResponse.json()) as Stored;

  // then: each upload answers its id, name, mime and size
  assert.match(
    order.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    `the uploaded id is not an id: ${order.id}`,
  );
  assert.deepEqual(meta(order), {
    id: order.id,
    name: "orders.csv",
    mimeType: "text/csv",
    size: csv.length,
  });
  assert.deepEqual(meta(photo), {
    id: photo.id,
    name: "photo.png",
    mimeType: "image/png",
    size: png.length,
  });

  // and: the list gives both, and no other
  assert.deepEqual(
    (await listed(ANA, threadId)).map(meta).sort(byId),
    [meta(order), meta(photo)].sort(byId),
  );

  // and: GET gives each file's bytes and its mime
  assert.deepEqual(await read(ANA, threadId, order.id), {
    mimeType: "text/csv",
    bytes: csv,
  });
  assert.deepEqual(await read(ANA, threadId, photo.id), {
    mimeType: "image/png",
    bytes: png,
  });

  // when: the CSV is deleted
  const deleted = await as(ANA, `/threads/${threadId}/files/${order.id}`, {
    method: "DELETE",
  });

  // then: it is gone from the list, the table and the disk, and the PNG stays
  assert.equal(deleted.status, 204, await deleted.clone().text());
  assert.equal(
    (await as(ANA, `/threads/${threadId}/files/${order.id}`)).status,
    404,
  );
  assert.deepEqual((await listed(ANA, threadId)).map(meta), [meta(photo)]);
  assert.deepEqual(await rowsOf(threadId), [photo.id]);
  await assert.rejects(readdir(fileDir(threadId, order.id)), {
    code: "ENOENT",
  });

  // and: a delete of the last file leaves the thread with no files
  const second = await as(ANA, `/threads/${threadId}/files/${photo.id}`, {
    method: "DELETE",
  });
  assert.equal(second.status, 204, await second.clone().text());
  assert.deepEqual(await listed(ANA, threadId), []);
  assert.deepEqual(await rowsOf(threadId), []);
});

test("given a file uploaded as ../order.csv, when the thread lists it, then the name is kept, its bytes are under <data>/files/<thread>/<id>/file, and neither the name nor the request path reaches outside the thread's folder", async () => {
  // given: Ana's thread
  const threadId = await make(ANA);
  const csv = Buffer.from("id,total\n1,42\n");
  const escaped = Buffer.from("not outside\n");

  // when: a file named ../order.csv, and one named ../../escaped.csv, are uploaded
  const orderResponse = await upload(
    ANA,
    threadId,
    withFile("../order.csv", "text/csv", csv),
  );
  assert.equal(orderResponse.status, 201, await orderResponse.clone().text());
  const order = (await orderResponse.json()) as Stored;
  const escapedResponse = await upload(
    ANA,
    threadId,
    withFile("../../escaped.csv", "text/csv", escaped),
  );
  assert.equal(
    escapedResponse.status,
    201,
    await escapedResponse.clone().text(),
  );

  // then: the list keeps each name as the user gave it
  assert.deepEqual(
    (await listed(ANA, threadId)).map((f) => f.name),
    ["../order.csv", "../../escaped.csv"],
  );

  // and: each thread folder holds only its file's id folder, which holds only the file
  assert.deepEqual(
    (await readdir(threadDir(threadId))).sort(),
    [order.id, ((await escapedResponse.json()) as Stored).id].sort(),
  );
  assert.deepEqual(await readdir(fileDir(threadId, order.id)), ["file"]);
  assert.deepEqual((await read(ANA, threadId, order.id)).bytes, csv);

  // and: nothing was written outside the thread's folder
  assert.deepEqual(await readdir(join(data, "files")), [threadId]);
  assert.equal(existsSync(join(data, "files", "order.csv")), false);
  assert.equal(existsSync(join(data, "escaped.csv")), false);

  // and: a request whose file id is a path is a 404, and gives no bytes
  const traversal = await as(
    ANA,
    `/threads/${threadId}/files/${encodeURIComponent("../../order.csv")}`,
  );
  assert.equal(traversal.status, 404, await traversal.clone().text());
  assert.equal((await traversal.text()).includes("id,total"), false);
});

test("given one user's thread and file, when another signed-in user calls the file routes on them, or no identity calls them, then the other user gets 404 with none of the bytes and no identity gets 401", async () => {
  // given: Ana's thread with a CSV, and Ben's own thread
  const threadId = await make(ANA);
  const benThread = await make(BEN);
  const csv = Buffer.from("id,total\n1,SECRET-42\n");
  const uploaded = await upload(
    ANA,
    threadId,
    withFile("orders.csv", "text/csv", csv),
  );
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const order = (await uploaded.json()) as Stored;

  // when: Ben uploads to Ana's thread, or lists, reads or deletes its file
  const into = await upload(
    BEN,
    threadId,
    withFile("steal.csv", "text/csv", csv),
  );
  const list = await as(BEN, `/threads/${threadId}/files`);
  const file = await as(BEN, `/threads/${threadId}/files/${order.id}`);
  const remove = await as(BEN, `/threads/${threadId}/files/${order.id}`, {
    method: "DELETE",
  });

  // then: each is the 404 of a thread that is not his, and none gives the file's bytes
  assert.equal(into.status, 404, await into.clone().text());
  assert.equal(list.status, 404, await list.clone().text());
  assert.equal(file.status, 404, await file.clone().text());
  assert.equal(remove.status, 404, await remove.clone().text());
  assert.notEqual(file.headers.get("content-type"), "text/csv");
  assert.equal((await file.text()).includes("SECRET-42"), false);

  // and: a file id from Ana's thread, on Ben's own thread, is not his either
  const elsewhere = await as(BEN, `/threads/${benThread}/files/${order.id}`);
  assert.equal(elsewhere.status, 404, await elsewhere.clone().text());

  // and: Ana still holds the file, and Ben's upload added nothing
  assert.deepEqual((await listed(ANA, threadId)).map(meta), [meta(order)]);
  assert.deepEqual(await rowsOf(threadId), [order.id]);

  // and: no identity gets 401 from each route
  assert.equal(
    (await upload(undefined, threadId, withFile("x.csv", "text/csv", csv)))
      .status,
    401,
  );
  assert.equal((await as(undefined, `/threads/${threadId}/files`)).status, 401);
  assert.equal(
    (await as(undefined, `/threads/${threadId}/files/${order.id}`)).status,
    401,
  );
  assert.equal(
    (
      await as(undefined, `/threads/${threadId}/files/${order.id}`, {
        method: "DELETE",
      })
    ).status,
    401,
  );
});

test("given a thread with files, when the thread is deleted, then its files are gone from the table and the disk with it, and another thread's file stays", async () => {
  // given: two of Ana's threads, one with two files, the other with one
  const threadId = await make(ANA);
  const otherThread = await make(ANA);
  const csv = Buffer.from("id,total\n1,42\n");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const orderResponse = await upload(
    ANA,
    threadId,
    withFile("orders.csv", "text/csv", csv),
  );
  assert.equal(orderResponse.status, 201, await orderResponse.clone().text());
  const order = (await orderResponse.json()) as Stored;
  const photoResponse = await upload(
    ANA,
    threadId,
    withFile("photo.png", "image/png", png),
  );
  assert.equal(photoResponse.status, 201, await photoResponse.clone().text());
  const photo = (await photoResponse.json()) as Stored;
  const keptResponse = await upload(
    ANA,
    otherThread,
    withFile("kept.csv", "text/csv", csv),
  );
  assert.equal(keptResponse.status, 201, await keptResponse.clone().text());
  const kept = (await keptResponse.json()) as Stored;
  assert.deepEqual(
    (await rowsOf(threadId)).sort(),
    [order.id, photo.id].sort(),
  );

  // when: the thread is deleted
  const deleted = await as(ANA, `/threads/${threadId}`, { method: "DELETE" });

  // then: the thread is gone
  assert.equal(deleted.status, 204, await deleted.clone().text());
  assert.equal((await as(ANA, `/threads/${threadId}`)).status, 404);

  // and: its files are gone from the table and from the disk
  assert.deepEqual(await rowsOf(threadId), []);
  await assert.rejects(readdir(threadDir(threadId)), { code: "ENOENT" });

  // and: the other thread keeps its file
  assert.deepEqual((await listed(ANA, otherThread)).map(meta), [meta(kept)]);
  assert.deepEqual(await read(ANA, otherThread, kept.id), {
    mimeType: "text/csv",
    bytes: csv,
  });
});

test("given a thread, when a file of exactly 25 MB is uploaded, then it is kept with its size and its bytes", async () => {
  // given: Ana's thread, and a file of exactly the cap
  const threadId = await make(ANA);
  const bytes = Buffer.alloc(CAP, 0x61);

  // when: it is uploaded
  const uploaded = await upload(
    ANA,
    threadId,
    withFile("at-cap.bin", "application/octet-stream", bytes),
  );

  // then: it is kept, whole
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const file = (await uploaded.json()) as Stored;
  assert.equal(file.size, CAP);
  assert.deepEqual(await rowsOf(threadId), [file.id]);
  assert.equal(
    (await stat(join(fileDir(threadId, file.id), "file"))).size,
    CAP,
  );
});

test("given a thread, when a file of 25 MB and one byte is uploaded, then it is a 413 with no row and no bytes", async () => {
  // given: Ana's thread, and a file one byte over the cap
  const threadId = await make(ANA);
  const bytes = Buffer.alloc(CAP + 1, 0x62);

  // when: it is uploaded
  const uploaded = await upload(
    ANA,
    threadId,
    withFile("over.bin", "application/octet-stream", bytes),
  );

  // then: it is refused with 413, and nothing of it is kept
  assert.equal(uploaded.status, 413, await uploaded.clone().text());
  assert.deepEqual(await rowsOf(threadId), []);
  await assert.rejects(readdir(threadDir(threadId)), { code: "ENOENT" });
});

test("given a multipart body with no file part, or a file part named otherwise, when an upload is sent, then it is a 400 naming the file part, and nothing is kept", async () => {
  // given: Ana's thread
  const threadId = await make(ANA);

  // when: the body holds no file, only a text field
  const fields = new FormData();
  fields.append("note", "no file here");
  const missing = await upload(ANA, threadId, fields);

  // then: it is a 400 that names the part
  assert.equal(missing.status, 400, await missing.clone().text());
  assert.match(await missing.text(), /\bfile\b/);

  // when: the file part is named attachment
  const wrong = await upload(
    ANA,
    threadId,
    withFile("orders.csv", "text/csv", Buffer.from("id\n1\n"), "attachment"),
  );

  // then: it is a 400 that names the file part too, and nothing is kept
  assert.equal(wrong.status, 400, await wrong.clone().text());
  assert.match(await wrong.text(), /\bfile\b/);
  assert.deepEqual(await rowsOf(threadId), []);
  assert.deepEqual(await listed(ANA, threadId), []);
});
