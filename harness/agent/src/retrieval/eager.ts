/**
 * Capability retrieval, eager: everything the rep can use is in view on every
 * model call. The prompt gets an index of their packages (what each is, who
 * they're connected as, which skills it has); every op tool is sent as is.
 * Op names and descriptions aren't repeated here, since the model already
 * receives them with the tool definitions.
 */

import { tool, type StructuredTool } from "langchain";
import * as z from "zod";
import type { ServiceIdentity } from "@que/core";
import type { MountedPackage } from "../mount.js";

/** The rep's accessible packages, each with who they're logged in as there (if it can say). */
export type Catalog = { pkg: MountedPackage; identity?: ServiceIdentity }[];

function readSkillTool(catalog: Catalog): StructuredTool {
  const skills = new Map(
    catalog.flatMap(({ pkg }) => pkg.skills.map((s) => [s.id, s] as const)),
  );
  return tool(
    async ({ id }) => skills.get(id)?.body ?? `Error: no skill "${id}"`,
    {
      name: "read_skill",
      description:
        "Read Skill: returns the full text of a skill from the index, by id.",
      schema: z.object({
        id: z.string().describe("Skill id, e.g. odoo/lookup-company"),
      }),
    },
  );
}

// The index: each package's title and description, who the rep is connected as
// (so "me"/"mine" resolve), and its skills (title + description; read on demand).
function packageIndex(catalog: Catalog, hasSkills: boolean): string {
  if (!catalog.length) return "";
  const sections = catalog.map(
    ({ pkg: { definition: pkg, skills }, identity }) =>
      [
        `### ${pkg.title}`,
        pkg.description,
        ...(identity
          ? [
              `You're connected as ${identity.name} (${pkg.title} user ${identity.id}); "me"/"mine" in ${pkg.title} means this user.`,
            ]
          : []),
        ...(skills.length
          ? [
              "Skills:",
              ...skills.map(
                (s) => `- \`${s.id}\`: ${s.title}. ${s.description}`,
              ),
            ]
          : []),
      ].join("\n"),
  );
  return [
    "## Packages",
    ...(hasSkills
      ? ["Before a task a skill covers, read it with `read_skill`."]
      : []),
    ...sections,
  ].join("\n\n");
}

/** The prompt section and the extra tools (beyond the op tools) for this catalog. */
export function eager(catalog: Catalog): {
  prompt: string;
  tools: StructuredTool[];
} {
  const hasSkills = catalog.some(({ pkg }) => pkg.skills.length);
  return {
    prompt: packageIndex(catalog, hasSkills),
    tools: hasSkills ? [readSkillTool(catalog)] : [],
  };
}
