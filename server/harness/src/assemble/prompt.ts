/**
 * The system prompt every config shares: the role, who the user is, and the
 * packages this user can use. The config supplies the text about the
 * environment. Everything about a package comes from what the package says
 * about itself through the package spec.
 */

import type { Catalog } from "../access/catalog.js";

const ROLE = `You are a helpful assistant.

- Be concise and accurate.
- If you're unsure about something, say so rather than guessing.`;

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
}: {
  user?: { name: string; email: string };
  catalog: Catalog;
  environment: (catalog: Catalog) => string;
}): string {
  return [
    ROLE,
    ...(user
      ? [`## You\n\nYou're assisting ${user.name} (${user.email}).`]
      : []),
    ...(catalog.length
      ? [environment(catalog), packages(catalog)]
      : [
          "## Your environment\n\nThe user has no packages connected, so there is nothing you can look up or do for them yet.",
        ]),
  ].join("\n\n");
}
