// The que API (users, connections, the deployment), served by the agent server under /api/que:
// its URLs, response types, and the fetcher every useSWR call uses. The URL is
// the SWR key, so mutate(QUE_API.me) updates everything showing it.

export const QUE_API = {
  me: "/api/que/me",
  users: "/api/que/users",
  connections: "/api/que/connections",
  deployment: "/api/que/deployment",
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

/** What the deployment lists: the agents and models a run can name. */
export type Deployment = {
  /** In the order listed. A chat with no pick gets the first. `model` is the one the agent runs on when no model is picked. */
  agents: { name: string; model: string }[];
  models: { name: string; window: number; maxTokens: number }[];
};

/** GET a URL as JSON; a non-OK response throws, so SWR reports it as an error. */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}
