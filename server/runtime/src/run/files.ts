/**
 * The file routes, mounted under a thread at /threads/:id/files: a user uploads
 * a file to their own thread with a multipart body whose part is named "file",
 * lists the thread's files, reads one back by its id, and deletes it. A file is
 * kept as the store keeps it (@que/files): its row in the table, its bytes under
 * <data>/files/<thread>/<id>/file, and its uploaded name as a name. A thread
 * that is not the user's, and a file that is not its thread's, answer the same
 * 404 as one that is not there. A file over CAP is a 413, answered before the
 * body is read to its end; a body with no "file" part, multipart or not, is a
 * 400 naming it; and a delete of the thread takes its files with it.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import pg from "pg";
import { storeOn, type FileStore } from "@que/files";
import type { ThreadStore } from "@que/threads";
import { dataDir } from "../mount/mounted.js";
import type { SignedIn } from "./signed-in.js";

/** The most a file may be, in bytes: 25 MB. */
export const CAP = 25 * 1024 * 1024;

/** The room a multipart body needs around a file at the cap: its boundaries and each part's headers. */
const ENVELOPE = 64 * 1024;

/** The answer to a body that holds a file over the cap, or that is too big to hold one. */
const TOO_BIG = { error: `a file may be ${CAP} bytes at most` };

/** The answer to a body with no "file" part: one that cannot be read as a form is one too. */
const NO_FILE = { error: 'the body has no "file" part' };

/** The store, on a pool of the server's own, with its bytes under the data directory. */
function createStore(databaseUrl = process.env.DATABASE_URL): FileStore {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // A connection that sits idle in the pool can still be lost (Postgres restarts, or the network drops). The pool
  // drops it and says so with an "error" event, which, with no listener, would end the process (node-postgres, Pool).
  pool.on("error", (error) =>
    console.error("que: an idle Postgres connection was lost:", error.message),
  );
  return storeOn(pool, dataDir);
}

const store = createStore();

/** Deletes a thread's files: each row and folder, then the thread's own folder. */
export async function removeFiles(thread: string): Promise<void> {
  for (const file of await store.list(thread)) {
    await store.remove(thread, file.id);
  }
  await rm(join(dataDir, "files", thread), { recursive: true, force: true });
}

/** The file routes, under a thread of `threads`: each one is the user's own. */
export function fileRoutes(threads: ThreadStore) {
  const routes = new Hono<SignedIn>();

  routes.post(
    "/:id/files",
    // A body over the cap with the room a multipart body needs is a 413 from its content-length, or from a
    // counting stream when it has none: the route never reads it to its end.
    bodyLimit({
      maxSize: CAP + ENVELOPE,
      onError: (c) => c.json(TOO_BIG, 413),
    }),
    async (c) => {
      const thread = await threads.get(c.get("userId"), c.req.param("id"));
      if (!thread) return c.json({ error: "not found" }, 404);
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        // A body that is not a form (JSON, empty, no content type) has no "file" part either.
        return c.json(NO_FILE, 400);
      }
      const uploaded = form.get("file");
      if (!(uploaded instanceof File)) return c.json(NO_FILE, 400);
      if (uploaded.size > CAP) return c.json(TOO_BIG, 413);
      const file = await store.put(thread.id, {
        name: uploaded.name,
        mimeType: uploaded.type,
        bytes: new Uint8Array(await uploaded.arrayBuffer()),
      });
      return c.json(file, 201);
    },
  );

  routes.get("/:id/files", async (c) => {
    const thread = await threads.get(c.get("userId"), c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    return c.json(await store.list(thread.id));
  });

  routes.get("/:id/files/:file", async (c) => {
    const thread = await threads.get(c.get("userId"), c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    const file = await store.get(thread.id, c.req.param("file"));
    if (!file) return c.json({ error: "not found" }, 404);
    // The store reads the bytes with readFile, so they are a Node buffer whose backing is an ArrayBuffer: c.body
    // takes them as they are, and no copy of up to 25 MB is made per download.
    return c.body(file.bytes as Uint8Array<ArrayBuffer>, 200, {
      "content-type": file.mimeType,
    });
  });

  routes.delete("/:id/files/:file", async (c) => {
    const thread = await threads.get(c.get("userId"), c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    return (await store.remove(thread.id, c.req.param("file")))
      ? c.body(null, 204)
      : c.json({ error: "not found" }, 404);
  });

  return routes;
}
