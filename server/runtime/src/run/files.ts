/**
 * The file routes, mounted under a thread at /threads/:id/files: a user uploads
 * a file to their own thread with a multipart body whose part is named "file",
 * lists the thread's files, reads one back by its id, and deletes it. A file is
 * kept as the store keeps it (@que/files): its row in the table, its bytes under
 * <data>/files/<thread>/<id>/file, and its uploaded name as a name. A thread
 * that is not the user's, and a file that is not its thread's, answer the same
 * 404 as one that is not there. A file over CAP is a 413, a body with no "file"
 * part is a 400, and a delete of the thread takes its files with it.
 */

import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import pg from "pg";
import { storeOn, type FileStore } from "@que/files";
import type { ThreadStore } from "@que/threads";
import { name } from "../mount/mounted.js";
import type { SignedIn } from "./signed-in.js";

/** The most a file may be, in bytes: 25 MB. */
export const CAP = 25 * 1024 * 1024;

// The deployment's data: QUE_DATA_DIR, where a server mounts a volume, or the user's data folder (XDG).
const data =
  process.env.QUE_DATA_DIR ||
  join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "que",
    name,
  );

/** The store, on a pool of the server's own, with its bytes under the data directory. */
function createStore(databaseUrl = process.env.DATABASE_URL): FileStore {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // A connection that sits idle in the pool can still be lost (Postgres restarts, or the network drops). The pool
  // drops it and says so with an "error" event, which, with no listener, would end the process (node-postgres, Pool).
  pool.on("error", (error) =>
    console.error("que: an idle Postgres connection was lost:", error.message),
  );
  return storeOn(pool, data);
}

const store = createStore();

/** Deletes a thread's files: each row and folder, then the thread's own folder. */
export async function removeFiles(thread: string): Promise<void> {
  for (const file of await store.list(thread)) {
    await store.remove(thread, file.id);
  }
  await rm(join(data, "files", thread), { recursive: true, force: true });
}

/** The file routes, under a thread of `threads`: each one is the user's own. */
export function fileRoutes(threads: ThreadStore) {
  const routes = new Hono<SignedIn>();

  routes.post("/:id/files", async (c) => {
    const thread = await threads.get(c.get("userId"), c.req.param("id"));
    if (!thread) return c.json({ error: "not found" }, 404);
    const form = await c.req.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) {
      return c.json({ error: 'the body has no "file" part' }, 400);
    }
    if (uploaded.size > CAP) {
      return c.json({ error: `a file may be ${CAP} bytes at most` }, 413);
    }
    const file = await store.put(thread.id, {
      name: uploaded.name,
      mimeType: uploaded.type,
      bytes: new Uint8Array(await uploaded.arrayBuffer()),
    });
    return c.json(file, 201);
  });

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
    return c.body(new Uint8Array(file.bytes), 200, {
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
