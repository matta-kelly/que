/**
 * pi's API changes without notice, and the engine reads parts its README marks
 * experimental: each of que's packages that names pi-durable or pi-ai names
 * the one version the engine is written for, exactly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const repo = join(import.meta.dirname, "../../../../..");
const PI = new Set(["@earendil-works/pi-durable", "@earendil-works/pi-ai"]);
const FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/** Each package.json of que's own, under `dir`: none from an install or a build. */
function packageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".git", "dist", ".next"].includes(entry.name))
      return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return packageFiles(path);
    return entry.name === "package.json" ? [path] : [];
  });
}

/** Each naming of pi in que's package.json files, as "file: name@version". */
const named = packageFiles(repo).flatMap((file) => {
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<
    string,
    Record<string, string> | undefined
  >;
  return FIELDS.flatMap((field) =>
    Object.entries(json[field] ?? {})
      .filter(([name]) => PI.has(name))
      .map(([name, version]) => `${relative(repo, file)}: ${name}@${version}`),
  );
});

test("each package.json of que's that names pi-durable or pi-ai names exactly 1.4.0, with no range", () => {
  // The scan finds a package that names pi: one with no naming would pass it with nothing to check.
  assert.ok(
    named.includes(
      "server/backend/pi-storage/package.json: @earendil-works/pi-durable@1.4.0",
    ),
    `the scan found ${JSON.stringify(named)}`,
  );
  assert.deepEqual(
    named.filter((naming) => !naming.endsWith("@1.4.0")),
    [],
  );
});
