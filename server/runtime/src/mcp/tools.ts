/**
 * The MCP tools a deployment gives: one tool per op of each plugin in the
 * user's catalog, named by the op's own name, the name its plugin's skills use.
 * The name is checked when the tool is made, and two ops with one name are
 * refused, so nothing shadows another.
 */

import type { Approval, Op } from "@mku1tra/que-plugin";
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

/** The last line a flagged op's tool description carries: the model reads it and does not call the op. */
const APPROVAL_LINE =
  "Needs approval, and cannot be approved over MCP: do not call it.";

/** The line an op whose approval has a `when` ends with: the door refuses only the calls `when` names. */
const SOME_LINE =
  "Some calls need approval, which cannot be given over MCP: those calls are refused, and the others run.";

/** The line a flagged op's description ends with: one whose every call needs approval, or one whose `when` names some calls. */
function approvalLine(approval: Approval): string {
  return typeof approval === "object" ? SOME_LINE : APPROVAL_LINE;
}

/** The tool name of an op of a plugin: the op's own name, refused when a harness could not take it as a name. */
export function toolName(plugin: string, op: string): string {
  if (!NAME.test(op))
    throw new Error(
      `mcp: the op ${op} of the plugin ${plugin} has a character outside [a-z0-9._-], so it cannot be a tool name`,
    );
  if (op.length > LIMIT)
    throw new Error(
      `mcp: the op ${op} of the plugin ${plugin} is ${op.length} characters: model APIs take at most ${LIMIT}`,
    );
  return op;
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
          `mcp: two ops have the tool name ${name}: one in the plugin ${other.plugin.name} and one in the plugin ${placed.plugin.name}`,
        );
      named.set(name, placed);
      tools.push({
        name,
        // A call that needs approval cannot run over MCP, so the description says so, after the op's own text.
        description: op.approval
          ? `${op.description}\n\n${approvalLine(op.approval)}`
          : op.description,
        input: op.input,
        // A flagged op changes data: the host reads the hint, and the door still refuses the call.
        ...(op.approval ? { annotations: { destructiveHint: true } } : {}),
        placed,
      });
    }
  }
  return tools;
}
