/**
 * Credentials: resolve a rep's credential for a package, and keep one open
 * connection per rep and package. The only place credentials are handled.
 *
 * Credentials live encrypted in the store (@que/credentials), validated
 * against each package's credential schema.
 */

import {
  OperationFailed,
  type PackageDefinition,
  type ServiceIdentity,
} from "@que/core";
import { createStore } from "@que/credentials";

const store = createStore();

type Resolved = { values: Record<string, unknown>; version: number };

export async function resolveCredential(
  pkg: PackageDefinition,
  rep: string,
): Promise<Resolved | undefined> {
  if (!pkg.credential) return undefined;
  const stored = await store.get(rep, pkg.name);
  if (!stored) return undefined;
  const parsed = pkg.credential.safeParse(stored.values);
  return parsed.success
    ? { values: parsed.data, version: stored.updatedAt.getTime() }
    : undefined;
}

/** A rep can use a package if it needs no credential, or theirs resolves. */
export async function hasAccess(
  pkg: PackageDefinition,
  rep: string,
): Promise<boolean> {
  return !pkg.credential || (await resolveCredential(pkg, rep)) !== undefined;
}

/** Validate against the package's schema, prove it connects, then save. */
export async function setCredential(
  pkg: PackageDefinition,
  rep: string,
  values: unknown,
): Promise<void> {
  if (!pkg.credential)
    throw new OperationFailed(`${pkg.name} needs no credential`);
  const parsed = pkg.credential.safeParse(values);
  if (!parsed.success)
    throw new OperationFailed(
      `invalid ${pkg.name} credential: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
    );
  await pkg.connect?.(parsed.data);
  await store.set(rep, pkg.name, parsed.data);
}

export async function removeCredential(
  pkg: PackageDefinition,
  rep: string,
): Promise<void> {
  await store.remove(rep, pkg.name);
}

export async function connectedPackages(
  rep: string,
): Promise<Map<string, Date>> {
  return new Map((await store.list(rep)).map((r) => [r.package, r.updatedAt]));
}

// One open connection per rep and package, and who it's logged in as, keyed
// by credential version: a changed or re-entered credential opens a fresh
// connection and drops the stale one.
type Session = {
  key: string;
  conn: Promise<unknown>;
  identity?: Promise<ServiceIdentity>;
};
const sessions = new Map<string, Session>(); // by `${pkg}:${rep}`

async function session(pkg: PackageDefinition, rep: string): Promise<Session> {
  const credential = await resolveCredential(pkg, rep);
  if (pkg.credential && !credential)
    throw new OperationFailed(`no ${pkg.name} credential for ${rep}`);
  const slot = `${pkg.name}:${rep}`;
  const key = `${slot}:${credential?.version ?? 0}`;
  const current = sessions.get(slot);
  if (current?.key === key) return current;
  const fresh: Session = {
    key,
    conn: pkg.connect
      ? pkg.connect(credential?.values ?? {})
      : Promise.resolve(undefined),
  };
  sessions.set(slot, fresh); // replaces the stale version, if any
  fresh.conn.catch(() => {
    if (sessions.get(slot) === fresh) sessions.delete(slot); // failed logins are retried on the next call
  });
  return fresh;
}

export async function getConnection(
  pkg: PackageDefinition,
  rep: string,
): Promise<unknown> {
  if (!pkg.connect) return undefined;
  return (await session(pkg, rep)).conn;
}

/** Who this user is in the package's service, or undefined if it can't say. */
export async function getServiceIdentity(
  pkg: PackageDefinition,
  rep: string,
): Promise<ServiceIdentity | undefined> {
  const whoami = pkg.whoami;
  if (!whoami) return undefined;
  let s: Session | undefined;
  try {
    s = await session(pkg, rep);
    s.identity ??= s.conn.then((conn) => whoami(conn));
    return await s.identity;
  } catch {
    if (s) s.identity = undefined; // asked again on the next call
    return undefined;
  }
}
