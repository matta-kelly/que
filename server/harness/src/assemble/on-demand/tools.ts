/**
 * The on-demand tools: how the agent looks inside a package and brings an
 * operation into reach. They read any package through the package spec
 * (@que/core) and know nothing about a specific one.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import { OperationFailed } from "@que/core";
import type { Catalog } from "../../access/catalog.js";
import { toolName } from "../operations.js";
import { skillLine } from "../skills.js";

export const OPEN_PACKAGE = "open_package";
export const LOAD_OPERATION = "load_operation";

// A description opens with what the thing is for; the rest is how to use it.
const firstSentence = (text: string) => text.split(/(?<=[.!?])\s/)[0];

const find = (catalog: Catalog, name: string) =>
  catalog.find(({ pkg }) => pkg.definition.name === name)?.pkg;

const noPackage = (catalog: Catalog, name: string) =>
  new OperationFailed(
    `no package "${name}". Packages: ${catalog.map(({ pkg }) => pkg.definition.name).join(", ")}`,
  );

function openPackage(catalog: Catalog, hasOperations: boolean): StructuredTool {
  return tool(
    async ({ package: name }) => {
      const pkg = find(catalog, name);
      if (!pkg) throw noPackage(catalog, name);
      const { definition, skills } = pkg;
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
      name: OPEN_PACKAGE,
      description: hasOperations
        ? "Open Package: lists what a package holds, its operations and skills, with one line each. " +
          "Use it to find the operation for a task. It does not make an operation callable; load_operation does."
        : "Open Package: lists what a package holds, with one line each.",
      schema: z.object({
        package: z.string().describe("Package name from the system prompt"),
      }),
    },
  );
}

function loadOperation(catalog: Catalog): StructuredTool {
  return tool(
    async ({ package: name, operation }) => {
      const pkg = find(catalog, name);
      if (!pkg) throw noPackage(catalog, name);
      const ops = pkg.definition.ops.map((op) => op.name);
      if (!ops.length)
        throw new OperationFailed(`package "${name}" has no operations.`);
      if (!ops.includes(operation))
        throw new OperationFailed(
          `no operation "${operation}" in ${name}. Operations: ${ops.join(", ")}`,
        );
      return `Loaded. Call it as the tool \`${toolName(name, operation)}\`; its arguments are in that tool's definition.`;
    },
    {
      name: LOAD_OPERATION,
      description:
        "Load Operation: makes one operation callable. From your next step it is a tool named <package>_<operation>, " +
        "with its full description and arguments, and it stays for the rest of the conversation. " +
        "Load each operation you need before calling it; you can load several at once.",
      schema: z.object({
        package: z.string().describe("Package name"),
        operation: z
          .string()
          .describe("Operation name, as open_package lists it"),
      }),
    },
  );
}

/** The tools this config adds. None when no package holds an operation or a skill. */
export function tools(catalog: Catalog): StructuredTool[] {
  const hasOperations = catalog.some(({ pkg }) => pkg.definition.ops.length);
  const hasSkills = catalog.some(({ pkg }) => pkg.skills.length);
  if (!hasOperations && !hasSkills) return [];
  return [
    openPackage(catalog, hasOperations),
    ...(hasOperations ? [loadOperation(catalog)] : []),
  ];
}
