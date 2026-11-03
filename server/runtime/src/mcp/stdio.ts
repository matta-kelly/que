/**
 * que's MCP server over stdio, for a harness that is not que. Run with
 * `npm run mcp`: stdin and stdout are the protocol, so nothing else writes to
 * stdout.
 */

import { checkAccessSettings } from "@que/identity";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

// Before the protocol starts: a bad identity setting stops here, and names it.
checkAccessSettings();

await createMcpServer().connect(new StdioServerTransport());
