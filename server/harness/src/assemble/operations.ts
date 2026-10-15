/**
 * A package's operations as tools the agent can call. Each one runs with the
 * connection it is handed, so nothing here knows how a user is signed in.
 */

import { tool, type StructuredTool } from "langchain";
import type { PackageDefinition } from "@que/core";
import type { Catalog } from "../access/catalog.js";

// Model APIs only allow [a-zA-Z0-9_-] in tool names (validatePackage enforces it).
export const toolName = (pkg: string, op: string) => `${pkg}_${op}`;

export function operationTools(
  catalog: Catalog,
  connect: (pkg: PackageDefinition) => Promise<unknown>,
): StructuredTool[] {
  return catalog.flatMap(({ pkg: { definition: pkg } }) =>
    pkg.ops.map((op) =>
      tool(
        // An OperationFailed is thrown on: assemble's middleware marks it as a failed call.
        async (params) =>
          JSON.stringify(await op.run({ conn: await connect(pkg) }, params)),
        {
          name: toolName(pkg.name, op.name),
          description: `${op.title}: ${op.description}`,
          schema: op.schema,
        },
      ),
    ),
  );
}
