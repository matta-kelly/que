import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SETUP, storeOn } from "./index.js";

const THREAD = "T";
const OTHER = "U";

// A temporary data directory, removed when the test ends.
async function dataDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "que-files-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

// A database closed when the test ends, also when it fails: an open PGlite keeps the test process running.
function closedAfter(t: TestContext, db: PGlite): PGlite {
  t.after(() => db.close());
  return db;
}

test("a file named ../order.csv is kept with that name, and only its id names a path", async (t) => {
  // given: a temporary data directory and an empty database
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());
  const store = storeOn(db, dir);

  // when: a file named ../order.csv is put for thread T
  const bytes = Buffer.from("id,total\n1,42\n");
  const file = await store.put(THREAD, {
    name: "../order.csv",
    mimeType: "text/csv",
    bytes,
  });

  // then: the row names T and keeps the name, and the bytes are under the file's id
  const { rows } = await db.query<{ thread: string; name: string }>(
    "SELECT thread, name FROM files WHERE id = $1",
    [file.id],
  );
  assert.deepEqual(rows, [{ thread: THREAD, name: "../order.csv" }]);
  const threadDir = join(dir, "files", THREAD);
  assert.deepEqual(await readdir(threadDir), [file.id]);
  assert.deepEqual(await readdir(join(threadDir, file.id)), ["file"]);
  assert.deepEqual(
    Buffer.from(await readFile(join(threadDir, file.id, "file"))),
    bytes,
  );
});

test("a file named reports/2026/order.csv is kept with that name, and adds no folder under the thread", async (t) => {
  // given: a temporary data directory and an empty database
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());
  const store = storeOn(db, dir);

  // when: a file whose name holds folders is put for thread T
  const file = await store.put(THREAD, {
    name: "reports/2026/order.csv",
    mimeType: "text/csv",
    bytes: Buffer.from("id,total\n2,7\n"),
  });

  // then: its name is kept, and the thread holds only its id's folder
  const { rows } = await db.query<{ thread: string; name: string }>(
    "SELECT thread, name FROM files WHERE id = $1",
    [file.id],
  );
  assert.deepEqual(rows, [{ thread: THREAD, name: "reports/2026/order.csv" }]);
  const threadDir = join(dir, "files", THREAD);
  assert.deepEqual(await readdir(threadDir), [file.id]);
  assert.deepEqual(await readdir(join(threadDir, file.id)), ["file"]);
});

test("get and list give a thread's file, and nothing of another thread's", async (t) => {
  // given: a thread with a CSV and a PNG, and another thread with neither
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());
  const store = storeOn(db, dir);
  const csv = Buffer.from("a,b\n1,2\n");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const order = await store.put(THREAD, {
    name: "../order.csv",
    mimeType: "text/csv",
    bytes: csv,
  });
  const photo = await store.put(THREAD, {
    name: "photo.png",
    mimeType: "image/png",
    bytes: png,
  });

  // then: get gives each file's name, mime and bytes
  const readOrder = await store.get(THREAD, order.id);
  assert.ok(readOrder, "the thread's CSV is not there");
  assert.deepEqual(
    {
      name: readOrder.name,
      mimeType: readOrder.mimeType,
      size: readOrder.size,
    },
    { name: "../order.csv", mimeType: "text/csv", size: csv.length },
  );
  assert.deepEqual(Buffer.from(readOrder.bytes), csv);
  const readPhoto = await store.get(THREAD, photo.id);
  assert.ok(readPhoto, "the thread's PNG is not there");
  assert.deepEqual(
    {
      name: readPhoto.name,
      mimeType: readPhoto.mimeType,
      size: readPhoto.size,
    },
    { name: "photo.png", mimeType: "image/png", size: png.length },
  );
  assert.deepEqual(Buffer.from(readPhoto.bytes), png);

  // and: list gives both files, with their metadata
  const listed = (await store.list(THREAD))
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    listed,
    [
      {
        id: order.id,
        name: "../order.csv",
        mimeType: "text/csv",
        size: csv.length,
      },
      {
        id: photo.id,
        name: "photo.png",
        mimeType: "image/png",
        size: png.length,
      },
    ].sort((a, b) => a.id.localeCompare(b.id)),
  );

  // and: another thread gets neither, by get or by list
  assert.equal(await store.get(OTHER, order.id), undefined);
  assert.equal(await store.get(OTHER, photo.id), undefined);
  assert.deepEqual(await store.list(OTHER), []);
});

test("remove deletes the file's row and its whole folder, and a second remove removes nothing", async (t) => {
  // given: a thread with a CSV that has cached text beside its bytes, and a PNG
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());
  const store = storeOn(db, dir);
  const order = await store.put(THREAD, {
    name: "../order.csv",
    mimeType: "text/csv",
    bytes: Buffer.from("a,b\n1,2\n"),
  });
  const photo = await store.put(THREAD, {
    name: "photo.png",
    mimeType: "image/png",
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  // the extracted text a PDF's reader caches in the file's folder
  await writeFile(join(dir, "files", THREAD, order.id, "text"), "page one");

  // when: the CSV is removed
  const removed = await store.remove(THREAD, order.id);

  // then: it says it removed the file, and the row is gone
  assert.equal(removed, true);
  assert.equal(await store.get(THREAD, order.id), undefined);
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM files WHERE id = $1",
    [order.id],
  );
  assert.deepEqual(rows, []);

  // and: the whole folder is gone, cached text with it
  await assert.rejects(readdir(join(dir, "files", THREAD, order.id)), {
    code: "ENOENT",
  });
  assert.deepEqual(await readdir(join(dir, "files", THREAD)), [photo.id]);

  // and: the thread's other file stays
  assert.equal((await store.get(THREAD, photo.id))?.name, "photo.png");

  // and: a second remove says it removed nothing
  assert.equal(await store.remove(THREAD, order.id), false);
});

