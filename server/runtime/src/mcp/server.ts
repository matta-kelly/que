/**
 * que's MCP server: a deployment's ops as tools and its skills, for any harness.
 *
 * On HTTP, who is asking is the request's identity: `signedIn` resolves the row
 * and `createMcpServer(user)` takes it. Without a row, `identify(headers)` is the
 * stdio fallback: there are no HTTP headers, so `QUE_ACCESS_JWT` carries the
 * Access JWT as `cf-access-jwt-assertion`. In dev, `DEV_USER_EMAIL` decides.
 */

import { McpServer } from "@modelcontextprotocol/server";
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
 * for that row; a server made without one answers the identity `identify` names.
 * `instructions` are the server instructions a client gives its model. The tools
 * and skills, which need the user's catalog, are added by `session.ts`, for both
 * mouths.
 */
export function createMcpServer(user?: User, instructions?: string): McpServer {
  const headers = sessionHeaders();
  const server = new McpServer(
    { name: "que", version: "0.0.0" },
    instructions === undefined ? {} : { instructions },
  );

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
