/**
 * Where a plugin's files are. The one place that says it: mount, the evals and any other reader ask here.
 * The standard's files sit at the plugin's root (skills/, and plugin.json); que's own sit in que's namespace
 * folder, as Agent Plugins puts a client's files (§8.2).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/** que's namespace, a reverse-domain name: the folder of que's files in a plugin, and its key in `extensions`. */
export const NAMESPACE = "io.github.matta-kelly.que";

/** The files of the plugin in `dir`. */
export const pluginFiles = (dir: string) => ({
  /** que's folder in it. */
  que: join(dir, NAMESPACE),
  /** Its definition, as the default export (definePlugin). */
  definition: join(dir, NAMESPACE, "index.ts"),
  /** Its cases, when it has any. */
  cases: join(dir, NAMESPACE, "cases.ts"),
  /** Its skills, one folder each. The standard's place, at the root. */
  skills: join(dir, "skills"),
});

/**
 * The files of the plugin in `dir`, throwing when it has no definition: one at its root says que's files moved,
 * and a folder with neither holds no plugin.
 */
export function locatePlugin(dir: string): ReturnType<typeof pluginFiles> {
  const files = pluginFiles(dir);
  if (existsSync(files.definition)) return files;
  if (existsSync(join(dir, "index.ts")))
    throw new Error(
      `${dir}: que's files are in ${NAMESPACE}/, not at the plugin's root: move index.ts and the files beside it there`,
    );
  throw new Error(`${dir} holds no plugin (no ${NAMESPACE}/index.ts)`);
}
