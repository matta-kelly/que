/**
 * A plugin's operations as tools the agent can call. Each one runs with the
 * connection it is handed, so nothing here knows how a user is signed in.
 */

import { tool, type StructuredTool } from "langchain";
import type { PluginDefinition } from "@que/core";
import type { Catalog } from "../access/catalog.js";

// Model APIs only allow [a-zA-Z0-9_-] in tool names (validatePlugin enforces it).
export const toolName = (plugin: string, op: string) => `${plugin}_${op}`;

export function operationTools(
  catalog: Catalog,
  connect: (plugin: PluginDefinition) => Promise<unknown>,
): StructuredTool[] {
  return catalog.flatMap(({ plugin: { definition: plugin } }) =>
    plugin.ops.map((op) =>
      tool(
        // An OperationFailed is thrown on: assemble's middleware marks it as a failed call.
        async (params) =>
          JSON.stringify(await op.run({ conn: await connect(plugin) }, params)),
        {
          name: toolName(plugin.name, op.name),
          description: `${op.title}: ${op.description}`,
          schema: op.schema,
        },
      ),
    ),
  );
}
