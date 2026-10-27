/**
 * A source of pieces for basis's lint: the plugins under a folder, each read from its card (`plugin.json`) and its
 * skills' `SKILL.md`, with no code run. que makes a card from the plugin's definition and its cases, and mount holds
 * it to them byte for byte, so the card is the plugin's code as data: the plugin's nodes in the plugin schema. Each
 * node a plugin holds is one piece here, at the path of its card or its skill (piecesOf); a note of the same name is
 * another piece of the same node, which the lint merges with it.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { Source } from "@mku1tra/basis";
import * as z from "zod";
import { Card } from "./card.ts";
import { pluginFiles, skillFolders } from "./layout.ts";
import { piecesOf } from "./lint.ts";
import { NAMESPACE, nameIn } from "./names.ts";
import { parseSkill, type Skill } from "./skill.ts";

/** What a source gives basis's lint, in lists this reader fills. */
type Given = Awaited<ReturnType<Source>>;
type Loaded = { [K in keyof Given]: Given[K][number][] };

/** Every plugin folder under `folder`: each one that holds a card. Installed packages are not walked. */
async function pluginFolders(folder: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === "plugin.json"))
      found.push(dir);
    for (const entry of entries)
      if (entry.isDirectory() && entry.name !== "node_modules")
        await walk(join(dir, entry.name));
  };
  await walk(folder);
  return found.sort();
}

/** Each thing in a list of a card that cannot be read, by its name, when it has one. */
const named = (list: unknown): string[] =>
  Array.isArray(list)
    ? list.flatMap((item) =>
        typeof (item as { name?: unknown })?.name === "string"
          ? [(item as { name: string }).name]
          : [],
      )
    : [];

// The plugin's name in a card that cannot be read: its own, when its JSON gives one, or its folder's.
const pluginName = (raw: unknown, folder: string): string => {
  const name = (raw as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" ? name : folder;
};

/**
 * The names a card that cannot be read gives, as far as its JSON reads: its plugin's, and each op's, role's,
 * capability's and case's.
 */
function namesIn(raw: unknown, plugin: string): string[] {
  const part =
    (
      raw as
        | { extensions?: Record<string, Record<string, unknown> | undefined> }
        | null
        | undefined
    )?.extensions?.[NAMESPACE] ?? {};
  return [
    plugin,
    ...named(part.ops).map((op) => nameIn(plugin, op)),
    ...named(part.roles).map((role) => nameIn(plugin, role)),
    ...named(part.capabilities),
    ...named(part.cases),
  ];
}

/** The pieces of one plugin: from its card, and from each of its skills. */
async function readPlugin(dir: string, from: (path: string) => string) {
  const out: Loaded = { pieces: [], problems: [], unread: [] };
  const files = pluginFiles(dir);
  let raw: unknown;
  let card: Card;
  try {
    raw = JSON.parse(await readFile(files.card, "utf8"));
    const read = Card.safeParse(raw);
    if (!read.success)
      throw new Error(`It is not a card: ${z.prettifyError(read.error)}`);
    card = read.data;
  } catch (error) {
    out.problems.push({
      path: from(files.card),
      message: `The card cannot be read: ${(error as Error).message} Write it again with \`just card\`.`,
      fatal: true,
    });
    // Its plugin and each thing it holds are there, by the names the card and its skill folders give: a link to one
    // is not a problem, as the card has this one.
    const plugin = pluginName(raw, basename(dir));
    for (const name of [
      ...namesIn(raw, plugin),
      ...skillFolders(dir).map((folder) => nameIn(plugin, folder)),
    ])
      out.unread.push({ path: from(files.card), name });
    return out;
  }

  const skills: Skill[] = [];
  for (const folder of skillFolders(dir)) {
    const path = from(files.skill(folder));
    try {
      skills.push(
        parseSkill(
          card.name,
          folder,
          await readFile(files.skill(folder), "utf8"),
        ),
      );
    } catch (error) {
      out.problems.push({
        path,
        message: `The skill cannot be read: ${(error as Error).message}`,
        fatal: true,
      });
      out.unread.push({ path, name: nameIn(card.name, folder) });
    }
  }

  out.pieces.push(...piecesOf(card, skills, from(dir)));
  return out;
}

/**
 * The source of the plugins under `folder`, for the lint of the folder `root`: each path is from `root`. A card or a
 * skill that cannot be read is a problem of its own, and the lint goes on.
 */
export function plugins(folder: string, root: string): Source {
  const from = (path: string) => relative(root, path).split(sep).join("/");
  return async function quePlugins(): Promise<Loaded> {
    const all: Loaded = { pieces: [], problems: [], unread: [] };
    for (const dir of await pluginFolders(folder)) {
      const one = await readPlugin(dir, from);
      all.pieces.push(...one.pieces);
      all.problems.push(...one.problems);
      all.unread.push(...one.unread);
    }
    return all;
  };
}
