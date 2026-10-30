/**
 * A source of pieces for basis's lint: the plugins under a folder, each read from its code (its definition and its
 * cases) and its skills' `SKILL.md` (readPlugin). Each node a plugin holds is one piece here, as code gives it
 * (piecesOf); a note of the same name is another piece of the same node, which the lint merges with it. The card is
 * not read: it is written from the code at publish, and nothing reads it back.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Source } from "@mku1tra/basis";
import { pluginFiles } from "./layout.ts";
import { piecesOf } from "./pieces.ts";
import { NAMESPACE } from "./names.ts";
import { readPlugin, type ReadPlugin } from "./read.ts";

/** What a source gives basis's lint, in lists this reader fills. */
type Given = Awaited<ReturnType<Source>>;
export type Loaded = { [K in keyof Given]: Given[K][number][] };

/** Every plugin folder under `folder`: each one whose que folder holds a definition. Installed packages are not walked. */
async function pluginFolders(folder: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string) => {
    if (existsSync(pluginFiles(dir).definition)) found.push(dir);
    for (const entry of await readdir(dir, { withFileTypes: true }))
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== NAMESPACE
      )
        await walk(join(dir, entry.name));
  };
  await walk(folder);
  return found.sort();
}

/**
 * What one plugin gives a lint, each path by `from`: a piece of each of its nodes (piecesOf), a problem for each file
 * that cannot be read, and each skill that cannot be read as unread, by its folder's name, so a link to it is no
 * problem.
 */
export function loadedOf(
  read: ReadPlugin,
  from: (path: string) => string = (path) => path,
): Loaded {
  const given = new Set(read.skills.map((skill) => skill.name));
  return {
    pieces: piecesOf(read, from),
    problems: read.problems.map((p) => ({ ...p, path: from(p.path) })),
    unread: read.skillNames
      .filter((name) => !given.has(name))
      .map((name) => ({ path: from(read.files.skill(name)), name })),
  };
}

/**
 * The source of the plugins under `folder`, for the lint of the root `root`: each path is from `root`. A file that
 * cannot be read is a problem of its own, and the lint goes on (loadedOf). Each name a plugin uses (its usesOps, made
 * from its ops and skills, and its usesSkills) that no plugin under the folder gives is there and not read, at its
 * definition: what a plugin uses is given by the deployment that names it, so a link to it is no problem here.
 */
export function plugins(folder: string, root: string): Source {
  const from = (path: string) => relative(root, path).split(sep).join("/");
  return async function quePlugins(): Promise<Loaded> {
    const all: Loaded = { pieces: [], problems: [], unread: [] };
    const read = [];
    for (const dir of await pluginFolders(folder)) {
      const one = await readPlugin(dir);
      read.push(one);
      const loaded = loadedOf(one, from);
      all.pieces.push(...loaded.pieces);
      all.problems.push(...loaded.problems);
      all.unread.push(...loaded.unread);
    }
    const given = new Set([
      ...all.pieces.map((piece) => piece.name),
      ...all.unread.map((thing) => thing.name),
    ]);
    for (const { definition, files } of read) {
      const { usesOps = [], usesSkills = [] } = definition?.plugin ?? {};
      for (const name of [...usesOps, ...usesSkills])
        if (!given.has(name)) {
          given.add(name);
          all.unread.push({ path: from(files.definition), name });
        }
    }
    return all;
  };
}
