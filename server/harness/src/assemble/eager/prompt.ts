/**
 * The eager environment text: what a plugin is, that each operation is
 * already a tool, and the skills there are to read. With no open_plugin, the
 * prompt is where the agent finds a skill's id.
 */

import type { Catalog } from "../../access/catalog.js";
import { READ_SKILL, skillLine } from "../skills.js";

export const prompt = (catalog: Catalog) => {
  const hasOperations = catalog.some(
    ({ plugin }) => plugin.definition.ops.length,
  );
  const skills = catalog.flatMap(({ plugin }) => plugin.skills);
  return [
    "## Your environment",
    ...(hasOperations || skills.length
      ? [
          "Everything you can do for the user comes from plugins. A plugin is one service the user has connected. It holds:",
          [
            ...(hasOperations
              ? [
                  "- operations: actions you can run in that service, each with a description and arguments",
                ]
              : []),
            ...(skills.length
              ? ["- skills: written guides for tasks in that service"]
              : []),
          ].join("\n"),
          ...(hasOperations
            ? [
                "Every operation is already a tool, named `<plugin>_<operation>`. Call it.",
              ]
            : []),
          ...(skills.length
            ? [
                `Before a task a skill covers, read it with \`${READ_SKILL}\`, by its id. The skills:`,
                skills.map(skillLine).join("\n"),
              ]
            : []),
          "If no plugin covers a request, say so.",
        ]
      : [
          "The user's plugins are listed below. They hold nothing to run or read: what each one says about itself is all there is.",
        ]),
  ].join("\n\n");
};
