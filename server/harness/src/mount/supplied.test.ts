import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPLIED } from "./supplied.js";

const repo = join(import.meta.dirname, "../../../..");

// The names as the docs write them: `a`, `b`, `c` and `d`.
const names = Object.keys(SUPPLIED).map((name) => `\`${name}\``);
const written = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// Each list of two or more names in code type that holds a supplied name.
// A name alone, as the README writes `@que/core` in its layout, is not a list.
const lists = (text: string) =>
  [...text.matchAll(/`[^`]+`(?:(?:, | and )`[^`]+`)+/g)]
    .map(([list]) => list)
    .filter((list) => names.some((name) => list.includes(name)));

for (const doc of ["README.md", "server/core/package.md"]) {
  test(`each list in ${doc} that names a supplied package names all of them, and no other`, () => {
    const found = lists(readFileSync(join(repo, doc), "utf8"));
    assert.ok(found.length > 0, `${doc} lists no package que supplies`);
    for (const list of found)
      assert.equal(
        list,
        written,
        `${doc} lists ${list}, and que supplies ${written}`,
      );
  });
}
