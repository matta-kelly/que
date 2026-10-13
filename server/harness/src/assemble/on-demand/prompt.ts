/**
 * The on-demand environment text: what a package is, and how to open one and
 * load an operation from it.
 */

import type { Catalog } from "../../mount/catalog.js";
import { READ_SKILL } from "../skills.js";
import { LOAD_OPERATION, OPEN_PACKAGE } from "./tools.js";

const environment = (hasOperations: boolean, hasSkills: boolean) =>
  [
    "## Your environment",
    ...(hasOperations || hasSkills
      ? [
          "Everything you can do for the user comes from packages. A package is one service the user has connected. It holds:",
          [
            ...(hasOperations
              ? [
                  "- operations: actions you can run in that service, each with a description and arguments",
                ]
              : []),
            ...(hasSkills
              ? ["- skills: written guides for tasks in that service"]
              : []),
          ].join("\n"),
          ...(hasOperations
            ? [
                "You start with no operations in reach. To use one:",
                [
                  "1. Pick a package from the list below.",
                  `2. Call \`${OPEN_PACKAGE}\` to see what it holds.`,
                  `3. Call \`${LOAD_OPERATION}\` for each operation you need. It becomes a tool named \`<package>_<operation>\` and stays for the rest of the conversation.`,
                  "4. Call that tool.",
                ].join("\n"),
              ]
            : [
                `Pick a package from the list below and call \`${OPEN_PACKAGE}\` to see what it holds.`,
              ]),
          ...(hasSkills
            ? [`Before a task a skill covers, read it with \`${READ_SKILL}\`.`]
            : []),
          "If no package covers a request, say so.",
        ]
      : [
          "The user's packages are listed below. They hold nothing to open or run: what each one says about itself is all there is.",
        ]),
  ].join("\n\n");

export const prompt = (catalog: Catalog) =>
  environment(
    catalog.some(({ pkg }) => pkg.definition.ops.length),
    catalog.some(({ pkg }) => pkg.skills.length),
  );
