/**
 * que's MCP server: the same que tools, for a harness that is not que.
 *
 * The server knows who is asking from `identify`, and reuses it: over stdio
 * there are no HTTP headers, so `QUE_ACCESS_JWT` carries the Access JWT into a
 * `Headers` as `cf-access-jwt-assertion`. In dev, `DEV_USER_EMAIL` decides.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { identify } from "@que/identity";
import type { User } from "@que/users";

/** The headers `identify` reads, made from the env a session starts with: the Access JWT, as the header. */
export function sessionHeaders(env = process.env): Headers {
  const headers = new Headers();
  const token = env.QUE_ACCESS_JWT?.trim();
  if (token) headers.set("cf-access-jwt-assertion", token);
  return headers;
}

/**
 * The MCP server. `user` is the users row the session resolved, so whoami answers
 * for that row; a server made without one answers the identity the env names.
 * The tools, which need the user's catalog, are the session's to register
 * (`stdio.ts`).
 */
export function createMcpServer(user?: User): McpServer {
  const headers = sessionHeaders();
  const server = new McpServer({ name: "que", version: "0.0.0" });

  server.registerTool(
    "whoami",
    { description: "The que user asking" },
    async () => {
      const who = user ?? (await identify(headers));
      if (!who)
        throw new Error(
          "whoami: no que user for this session. Set QUE_ACCESS_JWT, or DEV_USER_EMAIL in dev",
        );
      return { content: [{ type: "text", text: JSON.stringify(who) }] };
    },
  );

  return server;
}
