/**
 * que's MCP server over stdio, for a harness that is not que. Run with
 * `npm run mcp`: stdin and stdout are the protocol, so nothing else writes to
 * stdout.
 *
 * The tools are assembled on the session's start, from the deployment this
 * process mounted and the catalog of the user it answers for: a deployment
 * change is seen by the next session, which is the next process.
 */

import { checkAccessSettings, identify } from "@que/identity";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { User } from "@que/users";
import { door } from "../assemble/door.js";
import { createMcpServer, sessionHeaders } from "./server.js";
import { toolsOf } from "./tools.js";

// Before the protocol starts: a bad identity setting stops here, and names it.
checkAccessSettings();

const identity = await identify(sessionHeaders());

// The user's row lives in the database. A session without one still answers whoami, as the identity, and gives no tools.
let user: User | undefined;
if (identity && process.env.DATABASE_URL) {
  const { users } = await import("../access/users.js");
  user = await users.ensure(identity);
}

const server = createMcpServer(user);

if (user) {
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
}

await server.connect(new StdioServerTransport());
