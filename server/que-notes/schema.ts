/**
 * que-notes: que's own notes (que.md, the contracts, the notes beside the code they explain), as a graph of their
 * own. Its notes are the repo's root, two folders up. It imports it for the note types the notes use, and the plugin
 * and harness schemas, so their folders of type notes, each a root of its own, are read once, as their own lint reads
 * them. A private package of the repo, never published: the repo's root lints from it, and a graph above imports it
 * as a workspace. Its peers are the importer's basis, it, que-plugin and que-harness, one instance of each.
 */

import { defineSchema } from "@mku1tra/basis";
import it from "@mku1tra/it";
import { harness } from "@mku1tra/que-harness";
import { plugin } from "@mku1tra/que-plugin";

// Not notes, by file name: the READMEs npm and GitHub show (Reality, with no frontmatter).
const reality = new Set(["README.md"]);
// Not notes, by path: the plugins mount's tests read, whose skills are the standard's files (a SKILL.md, with no type).
const paths = ["server/tests/integration/mount/fixtures"];

/** Whether a path of the repo, from its root, is not a note. node_modules is in no ground: basis skips it. */
const skip = (path: string) => {
  const parts = path.split("/");
  return (
    reality.has(parts.at(-1) ?? "") ||
    paths.some((p) => path === p || path.startsWith(`${p}/`))
  );
};

const notes = defineSchema({
  name: "que-notes",
  description: "que's own notes, on the note types of it.",
  types: {},
  imports: [it, plugin, harness],
  notes: new URL("../../", import.meta.url),
  skip,
  // What the package exports, for basis's rules of the exports: the schema, which is no zod object and no definition.
  exports: () => import("./schema.ts"),
});

export default notes;
