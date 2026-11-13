// The que API (the signed-in user, users, connections, domains), served by que's server under /api/que:
// its URLs, response types, and the fetcher every useSWR call uses. The URL is
// the SWR key, so mutate(QUE_API.me) updates everything showing it.

export const QUE_API = {
  me: "/api/que/me",
  users: "/api/que/users",
  connections: "/api/que/connections",
  domains: "/api/que/domains",
  adminUsers: "/api/que/admin/users",
  adminDomains: "/api/que/admin/domains",
} as const;

/** A user, as the list of users gives one. */
export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "admin" | "member";
  createdAt: string;
};

/** The signed-in user, from /api/que/me: their row. */
export type Me = User;

/** A user as the admin list gives one: their row, and the domains granted to them. */
export type AdminUser = User & {
  grants: string[];
};

/** A plugin that needs a credential, and whether this user has connected it. */
export type Connection = {
  name: string;
  title: string;
  description: string;
  fields: { name: string; secret: boolean }[];
  connectedAt: string | null;
};

/** A domain: its name, the connectors it needs, and the roles it gives. */
export type Domain = {
  name: string;
  connectors: string[];
  roles: string[];
};

/** GET a URL as JSON; a non-OK response throws, so SWR reports it as an error. */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}
