/**
 * A plugin's operations as tools the agent can call. Each one runs through the
 * call it is handed (the door), so nothing here knows how a user is signed in.
 */

import { tool, type StructuredTool } from "langchain";
import type { Catalog } from "../access/catalog.js";
import type { PlacedOp } from "./door.js";

// An op's tool name is its node's name: one name in the model's tools and in the graph. Model APIs allow it, at most
// 64 characters (the plugin schema's tool-name rule enforces it).

export function operationTools(
  catalog: Catalog,
  call: (op: PlacedOp, params: unknown) => Promise<unknown>,
): StructuredTool[] {
  return catalog.flatMap(({ plugin: { definition } }) =>
    definition.ops.map((op) =>
      tool(
        // An OpFailed is thrown on: assemble's middleware marks it as a failed call.
        async (params) =>
          JSON.stringify(await call({ plugin: definition.plugin, op }, params)),
        {
          name: op.name,
          description: `${op.title}: ${op.description}`,
          schema: op.input,
        },
      ),
    ),
  );
}
