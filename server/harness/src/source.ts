/**
 * A deployment as pieces for basis's lint: its definition, and each node of each plugin it names (piecesOf in
 * @mku1tra/que-plugin). Its root's schema takes them as its source (deploymentSources), so each lint of the root,
 * mount's too, reads one graph of the deployment.
 */

import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import type { Source } from "@mku1tra/basis";
import { loadedOf, type Loaded } from "@mku1tra/que-plugin";
import { readDeployment, type ReadDeployment } from "./read.ts";

// A node as the piece it is: its name, and its fields.
const piece = (
  path: string,
  { name, ...fields }: { name: string } & Record<string, unknown>,
) => ({ path, name, fields });

/**
 * What a deployment gives the lint, each path by `from`: a piece of each node its files give, the problems of each
 * file that cannot be read, and the names of what could not be read, so a link to one is no problem.
 */
export function piecesOf(
  read: ReadDeployment,
  from: (path: string) => string = (path) => path,
): Loaded {
  const out: Loaded = {
    pieces: read.deployment ? [piece(from(read.index), read.deployment)] : [],
    problems: read.problems.map((p) => ({ ...p, path: from(p.path) })),
    unread: read.unread.map((u) => ({ ...u, path: from(u.path) })),
  };
  for (const plugin of read.plugins) {
    const one = loadedOf(plugin, from);
    out.pieces.push(...one.pieces);
    out.problems.push(...one.problems);
    out.unread.push(...one.unread);
  }
  return out;
}

// Each path from the real path of `root`, as basis places a piece.
function fromRoot(root: string) {
  const real = realpathSync(root);
  return {
    real,
    from: (path: string) => relative(real, path).split(sep).join("/"),
  };
}

/**
 * The source of the deployment in `dir`, for the lint of the root `root`: each path is a real path (readDeployment),
 * from `root`'s real path, as basis places a piece. A plugin whose real folder is outside `root` gives none of its
 * pieces, which would have no path from it: a problem at the deployment's definition names it, and its name is unread.
 */
function deployment(dir: string, root: string): Source {
  return async function queDeployment() {
    const { real, from } = fromRoot(root);
    const read = await readDeployment(dir);
    const outside = read.plugins.filter(
      (plugin) =>
        from(plugin.dir) === ".." || from(plugin.dir).startsWith("../"),
    );
    const given = piecesOf(
      { ...read, plugins: read.plugins.filter((p) => !outside.includes(p)) },
      from,
    );
    for (const plugin of outside) {
      given.problems.push({
        path: from(read.index),
        message: `The plugin ${plugin.name} is in ${plugin.dir}, outside the root ${real}: a deployment's root holds the real folder of each plugin it names.`,
        fatal: true,
      });
      given.unread.push({ path: from(read.index), name: plugin.name });
    }
    return given;
  };
}

/**
 * The sources of the deployment in `dir`, for its root `root`: what a root's schema gives as its sources so that its
 * lint reads the deployment as one graph: its definition, and each node of each plugin it names. The one place a
 * source of the deployment is added: a root that takes these takes each.
 */
export function deploymentSources(dir: string, root: string): Source[] {
  return [deployment(dir, root)];
}
