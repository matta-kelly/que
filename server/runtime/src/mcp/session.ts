/**
 * One MCP session: the server, and the tools of the deployment this process
 * mounted, on the catalog of the user it answers for. Both mouths build a
 * session here: stdio for the whole process (`stdio.ts`), and HTTP once per
 * request (`serve.ts`), so a user's tool set is made in one place.
 *
 * The tools are assembled when the session is made: a deployment change is
 * seen by the next session, which over stdio is the next process, and over
 * HTTP is the next request.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { User } from "@que/users";
import { door } from "../assemble/door.js";
import { createMcpServer } from "./server.js";
import { toolsOf } from "./tools.js";

/**
 * The MCP server for `user`: whoami, and one tool per op of each plugin in
 * their catalog, each running through the door as them. A server made with no
 * user has whoami alone, and needs no catalog or door.
 */
export async function sessionServer(user?: User): Promise<McpServer> {
  const server = createMcpServer(user);
  if (!user) return server;

  // The catalog, and the door every op runs through as this user, on the same access the web UI uses.
  const [{ catalogFor }, { access }, { plugins }] = await Promise.all([
    import("../access/catalog.js"),
    import("../access/connections.js"),
    import("../mount/mounted.js"),
  ]);
  const call = door(
    access.getConnection,
    plugins.flatMap(({ definition }) =>
      definition.ops.map((op) => ({ plugin: definition.plugin, op })),
    ),
  );
  for (const tool of toolsOf(await catalogFor(user.id))) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input },
      async (params) => {
        const result = await call(tool.placed, params, user.id);
        return {
          // An op that gives back nothing gives the JSON text null.
          content: [{ type: "text", text: JSON.stringify(result) ?? "null" }],
        };
      },
    );
  }
  return server;
}