test("the setup takes an advisory lock, so two processes that start together make the table one after the other", () => {
  assert.match(SETUP, /pg_advisory_xact_lock\s*\(/);
});

test("two stores opened one after the other on one empty database both work", async (t) => {
  // given: an empty database and a data directory
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());

  // when: a second store is made on it after the first has used it
  const first = storeOn(db, dir);
  const one = await first.put(THREAD, {
    name: "one.csv",
    mimeType: "text/csv",
    bytes: Buffer.from("1\n"),
  });
  const second = storeOn(db, dir);
  const two = await second.put(THREAD, {
    name: "two.csv",
    mimeType: "text/csv",
    bytes: Buffer.from("2\n"),
  });

  // then: each store gives both files
  assert.equal((await second.get(THREAD, one.id))?.name, "one.csv");
  assert.equal((await first.get(THREAD, two.id))?.name, "two.csv");
});

test("a store made after the first is closed, on the same database and data directory, gives the file", async (t) => {
  // given: a store that put a file
  const dir = await dataDir(t);
  const before = new PGlite();
  const store = storeOn(before, dir);
  const bytes = Buffer.from("id,total\n1,42\n");
  const file = await store.put(THREAD, {
    name: "../order.csv",
    mimeType: "text/csv",
    bytes,
  });

  // when: its database is closed, and another is opened on the same data
  const data = await before.dumpDataDir();
  await before.close();
  const db = closedAfter(t, new PGlite({ loadDataDir: data }));
  const again = storeOn(db, dir);

  // then: the new store gives the file, with its name, mime and bytes
  const read = await again.get(THREAD, file.id);
  assert.ok(read, "the file is not there in the store made again");
  assert.deepEqual(
    { name: read.name, mimeType: read.mimeType },
    { name: "../order.csv", mimeType: "text/csv" },
  );
  assert.deepEqual(Buffer.from(read.bytes), bytes);
});

test("remove by an id that names a path removes nothing, and the file's own thread still has it", async (t) => {
  // given: thread U holds a CSV
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());
  const store = storeOn(db, dir);
  const bytes = Buffer.from("a,b\n1,2\n");
  const file = await store.put(OTHER, {
    name: "../order.csv",
    mimeType: "text/csv",
    bytes,
  });

  // when: thread T removes the file by a path in the id that points into U's folder
  const removed = await store.remove(THREAD, `../${OTHER}/${file.id}`);

  // then: T's remove says it removed nothing
  assert.equal(removed, false);

  // and: U's file still gives its name, mime and bytes
  await assert.doesNotReject(
    store.get(OTHER, file.id),
    "T's remove took U's file",
  );
  const read = await store.get(OTHER, file.id);
  assert.ok(read, "U's file is gone after T's remove");
  assert.deepEqual(
    { name: read.name, mimeType: read.mimeType, bytes: Buffer.from(read.bytes) },
    { name: "../order.csv", mimeType: "text/csv", bytes },
  );

  // and: U still lists it
  assert.deepEqual(
    (await store.list(OTHER)).map((f) => ({ id: f.id, name: f.name })),
    [{ id: file.id, name: "../order.csv" }],
  );
});

test("remove by a thread that names a path removes nothing, and the file's own thread still has it", async (t) => {
  // given: thread U holds a CSV
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());
  const store = storeOn(db, dir);
  const bytes = Buffer.from("a,b\n1,2\n");
  const file = await store.put(OTHER, {
    name: "../order.csv",
    mimeType: "text/csv",
    bytes,
  });

  // when: thread T removes by a thread string that climbs into U's folder
  // the call may reject: either way, it removes nothing
  const removed = await store
    .remove(`../files/${OTHER}`, file.id)
    .catch(() => false);

  // then: the remove says it removed nothing
  assert.equal(removed, false);

  // and: U's file still gives its name, mime and bytes
  await assert.doesNotReject(
    store.get(OTHER, file.id),
    "T's remove took U's file",
  );
  const read = await store.get(OTHER, file.id);
  assert.ok(read, "U's file is gone after T's remove");
  assert.deepEqual(
    { name: read.name, mimeType: read.mimeType, bytes: Buffer.from(read.bytes) },
    { name: "../order.csv", mimeType: "text/csv", bytes },
  );
});

test("a put for a thread string that names a path writes nothing outside the files folder", async (t) => {
  // given: thread T holds a file, so the files folder is there
  const dir = await dataDir(t);
  const db = closedAfter(t, new PGlite());
  const store = storeOn(db, dir);
  await store.put(THREAD, {
    name: "kept.csv",
    mimeType: "text/csv",
    bytes: Buffer.from("1\n"),
  });

  // when: a file is put for the thread string ../escaped
  // the call may reject: either way, it writes nothing outside the files folder
  await store
    .put("../escaped", {
      name: "escaped.csv",
      mimeType: "text/csv",
      bytes: Buffer.from("2\n"),
    })
    .catch(() => undefined);

  // then: the data directory holds the files folder and nothing beside it
  assert.deepEqual((await readdir(dir)).sort(), ["files"]);
});
