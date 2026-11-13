/**
 * Users: one row per person, created automatically the first time their
 * identity shows up (just-in-time provisioning). Everything per-user
 * (credentials, grants) is keyed by `User.id`. The first user is an admin.
 */

import pg from "pg";

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "admin" | "member";
  createdAt: Date;
};

export type Users = {
  /** Get the user for this identity, creating them on first sight. */
  ensure(identity: { email: string; name: string }): Promise<User>;
  get(id: string): Promise<User | undefined>;
  list(): Promise<User[]>;
  /** Set the user's role to admin or member. */
  setRole(id: string, role: User["role"]): Promise<User | undefined>;
  /** `avatarUrl`: a picture to save, `null` to remove it. Left out, a field stays as it is. */
  update(
    id: string,
    changes: { name?: string; avatarUrl?: string | null },
  ): Promise<User | undefined>;
};

type Row = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: User["role"];
  created_at: Date;
};
const toUser = (r: Row): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  avatarUrl: r.avatar_url,
  role: r.role,
  createdAt: r.created_at,
});

export function createUsers(databaseUrl = process.env.DATABASE_URL): Users {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // A connection that sits idle in the pool can still be lost (Postgres restarts, or the network drops). The pool
  // drops it and says so with an "error" event, which, with no listener, would end the process (node-postgres, Pool).
  pool.on("error", (error) =>
    console.error("que: an idle Postgres connection was lost:", error.message),
  );
  const ready = pool.query(
    `
    CREATE TABLE IF NOT EXISTS users (
      id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      email      text        NOT NULL UNIQUE,
      name       text        NOT NULL,
      avatar_url text,
      role       text        NOT NULL DEFAULT 'member',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  );

  return {
    async ensure({ email, name }) {
      await ready;
      const { rows } = await pool.query<Row>(
        `INSERT INTO users (email, name, role)
         VALUES ($1, $2, CASE WHEN EXISTS (SELECT 1 FROM users) THEN 'member' ELSE 'admin' END)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING *`,
        [email.toLowerCase(), name],
      );
      return toUser(rows[0]);
    },
    async get(id) {
      await ready;
      const { rows } = await pool.query<Row>(
        "SELECT * FROM users WHERE id = $1",
        [id],
      );
      return rows[0] && toUser(rows[0]);
    },
    async list() {
      await ready;
      const { rows } = await pool.query<Row>(
        "SELECT * FROM users ORDER BY created_at",
      );
      return rows.map(toUser);
    },
    async setRole(id, role) {
      await ready;
      const { rows } = await pool.query<Row>(
        "UPDATE users SET role = $2 WHERE id = $1 RETURNING *",
        [id, role],
      );
      return rows[0] && toUser(rows[0]);
    },
    async update(id, { name, avatarUrl }) {
      await ready;
      const { rows } = await pool.query<Row>(
        `UPDATE users SET
           name       = COALESCE($2, name),
           avatar_url = CASE WHEN $3::boolean THEN $4 ELSE avatar_url END
         WHERE id = $1 RETURNING *`,
        [
          id,
          name?.trim() || null,
          avatarUrl !== undefined,
          avatarUrl?.trim() || null,
        ],
      );
      return rows[0] && toUser(rows[0]);
    },
  };
}
