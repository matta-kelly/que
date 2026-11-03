/**
 * que's MCP server over stdio, for a harness that is not que. Run with
 * `npm run mcp`: stdin and stdout are the protocol, so nothing else writes to
 * stdout.
 *
 * The session is built by `session.ts`, on the deployment this process mounted
 * and the catalog of the user it answers for: a deployment change is seen by
 * the next session, which is the next process.
 */

import { checkAccessSettings, identify } from "@que/identity";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { User } from "@que/users";
import { sessionHeaders } from "./server.js";
import { sessionServer } from "./session.js";

// Before the protocol starts: a bad identity setting stops here, and names it.
checkAccessSettings();

const identity = await identify(sessionHeaders());

// The user's row lives in the database. A session without one still answers whoami, as the identity, and gives no tools.
let user: User | undefined;
if (identity && process.env.DATABASE_URL) {
  const { users } = await import("../access/users.js");
  user = await users.ensure(identity);
}

const server = await sessionServer(user);

await server.connect(new StdioServerTransport());
