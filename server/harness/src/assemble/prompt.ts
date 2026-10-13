/**
 * The system prompt every config shares: the role (or the instructions given
 * in its place), who the user is and what they ask of the agent, and the
 * packages this user can use. The config supplies the text about the
 * environment. Everything about a package comes from what the package says
 * about itself through the package spec.
 */

import type { Catalog } from "../access/catalog.js";

const ROLE = `You are a helpful assistant.

- Be concise and accurate.
- If you're unsure about something, say so rather than guessing.`;

// The agent's instructions come first in the prompt, and stay first where the two do not agree.
const OWN =
  "These are their own instructions for how you work with them. Follow them where they do not go against the instructions above.";

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
  environment,
  instructions,
}: {
  user?: { name: string; email: string; instructions?: string };
  catalog: Catalog;
  environment: (catalog: Catalog) => string;
  instructions?: string;
}): string {
  return [
    instructions ?? ROLE,
    ...(user
      ? [
          `## You\n\nYou're assisting ${user.name} (${user.email}).`,
          ...(user.instructions ? [OWN, user.instructions] : []),
        ]
      : []),
    ...(catalog.length
      ? [environment(catalog), packages(catalog)]
      : [
          "## Your environment\n\nThe user has no packages connected, so there is nothing you can look up or do for them yet.",
        ]),
  ].join("\n\n");
}
