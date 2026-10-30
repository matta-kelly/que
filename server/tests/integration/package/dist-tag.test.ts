/**
 * The dist-tag of a publish of the pair (scripts/dist-tag.ts): `latest` for a release version, and for a prerelease
 * its first identifier, unless semver reads that identifier as a range or it is `latest`, when it is `next`. npm 11
 * refuses a prerelease with no tag, and a tag that is a valid range, so each case is one npm would take.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { distTag } from "../../../scripts/dist-tag.ts";

const cases: [version: string, tag: string, why: string][] = [
  ["0.9.0", "latest", "a release"],
  ["1.2.3", "latest", "a release"],
  ["0.9.0-rc.1", "rc", "its first identifier, which is no range"],
  ["0.9.0-beta", "beta", "its one identifier, which is no range"],
  ["0.9.0-1", "next", "1 is a valid range"],
  ["0.9.0-x.1", "next", "x is a valid range"],
  ["0.9.0-latest.1", "next", "a prerelease never takes latest"],
];

for (const [version, tag, why] of cases)
  test(`given the version ${version}, when its dist-tag is derived, then it is ${tag} (${why})`, () => {
    assert.equal(distTag(version), tag);
  });
