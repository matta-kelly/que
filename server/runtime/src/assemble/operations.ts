/**
 * A plugin's operations as tools the agent can call. Each one runs with the
 * connection it is handed, so nothing here knows how a user is signed in.
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
  void call;
  return catalog.flatMap(({ plugin: { definition } }) =>
    definition.ops.map((op) =>
      tool(
        async () => undefined, // stub: da-hammer builds it
        {
          name: op.name,
          description: `${op.title}: ${op.description}`,
          schema: op.input,
        },
      ),
    ),
  );
}
