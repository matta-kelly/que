/**
 * The on-demand tools, as LangChain tools: how the agent looks inside a plugin and brings an operation into reach.
 * What each one does is open.ts's.
 */

import { tool, type StructuredTool } from "langchain";
import type { Catalog } from "../../access/catalog.js";
import { LOAD_OPERATION, OPEN_PLUGIN } from "../names.js";
import {
  load,
  LOAD_DESCRIPTION,
  loadSchema,
  open,
  openDescription,
  openSchema,
  reach,
} from "./open.js";

/** The tools this config adds. None when no plugin holds an operation or a skill. */
export function tools(catalog: Catalog): StructuredTool[] {
  const { open: opens, load: loads } = reach(catalog);
  if (!opens) return [];
  return [
    tool(async ({ plugin }) => open(catalog, plugin), {
      name: OPEN_PLUGIN,
      description: openDescription(loads),
      schema: openSchema,
    }),
    ...(loads
      ? [
          tool(
            async ({ plugin, operation }) => load(catalog, plugin, operation),
            {
              name: LOAD_OPERATION,
              description: LOAD_DESCRIPTION,
              schema: loadSchema,
            },
          ),
        ]
      : []),
  ];
}
