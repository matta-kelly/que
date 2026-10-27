/**
 * The saved copy of the facts: the last good answer of each source, by the
 * model's id, in the deployment's folder. Read when a source gives no answer,
 * so a start with no network runs on what the last start learned. Run state:
 * it is not in git. A person or another program can change the file, so what
 * is read from it is checked as a source's answer is: a fact that is not in
 * the shape is no fact.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModelFacts, ModelPrice } from "@mku1tra/que-harness";

export type Saved = Record<string, ModelFacts>;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const priceIn = (value: unknown): ModelPrice | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const { input, output, cachedInput } = value as Record<string, unknown>;
  if (!isAmount(input) || !isAmount(output)) return undefined;
  if (cachedInput !== undefined && !isAmount(cachedInput)) return undefined;
  return { input, output, ...(cachedInput !== undefined && { cachedInput }) };
};

const factsIn = (value: object): ModelFacts => {
  const { window, price } = value as Record<string, unknown>;
  const kept = priceIn(price);
  return {
    ...(Number.isInteger(window) &&
      (window as number) > 0 && { window: window as number }),
    ...(kept && { price: kept }),
  };
};

export function savedFacts(folder: string) {
  const file = join(folder, ".que", "model-facts.json");
  return {
    /** A file that is missing or broken reads as empty. */
    async read(): Promise<Saved> {
      try {
        const saved: unknown = JSON.parse(await readFile(file, "utf8"));
        if (!saved || typeof saved !== "object" || Array.isArray(saved))
          return {};
        return Object.fromEntries(
          Object.entries(saved)
            .filter(([, facts]) => facts && typeof facts === "object")
            .map(([id, facts]) => [id, factsIn(facts as object)]),
        );
      } catch {
        return {};
      }
    },
    /** Whole, to a file of its own beside it that is then moved over it: two writes at one time cannot leave half a file. */
    async write(saved: Saved): Promise<void> {
      await mkdir(dirname(file), { recursive: true });
      const beside = `${file}.${randomUUID()}.tmp`;
      await writeFile(beside, `${JSON.stringify(saved, null, 2)}\n`);
      await rename(beside, file);
    },
  };
}
