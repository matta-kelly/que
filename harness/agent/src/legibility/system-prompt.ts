/**
 * The system prompt: what a package is, how to find the way around, and the
 * packages this user can use. Everything about a package comes from what the
 * package says about itself through the package spec.
 */

import {
  LOAD_OPERATION,
  OPEN_PACKAGE,
  READ_SKILL,
  type Catalog,
} from "./tools.js";

const ROLE = `You are a helpful assistant.

- Be concise and accurate.
- If you're unsure about something, say so rather than guessing.`;

const environment = (hasSkills: boolean) =>
  [
    "## Your environment",
    "Everything you can do for the user comes from packages. A package is one service the user has connected. It holds:",
    [
      "- operations: actions you can run in that service, each with a description and arguments",
      ...(hasSkills
        ? ["- skills: written guides for tasks in that service"]
        : []),
    ].join("\n"),
    "You start with no operations in reach. To use one:",
    [
      "1. Pick a package from the list below.",
      `2. Call \`${OPEN_PACKAGE}\` to see what it holds.`,
      `3. Call \`${LOAD_OPERATION}\` for each operation you need. It becomes a tool named \`<package>_<operation>\` and stays for the rest of the conversation.`,
      "4. Call that tool.",
    ].join("\n"),
    ...(hasSkills
      ? [`Before a task a skill covers, read it with \`${READ_SKILL}\`.`]
      : []),
    "If no package covers a request, say so.",
  ].join("\n\n");

const packages = (catalog: Catalog) =>
  [
    "## Packages",
    ...catalog.map(({ pkg: { definition: pkg }, identity }) =>
      [
        `### ${pkg.title} (\`${pkg.name}\`)`,
        pkg.description,
        ...(identity
          ? [
              `You're connected as ${identity.name} (${pkg.title} user ${identity.id}); "me"/"mine" in ${pkg.title} means this user.`,
            ]
          : []),
      ].join("\n"),
    ),
  ].join("\n\n");

export function systemPrompt({
  user,
  catalog,
}: {
  user?: { name: string; email: string };
  catalog: Catalog;
}): string {
  return [
    ROLE,
    ...(user
      ? [`## You\n\nYou're assisting ${user.name} (${user.email}).`]
      : []),
    ...(catalog.length
      ? [
          environment(catalog.some(({ pkg }) => pkg.skills.length)),
          packages(catalog),
        ]
      : [
          "## Your environment\n\nThe user has no packages connected, so there is nothing you can look up or do for them yet.",
        ]),
  ].join("\n\n");
}
