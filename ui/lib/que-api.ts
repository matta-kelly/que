// The que API (users, connections, the deployment), served by the agent server under /api/que:
// its URLs, response types, and the fetcher every useSWR call uses. The URL is
// the SWR key, so mutate(QUE_API.me) updates everything showing it.

export const QUE_API = {
  me: "/api/que/me",
  users: "/api/que/users",
  connections: "/api/que/connections",
  deployment: "/api/que/deployment",
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

/** The signed-in user, from /api/que/me: their row, and their own instructions. */
export type Me = User & {
  /** The text in use, or none. */
  instructions: string | null;
  /** `file`: a file of the deployment sets the text, and it cannot be changed here. */
  instructionsFrom: "file" | "account";
};

/** A plugin that needs a credential, and whether this user has connected it. */
export type Connection = {
  name: string;
  title: string;
  description: string;
  fields: { name: string; secret: boolean }[];
  connectedAt: string | null;
};

/** What a model costs: dollars for one million tokens. With no `cachedInput`, cached tokens are at `input`. */
export type ModelPrice = {
  input: number;
  output: number;
  cachedInput?: number;
};

/** What the deployment lists: the agents and models a run can name. */
export type Deployment = {
  /** In the order listed. A chat with no pick gets the first. `model` is the one the agent runs on when no model is picked. */
  agents: { name: string; model: string; summarizeAt?: number }[];
  /** A model with no price, and any model on an older server, has no `price`: its cost is not shown. */
  models: {
    name: string;
    window: number;
    maxTokens: number;
    price?: ModelPrice;
  }[];
};

/** GET a URL as JSON; a non-OK response throws, so SWR reports it as an error. */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}
