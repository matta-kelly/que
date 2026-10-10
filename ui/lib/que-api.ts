// The que API (users, connections), served by the agent server under /api/que:
// its URLs, response types, and the fetcher every useSWR call uses. The URL is
// the SWR key, so mutate(QUE_API.me) updates everything showing it.

export const QUE_API = {
  me: "/api/que/me",
  users: "/api/que/users",
  connections: "/api/que/connections",
} as const;

/** A user; /api/que/me returns the signed-in one. */
export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "admin" | "member";
  createdAt: string;
};

/** A package that needs a credential, and whether this user has connected it. */
export type Connection = {
  name: string;
  title: string;
  description: string;
  fields: { name: string; secret: boolean }[];
  connectedAt: string | null;
};

/** GET a URL as JSON; a non-OK response throws, so SWR reports it as an error. */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}
