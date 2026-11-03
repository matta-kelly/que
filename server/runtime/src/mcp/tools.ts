/**
 * The MCP tools a deployment gives: one tool per op of each plugin in the
 * user's catalog, named `<plugin>.<op>`. The name is checked when the tool is
 * made, and two ops that come to one name are refused, so nothing shadows
 * another.
 */

import type { Op } from "@mku1tra/que-plugin";
import type { PlacedOp } from "../assemble/door.js";
import type { Catalog } from "../access/catalog.js";

/** One MCP tool a mounted op gives: its name, what it does, its input, and the op behind it. */
export type McpTool = {
  name: string;
  description: string;
  input: Op["input"];
  placed: PlacedOp;
};

/** The tool name an op of a plugin comes to. */
export function toolName(_plugin: string, _op: string): string {
  return "";
}

/** The tools a catalog gives, one for each op of each plugin it holds. */
export function toolsOf(_catalog: Catalog): McpTool[] {
  return [];
}
