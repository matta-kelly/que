/**
 * Roots for tests: a folder in the system's temp folder, with the files given, each by its path from the folder. A
 * lint starts only at a root (basis's lintRoot), so a test that lints writes one, with its own basis.config.ts. A
 * root's code imports basis, que's packages and zod by URL, as que's own copies (`url`), so it loads with nothing
 * installed beside it, as code outside que does.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The URL of each package que's code imports, as a string to write into code: que's own copy. */
export const url = {
  basis: JSON.stringify(import.meta.resolve("@mku1tra/basis")),
  plugin: JSON.stringify(import.meta.resolve("@mku1tra/que-plugin")),
  harness: JSON.stringify(import.meta.resolve("@mku1tra/que-harness")),
  zod: JSON.stringify(import.meta.resolve("zod")),
};

/** Write `files` into `folder`, each by its path from it. */
export async function write(
  folder: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(folder, path, ".."), { recursive: true });
    await writeFile(join(folder, path), text);
  }
}

/** A new folder in the system's temp folder, with `files`, and how to remove it. */
export async function folderWith(
  files: Record<string, string>,
  prefix = "que-root-",
): Promise<{ folder: string; remove: () => Promise<void> }> {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  // Its code is ES modules, as a deployment's or a plugin's is.
  await write(folder, { "package.json": '{ "type": "module" }\n', ...files });
  return {
    folder,
    remove: () => rm(folder, { recursive: true, force: true }),
  };
}
