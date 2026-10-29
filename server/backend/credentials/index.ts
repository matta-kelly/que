/**
 * Credential store: one encrypted record per user and plugin, in Postgres.
 * Dumb storage only; the harness validates values against each plugin's
 * credential schema before saving. Values never leave the server.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import pg from "pg";

export type StoredCredential = {
  values: Record<string, unknown>;
  updatedAt: Date;
};

export type CredentialStore = {
  get(userId: string, plugin: string): Promise<StoredCredential | undefined>;
  set(
    userId: string,
    plugin: string,
    values: Record<string, unknown>,
  ): Promise<void>;
  remove(userId: string, plugin: string): Promise<void>;
  list(userId: string): Promise<{ plugin: string; updatedAt: Date }[]>;
};

/** What the store runs its queries on: a pg pool, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

/**
 * The table, made when it is not there. A table made before plugins were named
 * plugins has the column `package`: it is renamed to `plugin`, with its rows.
 * One statement, so Postgres runs it in one transaction: the rename is done
 * whole or not at all. The lock makes two que processes that start together
 * do it one after the other, so the second finds it done.
 * It looks for the table in current_schema(), where the store makes it.
 */
export const SETUP = `
  DO $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('que.credentials'));
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'credentials'
        AND column_name = 'package'
    ) THEN
      ALTER TABLE credentials RENAME COLUMN package TO plugin;
    END IF;
    CREATE TABLE IF NOT EXISTS credentials (
      rep        text        NOT NULL,
      plugin     text        NOT NULL,
      secret     text        NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (rep, plugin)
    );
  END
  $$`;

// The one place the encryption key comes from. Swap this to fetch it from a
// secret manager later; nothing else changes.
function getKey(): Buffer {
  const key = Buffer.from(process.env.QUE_CREDENTIALS_KEY ?? "", "base64");
  if (key.length !== 32)
    throw new Error("QUE_CREDENTIALS_KEY must be 32 bytes, base64");
  return key;
}

// AES-256-GCM; stored as base64(iv | tag | ciphertext).
function encrypt(values: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(values), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(secret: string): Record<string, unknown> {
  const raw = Buffer.from(secret, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  );
}

export function createStore(
  databaseUrl = process.env.DATABASE_URL,
): CredentialStore {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // A connection that sits idle in the pool can still be lost (Postgres restarts, or the network drops). The pool
  // drops it and says so with an "error" event, which, with no listener, would end the process (node-postgres, Pool).
  pool.on("error", (error) =>
    console.error("que: an idle Postgres connection was lost:", error.message),
  );
  return storeOn(pool);
}

/** The store, on a database it sets up first (`SETUP`). */
export function storeOn(db: Queryable): CredentialStore {
  const ready = db.query(SETUP);

  return {
    async get(userId, plugin) {
      await ready;
      const { rows } = await db.query(
        "SELECT secret, updated_at FROM credentials WHERE rep = $1 AND plugin = $2",
        [userId, plugin],
      );
      return rows[0]
        ? { values: decrypt(rows[0].secret), updatedAt: rows[0].updated_at }
        : undefined;
    },
    async set(userId, plugin, values) {
      await ready;
      await db.query(
        `INSERT INTO credentials (rep, plugin, secret) VALUES ($1, $2, $3)
         ON CONFLICT (rep, plugin) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now()`,
        [userId, plugin, encrypt(values)],
      );
    },
    async remove(userId, plugin) {
      await ready;
      await db.query("DELETE FROM credentials WHERE rep = $1 AND plugin = $2", [
        userId,
        plugin,
      ]);
    },
    async list(userId) {
      await ready;
      const { rows } = await db.query(
        "SELECT plugin, updated_at FROM credentials WHERE rep = $1",
        [userId],
      );
      return rows.map((r) => ({ plugin: r.plugin, updatedAt: r.updated_at }));
    },
  };
}
