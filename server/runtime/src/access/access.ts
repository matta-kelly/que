/**
 * Access by op, on the credential store it is given: the login a call gets, by the op's plugin and role and the user.
 * The only place credentials are handled: it resolves a user's credential for a plugin, and keeps one open connection
 * per user and plugin.
 *
 * Credentials live encrypted in the store (@que/credentials), validated against each plugin's credential schema.
 */

import {
  OpFailed,
  type Op,
  type Plugin,
  type ServiceIdentity,
} from "@mku1tra/que-plugin";
import type { CredentialStore } from "@que/credentials";

/** The connection for an op's plugin and role, as this user. */
export type Connect = (
  plugin: Plugin,
  role: Op["role"],
  user: string,
) => Promise<unknown>;

export type Access = ReturnType<typeof accessOn>;

type Resolved = { values: Record<string, unknown>; version: number };

// One open connection per user and plugin, and who it's logged in as, keyed by credential version: a changed or
// re-entered credential opens a fresh connection and drops the stale one.
type Session = {
  key: string;
  conn: Promise<unknown>;
  identity?: Promise<ServiceIdentity>;
};

/** Access on its credential store. The runtime makes the store once, with `createStore()`. */
export function accessOn(store: CredentialStore) {
  const sessions = new Map<string, Session>(); // by `${plugin}:${userId}`

  async function resolveCredential(
    plugin: Plugin,
    userId: string,
  ): Promise<Resolved | undefined> {
    if (!plugin.credential) return undefined;
    const stored = await store.get(userId, plugin.name);
    if (!stored) return undefined;
    const parsed = plugin.credential.safeParse(stored.values);
    return parsed.success
      ? { values: parsed.data, version: stored.updatedAt.getTime() }
      : undefined;
  }

  async function session(plugin: Plugin, userId: string): Promise<Session> {
    const credential = await resolveCredential(plugin, userId);
    if (plugin.credential && !credential)
      throw new OpFailed(`no ${plugin.name} credential for ${userId}`);
    const slot = `${plugin.name}:${userId}`;
    const key = `${slot}:${credential?.version ?? 0}`;
    const current = sessions.get(slot);
    if (current?.key === key) return current;
    const fresh: Session = {
      key,
      conn: plugin.connect
        ? plugin.connect(credential?.values ?? {})
        : Promise.resolve(undefined),
    };
    sessions.set(slot, fresh); // replaces the stale version, if any
    fresh.conn.catch(() => {
      if (sessions.get(slot) === fresh) sessions.delete(slot); // failed logins are retried on the next call
    });
    return fresh;
  }

  /**
   * The connection for an op, as this user. A user with no credential the plugin needs gets an OpFailed that names
   * the plugin. One credential serves every role of a plugin, so the role does not change the connection.
   */
  const getConnection: Connect = async (plugin, _role, userId) => {
    if (!plugin.connect) return undefined;
    return (await session(plugin, userId)).conn;
  };

  return {
    getConnection,

    /** A user can use a plugin if it needs no credential, or theirs resolves. */
    async hasAccess(plugin: Plugin, userId: string): Promise<boolean> {
      return (
        !plugin.credential ||
        (await resolveCredential(plugin, userId)) !== undefined
      );
    },

    /** Validate against the plugin's schema, prove it connects, then save. */
    async setCredential(
      plugin: Plugin,
      userId: string,
      values: unknown,
    ): Promise<void> {
      if (!plugin.credential)
        throw new OpFailed(`${plugin.name} needs no credential`);
      const parsed = plugin.credential.safeParse(values);
      if (!parsed.success)
        throw new OpFailed(
          `invalid ${plugin.name} credential: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
        );
      await plugin.connect?.(parsed.data);
      await store.set(userId, plugin.name, parsed.data);
    },

    async removeCredential(plugin: Plugin, userId: string): Promise<void> {
      await store.remove(userId, plugin.name);
    },

    async connectedPlugins(userId: string): Promise<Map<string, Date>> {
      return new Map(
        (await store.list(userId)).map((r) => [r.plugin, r.updatedAt]),
      );
    },

    /** Who this user is in the plugin's service, or undefined if it can't say. */
    async getServiceIdentity(
      plugin: Plugin,
      userId: string,
    ): Promise<ServiceIdentity | undefined> {
      const whoami = plugin.whoami;
      if (!whoami) return undefined;
      let s: Session | undefined;
      try {
        s = await session(plugin, userId);
        s.identity ??= s.conn.then((conn) => whoami(conn));
        return await s.identity;
      } catch {
        if (s) s.identity = undefined; // asked again on the next call
        return undefined;
      }
    },
  };
}
