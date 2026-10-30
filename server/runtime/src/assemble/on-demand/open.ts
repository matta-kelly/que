/**
 * What the on-demand tools do, as pi's extension (runner/pi/extension.ts) gives them to the model: open_plugin shows
 * what a plugin holds, load_operation checks an operation is there.
 * Each reads any plugin through the plugin contract (@mku1tra/que-plugin) and knows nothing about a specific one.
 */

import * as z from "zod";
import { OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../../access/catalog.js";
import { skillLine } from "../names.js";

// A description opens with what the thing is for; the rest is how to use it.
const firstSentence = (text: string) => text.split(/(?<=[.!?])\s/)[0];

const find = (catalog: Catalog, name: string) =>
  catalog.find(({ plugin }) => plugin.definition.plugin.name === name)?.plugin;

const noPlugin = (catalog: Catalog, name: string) =>
  new OpFailed(
    `no plugin "${name}". Plugins: ${catalog.map(({ plugin }) => plugin.definition.plugin.name).join(", ")}`,
  );

/** Which on-demand tools the catalog holds something for: none when no plugin holds an operation or a skill. */
export function reach(catalog: Catalog) {
  const operations = catalog.some(({ plugin }) => plugin.definition.ops.length);
  const skills = catalog.some(({ plugin }) => plugin.skills.length);
  return { open: operations || skills, load: operations };
}

export const openSchema = z.object({
  plugin: z.string().describe("Plugin name from the system prompt"),
});

export const openDescription = (hasOperations: boolean) =>
  hasOperations
    ? "Open Plugin: lists what a plugin holds, its operations and skills, with one line each. " +
      "Use it to find the operation for a task. It does not make an operation callable; load_operation does."
    : "Open Plugin: lists what a plugin holds, with one line each.";

/** What the plugin `name` holds, one line each, with no arguments. */
export function open(catalog: Catalog, name: string) {
  const plugin = find(catalog, name);
  if (!plugin) throw noPlugin(catalog, name);
  const { definition, skills } = plugin;
  return [
    `# ${definition.plugin.title} (\`${definition.plugin.name}\`)`,
    definition.plugin.description,
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
}

export const loadSchema = z.object({
  plugin: z.string().describe("Plugin name"),
  operation: z.string().describe("Operation name, as open_plugin lists it"),
});

export const LOAD_DESCRIPTION =
  "Load Operation: makes one operation callable. From your next step it is a tool of the operation's name, " +
  "with its full description and arguments, and it stays for the rest of the conversation. " +
  "Load each operation you need before calling it; you can load several at once.";

/** The answer to a load of `operation` from the plugin `name`, once it is there: which tool it became. */
export function load(catalog: Catalog, name: string, operation: string) {
  const plugin = find(catalog, name);
  if (!plugin) throw noPlugin(catalog, name);
  const ops = plugin.definition.ops.map((op) => op.name);
  if (!ops.length) throw new OpFailed(`plugin "${name}" has no operations.`);
  if (!ops.includes(operation))
    throw new OpFailed(
      `no operation "${operation}" in ${name}. Operations: ${ops.join(", ")}`,
    );
  return `Loaded. Call it as the tool \`${operation}\`; its arguments are in that tool's definition.`;
}
