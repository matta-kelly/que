/**
 * Credential store: one encrypted record per rep and package, in Postgres.
 * Dumb storage only; the harness validates values against each package's
 * credential schema before saving. Values never leave the server.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import pg from "pg";

export type StoredCredential = { values: Record<string, unknown>; updatedAt: Date };

export type CredentialStore = {
  get(rep: string, pkg: string): Promise<StoredCredential | undefined>;
  set(rep: string, pkg: string, values: Record<string, unknown>): Promise<void>;
  remove(rep: string, pkg: string): Promise<void>;
  list(rep: string): Promise<{ package: string; updatedAt: Date }[]>;
};

// The one place the encryption key comes from. Swap this to fetch it from a
// secret manager later; nothing else changes.
function getKey(): Buffer {
  const key = Buffer.from(process.env.QUE_CREDENTIALS_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("QUE_CREDENTIALS_KEY must be 32 bytes, base64");
  return key;
}

// AES-256-GCM; stored as base64(iv | tag | ciphertext).
function encrypt(values: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(secret: string): Record<string, unknown> {
  const raw = Buffer.from(secret, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
}

export function createStore(databaseUrl = process.env.DATABASE_URL): CredentialStore {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      rep        text        NOT NULL,
      package    text        NOT NULL,
      secret     text        NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (rep, package)
    )`);

  return {
    async get(rep, pkg) {
      await ready;
      const { rows } = await pool.query("SELECT secret, updated_at FROM credentials WHERE rep = $1 AND package = $2", [rep, pkg]);
      return rows[0] ? { values: decrypt(rows[0].secret), updatedAt: rows[0].updated_at } : undefined;
    },
    async set(rep, pkg, values) {
      await ready;
      await pool.query(
        `INSERT INTO credentials (rep, package, secret) VALUES ($1, $2, $3)
         ON CONFLICT (rep, package) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now()`,
        [rep, pkg, encrypt(values)],
      );
    },
    async remove(rep, pkg) {
      await ready;
      await pool.query("DELETE FROM credentials WHERE rep = $1 AND package = $2", [rep, pkg]);
    },
    async list(rep) {
      await ready;
      const { rows } = await pool.query("SELECT package, updated_at FROM credentials WHERE rep = $1", [rep]);
      return rows.map((r) => ({ package: r.package, updatedAt: r.updated_at }));
    },
  };
}
