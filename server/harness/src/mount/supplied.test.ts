import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPLIED } from "./supplied.js";

const repo = join(import.meta.dirname, "../../../..");

// The names as the docs write them: `a`.
const names = Object.keys(SUPPLIED).map((name) => `\`${name}\``);

// Each list of two or more names in code type that holds a supplied name.
// A name alone, as the README writes `@que/plugin` in its layout, is not a list.
const lists = (text: string) =>
  [...text.matchAll(/`[^`]+`(?:(?:, | and )`[^`]+`)+/g)]
    .map(([list]) => list)
    .filter((list) => names.some((name) => list.includes(name)));

for (const doc of ["README.md", "server/plugin/plugin-contract.md"]) {
  test(`${doc} names each supplied package, and lists no package que does not supply`, () => {
    const text = readFileSync(join(repo, doc), "utf8");
    for (const name of names)
      assert.ok(text.includes(name), `${doc} does not name ${name}`);
    const found = lists(text);
    assert.ok(found.length > 0, `${doc} lists no package que supplies`);
    for (const list of found)
      for (const listed of list.match(/`[^`]+`/g) ?? [])
        assert.ok(
          names.includes(listed),
          `${doc} lists ${listed} with the packages que supplies, and que does not supply it`,
        );
  });
}
