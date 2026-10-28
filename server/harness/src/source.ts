/**
 * A deployment as pieces for basis's lint: its definition, each agent, loop and model as its file gives it, and each
 * node of each plugin it names (piecesOf in @mku1tra/que-plugin). Mount lints these with the harness schema, and so
 * does a folder's lint through `deployment`, the source: one graph of the deployment.
 */

import { relative, sep } from "node:path";
import {
  lint,
  type Graph,
  type Piece,
  type Problem,
  type Source,
} from "@mku1tra/basis";
import { loadedOf, type Loaded } from "@mku1tra/que-plugin";
import { readDeployment, type Placed, type ReadDeployment } from "./read.ts";
import { harness } from "./schema.ts";

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

/** The source of the deployment in `dir`, for the lint of the folder `root`: each path is from `root`. */
export function deployment(dir: string, root: string): Source {
  const from = (path: string) => relative(root, path).split(sep).join("/");
  return async function queDeployment() {
    return piecesOf(await readDeployment(dir), from);
  };
}

/**
 * The lint of a deployment as one graph, with the harness schema: its pieces as code gives them, one source, and
 * `more` pieces from another place (mount's model facts), another source. Gives the problems of each file that cannot
 * be read and the lint's, and the graph a program runs on once the problems are none.
 */
export function lintDeployment(
  read: ReadDeployment,
  more: readonly Omit<Piece, "source">[] = [],
): { problems: Problem[]; graph: Graph } {
  const given = piecesOf(read);
  const { problems, graph } = lint(
    harness,
    [
      ...given.pieces.map((piece) => ({ ...piece, source: "code" })),
      ...more.map((piece) => ({ ...piece, source: "more" })),
    ],
    given.unread,
  );
  return { problems: [...given.problems, ...problems], graph };
}
