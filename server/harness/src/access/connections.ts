/**
 * Credentials: resolve a user's credential for a plugin, and keep one open
 * connection per user and plugin. The only place credentials are handled.
 *
 * Credentials live encrypted in the store (@que/credentials), validated
 * against each plugin's credential schema.
 */

import {
  OperationFailed,
  type PluginDefinition,
  type ServiceIdentity,
} from "@mku1tra/que-plugin";
import { createStore } from "@que/credentials";

const store = createStore();

type Resolved = { values: Record<string, unknown>; version: number };

export async function resolveCredential(
  plugin: PluginDefinition,
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

/** A user can use a plugin if it needs no credential, or theirs resolves. */
export async function hasAccess(
  plugin: PluginDefinition,
  userId: string,
): Promise<boolean> {
  return (
    !plugin.credential ||
    (await resolveCredential(plugin, userId)) !== undefined
  );
}

/** Validate against the plugin's schema, prove it connects, then save. */
export async function setCredential(
  plugin: PluginDefinition,
  userId: string,
  values: unknown,
): Promise<void> {
  if (!plugin.credential)
    throw new OperationFailed(`${plugin.name} needs no credential`);
  const parsed = plugin.credential.safeParse(values);
  if (!parsed.success)
    throw new OperationFailed(
      `invalid ${plugin.name} credential: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
    );
  await plugin.connect?.(parsed.data);
  await store.set(userId, plugin.name, parsed.data);
}

export async function removeCredential(
  plugin: PluginDefinition,
  userId: string,
): Promise<void> {
  await store.remove(userId, plugin.name);
}

export async function connectedPlugins(
  userId: string,
): Promise<Map<string, Date>> {
  return new Map(
    (await store.list(userId)).map((r) => [r.plugin, r.updatedAt]),
  );
}

// One open connection per user and plugin, and who it's logged in as, keyed
// by credential version: a changed or re-entered credential opens a fresh
// connection and drops the stale one.
type Session = {
  key: string;
  conn: Promise<unknown>;
  identity?: Promise<ServiceIdentity>;
};
const sessions = new Map<string, Session>(); // by `${plugin}:${userId}`

async function session(
  plugin: PluginDefinition,
  userId: string,
): Promise<Session> {
  const credential = await resolveCredential(plugin, userId);
  if (plugin.credential && !credential)
    throw new OperationFailed(`no ${plugin.name} credential for ${userId}`);
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

export async function getConnection(
  plugin: PluginDefinition,
  userId: string,
): Promise<unknown> {
  if (!plugin.connect) return undefined;
  return (await session(plugin, userId)).conn;
}

/** Who this user is in the plugin's service, or undefined if it can't say. */
export async function getServiceIdentity(
  plugin: PluginDefinition,
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
}
