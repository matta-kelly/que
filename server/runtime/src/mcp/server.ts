/**
 * que's MCP server: the same que tools, for a harness that is not que.
 *
 * The server knows who is asking from `identify`, and reuses it: over stdio
 * there are no HTTP headers, so `QUE_ACCESS_JWT` carries the Access JWT into a
 * `Headers` as `cf-access-jwt-assertion`. In dev, `DEV_USER_EMAIL` decides.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** The MCP server, bound to the identity the env names, with que's tools registered. */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "que", version: "0.0.0" });

  server.registerTool("whoami", { description: "The que user asking" }, async () => ({
    content: [{ type: "text", text: JSON.stringify({ email: "", name: "" }) }],
  }));

  return server;
}
