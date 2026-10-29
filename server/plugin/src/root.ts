/**
 * Where a plugin is linted: a root (basis's lintRoot), the only place a lint starts, the root whose ground holds its
 * folder (basis's rootOf). A plugin that is a root of its own gives its config the schema of one (pluginSchema). Mount
 * checks one plugin from its root, and the card's writer does too.
 */

import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { defineSchema } from "@mku1tra/basis";
import { plugin } from "./schema.ts";
import { plugins } from "./source.ts";

/**
 * The files a plugin or a deployment holds that are not notes: README.md, which npm and GitHub show, and each skill's
 * SKILL.md, the standard's file, read by the source. Neither has a type. Every other note in the folder is read, as
 * a piece of the node of its name.
 */
export const notANote = (path: string): boolean =>
  ["README.md", "SKILL.md"].includes(basename(path));

/**
 * The schema of a plugin that is a root of its own: its notes are its folder, `root`, and its source is the plugins
 * in it (plugins), each name one uses that none gives being there and not read: what a plugin uses is the
 * deployment's to give. A plugin's basis.config.ts gives it: `export default { schema: pluginSchema({ name,
 * description, root: new URL("./", import.meta.url) }) }`.
 */
export function pluginSchema({
  name,
  description,
  root,
}: {
  name: string;
  description: string;
  root: URL;
}) {
  const folder = fileURLToPath(root);
  return defineSchema({
    name,
    description,
    types: {},
    imports: [plugin],
    notes: root,
    skip: notANote,
    sources: [plugins(folder, folder)],
  });
}
