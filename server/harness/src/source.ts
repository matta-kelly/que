/**
 * A deployment as pieces for basis's lint: its definition, each agent, loop and model as its file gives it, and each
 * node of each plugin it names (piecesOf in @mku1tra/que-plugin), and the facts the model catalog gives of each of its
 * models (catalog.ts). Its root's schema takes them as its sources (deploymentSources), so each lint of the root,
 * mount's too, reads one graph of the deployment.
 */

import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import type { Source } from "@mku1tra/basis";
import { loadedOf, type Loaded } from "@mku1tra/que-plugin";
import { factsOf } from "./catalog.ts";
import { readDeployment, type Placed, type ReadDeployment } from "./read.ts";

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
  const placed = (list: Placed<{ name: string }>[]) =>
    list.map(({ file, node }) => piece(from(file), node));
  const out: Loaded = {
    pieces: [
      ...(read.deployment ? [piece(from(read.index), read.deployment)] : []),
      ...placed(read.agents),
      ...placed(read.loops),
      ...placed(read.models),
    ],
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
 * The facts of each model of the deployment in `dir` that the model catalog has an entry for: a piece of the model's
 * node, at its file's path with `#catalog`, that gives its window and its price, so a problem of one names the
 * catalog. A model the catalog has none for gets no piece: its file, or its note, gives its facts. A file or a note
 * that gives one the catalog gives too is two pieces of one field (basis/merge).
 */
function catalog(dir: string, root: string): Source {
  return async function modelCatalog() {
    const { from } = fromRoot(root);
    const { models } = await readDeployment(dir);
    return {
      pieces: models.flatMap(({ file, node }) => {
        const facts = factsOf(node.id);
        return facts
          ? [
              {
                path: `${from(file)}#catalog`,
                name: node.name,
                fields: {
                  type: "model",
                  window: facts.window,
                  price: facts.price,
                },
              },
            ]
          : [];
      }),
      problems: [],
      unread: [],
    };
  };
}

/**
 * The sources of the deployment in `dir`, for its root `root`: what a root's schema gives as its sources so that its
 * lint reads the deployment as one graph. Its code (its definition, its agents, loops and models, and each node of
 * each plugin it names) is one source; the model catalog's facts of its models are another. The one place a source of
 * the deployment is added: a root that takes these takes each.
 */
export function deploymentSources(dir: string, root: string): Source[] {
  return [deployment(dir, root), catalog(dir, root)];
}
