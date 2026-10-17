import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPLIED } from "./supplied.js";

const repo = join(import.meta.dirname, "../../../..");

// The names as the docs write them: `a`, `b`, `c` and `d`.
const names = Object.keys(SUPPLIED).map((name) => `\`${name}\``);
const written = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// Each list of names in code type that holds `@que/core`.
const lists = (text: string) =>
  [
    ...text.matchAll(
      /(?:`[^`]+`(?:, | and ))*`@que\/core`(?:(?:, | and )`[^`]+`)*/g,
    ),
  ].map(([list]) => list);

for (const doc of ["README.md", "server/core/package.md"]) {
  test(`${doc} names each package que supplies, and no other`, () => {
    const found = lists(readFileSync(join(repo, doc), "utf8"));
    assert.ok(
      found.includes(written),
      `${doc} lists ${JSON.stringify(found)}, and que supplies ${written}`,
    );
  });
}
