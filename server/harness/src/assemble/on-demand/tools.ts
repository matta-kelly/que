/**
 * The on-demand tools: how the agent looks inside a plugin and brings an
 * operation into reach. They read any plugin through the plugin contract
 * (@que/plugin) and know nothing about a specific one.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import { nameIn, OperationFailed } from "@que/plugin";
import type { Catalog } from "../../access/catalog.js";
import { skillLine } from "../skills.js";

export const OPEN_PLUGIN = "open_plugin";
export const LOAD_OPERATION = "load_operation";

// A description opens with what the thing is for; the rest is how to use it.
const firstSentence = (text: string) => text.split(/(?<=[.!?])\s/)[0];

const find = (catalog: Catalog, name: string) =>
  catalog.find(({ plugin }) => plugin.definition.name === name)?.plugin;

const noPlugin = (catalog: Catalog, name: string) =>
  new OperationFailed(
    `no plugin "${name}". Plugins: ${catalog.map(({ plugin }) => plugin.definition.name).join(", ")}`,
  );

function openPlugin(catalog: Catalog, hasOperations: boolean): StructuredTool {
  return tool(
    async ({ plugin: name }) => {
      const plugin = find(catalog, name);
      if (!plugin) throw noPlugin(catalog, name);
      const { definition, skills } = plugin;
      return [
        `# ${definition.title} (\`${definition.name}\`)`,
        definition.description,
        ...(definition.ops.length
          ? [
              "## Operations",
              ...definition.ops.map(
                (op) =>
                  `- ${op.name}: ${op.title}. ${firstSentence(op.description)}`,
              ),
            ]
          : []),
        ...(skills.length ? ["## Skills", ...skills.map(skillLine)] : []),
      ].join("\n");
    },
    {
      name: OPEN_PLUGIN,
      description: hasOperations
        ? "Open Plugin: lists what a plugin holds, its operations and skills, with one line each. " +
          "Use it to find the operation for a task. It does not make an operation callable; load_operation does."
        : "Open Plugin: lists what a plugin holds, with one line each.",
      schema: z.object({
        plugin: z.string().describe("Plugin name from the system prompt"),
      }),
    },
  );
}

function loadOperation(catalog: Catalog): StructuredTool {
  return tool(
    async ({ plugin: name, operation }) => {
      const plugin = find(catalog, name);
      if (!plugin) throw noPlugin(catalog, name);
      const ops = plugin.definition.ops.map((op) => op.name);
      if (!ops.length)
        throw new OperationFailed(`plugin "${name}" has no operations.`);
      if (!ops.includes(operation))
        throw new OperationFailed(
          `no operation "${operation}" in ${name}. Operations: ${ops.join(", ")}`,
        );
      return `Loaded. Call it as the tool \`${nameIn(name, operation)}\`; its arguments are in that tool's definition.`;
    },
    {
      name: LOAD_OPERATION,
      description:
        "Load Operation: makes one operation callable. From your next step it is a tool named <plugin>-<operation>, " +
        "with its full description and arguments, and it stays for the rest of the conversation. " +
        "Load each operation you need before calling it; you can load several at once.",
      schema: z.object({
        plugin: z.string().describe("Plugin name"),
        operation: z
          .string()
          .describe("Operation name, as open_plugin lists it"),
      }),
    },
  );
}

/** The tools this config adds. None when no plugin holds an operation or a skill. */
export function tools(catalog: Catalog): StructuredTool[] {
  const hasOperations = catalog.some(
    ({ plugin }) => plugin.definition.ops.length,
  );
  const hasSkills = catalog.some(({ plugin }) => plugin.skills.length);
  if (!hasOperations && !hasSkills) return [];
  return [
    openPlugin(catalog, hasOperations),
    ...(hasOperations ? [loadOperation(catalog)] : []),
  ];
}
