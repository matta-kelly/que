/**
 * A source of pieces for basis's lint: the plugins under a folder, each read from its card (`plugin.json`) and its
 * skills' `SKILL.md`, with no code run. que makes a card from the plugin's definition and its cases, and mount holds
 * it to them byte for byte, so the card is the plugin's code as data: the plugin's nodes in que's ontology. Each node
 * a plugin holds is one piece here, at the path of its card or its skill; a note of the same name is another piece of
 * the same node, which the lint merges with it.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { parse } from "yaml";
import * as z from "zod";
import { NAMESPACE, nameIn } from "./names.ts";

/** A piece, as basis's lint takes it from a source: its path from the folder linted, its node's name, and its fields. */
type Piece = { path: string; name: string; fields: Record<string, unknown> };

/** What a source gives basis's lint. */
type Loaded = {
  pieces: Piece[];
  problems: { path: string; message: string; fatal: true }[];
  unread: { path: string; name: string }[];
};

/** que's part of a card, as far as this reader needs it: the lint checks each field against its type. */
const Part = z.object({
  title: z.unknown(),
  credential: z.unknown().optional(),
  ops: z.array(
    z.object({
      name: z.string(),
      title: z.unknown(),
      description: z.unknown(),
      role: z.string().optional(),
      input: z.unknown(),
    }),
  ),
  roles: z.array(z.object({ name: z.string(), description: z.unknown() })),
  uses: z.object({ ops: z.array(z.string()), skills: z.array(z.string()) }),
  capabilities: z.array(
    z.object({
      name: z.string(),
      title: z.unknown(),
      description: z.unknown(),
    }),
  ),
  cases: z.array(
    z.object({
      name: z.string(),
      description: z.unknown(),
      capability: z.unknown(),
      input: z.unknown(),
      start: z.unknown(),
      good: z.unknown(),
    }),
  ),
});

const Card = z.object({
  name: z.string(),
  description: z.unknown(),
  extensions: z.object({ [NAMESPACE]: Part }),
});

/** A skill's frontmatter, as far as this reader needs it. */
const SkillFront = z.object({
  name: z.unknown(),
  description: z.unknown(),
  metadata: z.object({ title: z.unknown().optional() }).optional(),
});

/** The YAML between the `---` lines at the top of a file. */
const frontmatterOf = (text: string): unknown => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return block ? parse(block[1] ?? "") : undefined;
};

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

/** The pieces of one plugin: from its card, and from each of its skills. */
async function piecesOf(dir: string, from: (path: string) => string) {
  const out: Loaded = { pieces: [], problems: [], unread: [] };
  const cardPath = from(join(dir, "plugin.json"));
  let card: z.infer<typeof Card>;
  try {
    const read = Card.safeParse(
      JSON.parse(await readFile(join(dir, "plugin.json"), "utf8")),
    );
    if (!read.success)
      throw new Error(
        `It is not a card with que's part: ${z.prettifyError(read.error)}`,
      );
    card = read.data;
  } catch (error) {
    out.problems.push({
      path: cardPath,
      message: `The card cannot be read: ${(error as Error).message} Write it again with \`just card\`.`,
      fatal: true,
    });
    // The plugin is there, by its folder's name: a link to it is not a problem, as its card has this one.
    out.unread.push({ path: cardPath, name: basename(dir) });
    return out;
  }
  const plugin = card.name;
  const part = card.extensions[NAMESPACE];
  const piece = (
    name: string,
    fields: Record<string, unknown>,
    path = cardPath,
  ) => out.pieces.push({ path, name, fields });

  const skills: string[] = [];
  let folders: string[] = [];
  try {
    folders = (await readdir(join(dir, "skills"), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    // No skills/ folder: a plugin with no skills.
  }
  for (const folder of folders) {
    const file = join(dir, "skills", folder, "SKILL.md");
    const path = from(file);
    const name = nameIn(plugin, folder);
    try {
      const front = SkillFront.parse(
        frontmatterOf(await readFile(file, "utf8")),
      );
      // As que reads a skill (parseSkill): its name is its folder's.
      if (front.name !== folder)
        throw new Error(`its name is not its folder's, ${folder}`);
      skills.push(name);
      piece(
        name,
        {
          type: "skill",
          description: front.description,
          title: front.metadata?.title ?? front.name,
        },
        path,
      );
    } catch (error) {
      out.problems.push({
        path,
        message: `The skill cannot be read: ${(error as Error).message}`,
        fatal: true,
      });
      out.unread.push({ path, name });
    }
  }

  piece(plugin, {
    type: "plugin",
    description: card.description,
    title: part.title,
    ...(part.credential === undefined ? {} : { credential: part.credential }),
    ops: part.ops.map((op) => nameIn(plugin, op.name)),
    skills,
    capabilities: part.capabilities.map((c) => c.name),
    roles: part.roles.map((role) => nameIn(plugin, role.name)),
    uses: [...part.uses.ops, ...part.uses.skills],
    cases: part.cases.map((c) => c.name),
  });
  for (const op of part.ops)
    piece(nameIn(plugin, op.name), {
      type: "op",
      description: op.description,
      title: op.title,
      ...(op.role === undefined ? {} : { role: nameIn(plugin, op.role) }),
      input: op.input,
    });
  for (const role of part.roles)
    piece(nameIn(plugin, role.name), {
      type: "access-role",
      description: role.description,
    });
  for (const capability of part.capabilities)
    piece(capability.name, {
      type: "capability",
      description: capability.description,
      title: capability.title,
    });
  for (const { name, ...fields } of part.cases)
    piece(name, { type: "case", ...fields });
  return out;
}

/**
 * The source of the plugins under `folder`, for the lint of the folder `root`: each path is from `root`. A card or a
 * skill that cannot be read is a problem of its own, and the lint goes on.
 */
export function plugins(folder: string, root: string) {
  const from = (path: string) => relative(root, path).split(sep).join("/");
  return async function quePlugins(): Promise<Loaded> {
    const all: Loaded = { pieces: [], problems: [], unread: [] };
    for (const dir of await pluginFolders(folder)) {
      const one = await piecesOf(dir, from);
      all.pieces.push(...one.pieces);
      all.problems.push(...one.problems);
      all.unread.push(...one.unread);
    }
    return all;
  };
}
