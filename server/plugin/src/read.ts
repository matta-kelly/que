/**
 * Read a plugin from its folder: where its files are (layout.ts), its definition and its cases, each parsed by its
 * define* call when its module is imported, and its skills. Mount, the evals, the card's writer and the source read a
 * plugin this way. What cannot be read is a problem, said at its file, and the rest is still read.
 */

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readCases, type Case } from "./case.ts";
import { readDefinition, type Definition } from "./contract.ts";
import { pluginFiles, skillFolders, type PluginFiles } from "./layout.ts";
import { parseSkill, type Skill } from "./skill.ts";

/** A file of a plugin that cannot be read, and why: fatal, as basis's loader says a note it cannot read. */
export type Unreadable = { path: string; message: string; fatal: true };

/** A plugin, as read from its folder: what could be read, and a problem for each file that could not. */
export type ReadPlugin = {
  files: PluginFiles;
  /** Its definition, when its module gives one. */
  definition?: Definition;
  cases: Case[];
  skills: Skill[];
  /** Its skills' names: each folder under skills/, read or not, as Agent Plugins finds them. */
  skillNames: string[];
  problems: Unreadable[];
};

const defaultOf = async (file: string): Promise<unknown> =>
  ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;

const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The plugin in `dir`: its definition, its cases and its skills, each read as far as it can be. */
export async function readPlugin(dir: string): Promise<ReadPlugin> {
  const files = pluginFiles(dir);
  const read: ReadPlugin = {
    files,
    cases: [],
    skills: [],
    skillNames: skillFolders(dir),
    problems: [],
  };
  const unreadable = (path: string, message: string) =>
    read.problems.push({ path, message, fatal: true });

  try {
    const given = readDefinition(await defaultOf(files.definition));
    if ("definition" in given) read.definition = given.definition;
    else
      unreadable(
        files.definition,
        `The definition cannot be read: its default export is not a plugin's definition:\n- ${given.faults.join("\n- ")}`,
      );
  } catch (error) {
    unreadable(
      files.definition,
      `The definition cannot be read: ${reason(error)}`,
    );
  }

  if (existsSync(files.cases))
    try {
      const given = readCases(await defaultOf(files.cases));
      if (given.faults.length)
        unreadable(
          files.cases,
          `The cases cannot be read: their default export is not a plugin's cases:\n- ${given.faults.join("\n- ")}`,
        );
      else read.cases = given.cases;
    } catch (error) {
      unreadable(files.cases, `The cases cannot be read: ${reason(error)}`);
    }

  // que is stricter than the standard, which skips a folder with no SKILL.md: such a folder is a skill whose file is
  // missing or misnamed.
  for (const folder of read.skillNames) {
    const file = files.skill(folder);
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
      unreadable(
        file,
        `The skill cannot be read: skills/${folder} has no SKILL.md. Each folder under skills/ is a skill: give it its SKILL.md, or move it into the skill it belongs to.`,
      );
      continue;
    }
    try {
      read.skills.push(parseSkill(folder, await readFile(file, "utf8")));
    } catch (error) {
      unreadable(file, `The skill cannot be read: ${reason(error)}`);
    }
  }
  return read;
}
