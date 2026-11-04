/**
 * The MCP tools a deployment gives: one tool per op of each plugin in the
 * user's catalog, named `<plugin>.<op>`. The name is checked when the tool is
 * made, and two ops that come to one name are refused, so nothing shadows
 * another.
 */

import type { Op } from "@mku1tra/que-plugin";
import type { ToolAnnotations } from "@modelcontextprotocol/server";
import type { PlacedOp } from "../assemble/door.js";
import type { Catalog } from "../access/catalog.js";

/** One MCP tool a mounted op gives: its name, what it does, its input, the hints a host reads, and the op behind it. */
export type McpTool = {
  name: string;
  description: string;
  input: Op["input"];
  annotations?: ToolAnnotations;
  placed: PlacedOp;
};

/** The characters a tool name may hold: a harness reads it as a name, not as a path or a pattern. */
const NAME = /^[a-z0-9._-]+$/;

/** The most characters a tool name may hold: model APIs take at most 64. */
const LIMIT = 64;

/** The tool name an op of a plugin comes to. */
export function toolName(plugin: string, op: string): string {
  const name = `${plugin}.${op}`.toLowerCase();
  if (!NAME.test(name))
    throw new Error(
      `mcp: the plugin ${plugin} and its op ${op} come to the tool name ${name}, which has a character outside [a-z0-9._-]`,
    );
  if (name.length > LIMIT)
    throw new Error(
      `mcp: the tool name ${name} is ${name.length} characters: model APIs take at most ${LIMIT}`,
    );
  return name;
}

/** The tools a catalog gives, one for each op of each plugin it holds. */
export function toolsOf(catalog: Catalog): McpTool[] {
  const tools: McpTool[] = [];
  const named = new Map<string, PlacedOp>();
  for (const { plugin } of catalog) {
    for (const op of plugin.definition.ops) {
      const placed: PlacedOp = { plugin: plugin.definition.plugin, op };
      const name = toolName(placed.plugin.name, op.name);
      const other = named.get(name);
      if (other)
        throw new Error(
          `mcp: two ops come to the tool ${name}: ${other.plugin.name}.${other.op.name} and ${placed.plugin.name}.${placed.op.name}`,
        );
      named.set(name, placed);
      tools.push({
        name,
        description: op.description,
        input: op.input,
        // A flagged op changes data: the host reads the hint, and the door still asks.
        ...(op.approval ? { annotations: { destructiveHint: true } } : {}),
        placed,
      });
    }
  }
  return tools;
}
