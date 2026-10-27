/**
 * Where a plugin's files are. The one place that says it: mount, the evals and any other reader ask here.
 * The standard's files sit at the plugin's root (plugin.json, skills/), and so does npm's package.json; que's
 * own sit in que's namespace folder, as Agent Plugins puts a client's files (§8.2).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { NAMESPACE } from "@que/ontology/names";

export { NAMESPACE };

/** The files of the plugin in `dir`. */
export const pluginFiles = (dir: string) => ({
  /** que's folder in it. */
  que: join(dir, NAMESPACE),
  /** Its definition, as the default export (definePlugin). */
  definition: join(dir, NAMESPACE, "index.ts"),
  /** Its cases, when it has any. */
  cases: join(dir, NAMESPACE, "cases.ts"),
  /** Its card, the standard's manifest. */
  card: join(dir, "plugin.json"),
  /** Its npm package, when it is one: its version, and the @que/core it works with. */
  package: join(dir, "package.json"),
  /** Its skills, one folder each. The standard's place. */
  skills: join(dir, "skills"),
  /** The file of its skill in the folder `folder`. */
  skill: (folder: string) => join(dir, "skills", folder, "SKILL.md"),
});

export type PluginFiles = ReturnType<typeof pluginFiles>;

// Where a definition sat before que's files moved into its namespace folder.
const oldDefinition = (dir: string) => join(dir, "index.ts");

/**
 * The files of the plugin in `dir`, throwing when it has no definition: one at its root says que's files moved,
 * and a folder with neither holds no plugin.
 */
export function locatePlugin(dir: string): PluginFiles {
  const files = pluginFiles(dir);
  if (existsSync(files.definition)) return files;
  if (existsSync(oldDefinition(dir)))
    throw new Error(
      `${dir}: que's files are in ${NAMESPACE}/, not at the plugin's root: move index.ts and que's other files (its ops, client and cases) there. plugin.json, skills/ and package.json stay at the root`,
    );
  throw new Error(`${dir} holds no plugin (no ${NAMESPACE}/index.ts)`);
}
