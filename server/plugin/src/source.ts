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
import { piecesOf } from "./lint.ts";
import { NAMESPACE } from "./names.ts";
import { readPlugin } from "./read.ts";

/** What a source gives basis's lint, in lists this reader fills. */
type Given = Awaited<ReturnType<Source>>;
type Loaded = { [K in keyof Given]: Given[K][number][] };

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
 * The source of the plugins under `folder`, for the lint of the folder `root`: each path is from `root`. A file that
 * cannot be read is a problem of its own, and the lint goes on. A skill that cannot be read is there, by its folder's
 * name, so a link to it is no problem.
 */
export function plugins(folder: string, root: string): Source {
  const from = (path: string) => relative(root, path).split(sep).join("/");
  return async function quePlugins(): Promise<Loaded> {
    const all: Loaded = { pieces: [], problems: [], unread: [] };
    for (const dir of await pluginFolders(folder)) {
      const read = await readPlugin(dir);
      all.pieces.push(...piecesOf(read, from));
      all.problems.push(
        ...read.problems.map((p) => ({ ...p, path: from(p.path) })),
      );
      const given = new Set(read.skills.map((skill) => skill.name));
      for (const name of read.skillNames)
        if (!given.has(name))
          all.unread.push({ path: from(read.files.skill(name)), name });
    }
    return all;
  };
}
