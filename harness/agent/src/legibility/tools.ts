/**
 * The harness's own tools: how the agent looks inside a package and brings an
 * operation into reach. They read any package through the package spec
 * (@que/core) and know nothing about a specific one.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import type { Catalog } from "../mount/catalog.js";

export const OPEN_PACKAGE = "open_package";
export const LOAD_OPERATION = "load_operation";
export const READ_SKILL = "read_skill";

// Model APIs only allow [a-zA-Z0-9_-] in tool names (validatePackage enforces it).
export const toolName = (pkg: string, op: string) => `${pkg}_${op}`;

// A description opens with what the thing is for; the rest is how to use it.
const firstSentence = (text: string) => text.split(/(?<=[.!?])\s/)[0];

const find = (catalog: Catalog, name: string) =>
  catalog.find(({ pkg }) => pkg.definition.name === name)?.pkg;

const noPackage = (catalog: Catalog, name: string) =>
  `Error: no package "${name}". Packages: ${catalog.map(({ pkg }) => pkg.definition.name).join(", ")}`;

function openPackage(catalog: Catalog, hasOperations: boolean): StructuredTool {
  return tool(
    async ({ package: name }) => {
      const pkg = find(catalog, name);
      if (!pkg) return noPackage(catalog, name);
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
        ...(skills.length
          ? [
              "## Skills",
              ...skills.map((s) => `- ${s.id}: ${s.title}. ${s.description}`),
            ]
          : []),
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
      if (!pkg) return noPackage(catalog, name);
      const ops = pkg.definition.ops.map((op) => op.name);
      if (!ops.length) return `Error: package "${name}" has no operations.`;
      if (!ops.includes(operation))
        return `Error: no operation "${operation}" in ${name}. Operations: ${ops.join(", ")}`;
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

function readSkill(catalog: Catalog): StructuredTool {
  const skills = new Map(
    catalog.flatMap(({ pkg }) => pkg.skills.map((s) => [s.id, s] as const)),
  );
  return tool(
    async ({ id }) => skills.get(id)?.body ?? `Error: no skill "${id}"`,
    {
      name: READ_SKILL,
      description:
        "Read Skill: returns the full text of a skill, by the id open_package lists it under.",
      schema: z.object({
        id: z.string().describe("Skill id, e.g. odoo/lookup-company"),
      }),
    },
  );
}

/** The tools every chat starts with. None when no package holds an operation or a skill. */
export function baseTools(catalog: Catalog): StructuredTool[] {
  const hasOperations = catalog.some(({ pkg }) => pkg.definition.ops.length);
  const hasSkills = catalog.some(({ pkg }) => pkg.skills.length);
  if (!hasOperations && !hasSkills) return [];
  return [
    openPackage(catalog, hasOperations),
    ...(hasOperations ? [loadOperation(catalog)] : []),
    ...(hasSkills ? [readSkill(catalog)] : []),
  ];
}
