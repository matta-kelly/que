/**
 * The saved copy of the facts: the last good answer of each source, by the
 * model's id, in the deployment's folder. Read when a source gives no answer,
 * so a start with no network runs on what the last start learned. Run state:
 * it is not in git.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModelFacts } from "@que/core";

export type Saved = Record<string, ModelFacts>;

export function savedFacts(folder: string) {
  const file = join(folder, ".que", "model-facts.json");
  return {
    /** A file that is missing or broken reads as empty. */
    async read(): Promise<Saved> {
      try {
        const saved: unknown = JSON.parse(await readFile(file, "utf8"));
        return saved && typeof saved === "object" && !Array.isArray(saved)
          ? (saved as Saved)
          : {};
      } catch {
        return {};
      }
    },
    /** Whole, to a file beside it that is then moved over it: two mounts at one time cannot leave half a file. */
    async write(saved: Saved): Promise<void> {
      await mkdir(dirname(file), { recursive: true });
      const beside = `${file}.${process.pid}.tmp`;
      await writeFile(beside, `${JSON.stringify(saved, null, 2)}\n`);
      await rename(beside, file);
    },
  };
}
