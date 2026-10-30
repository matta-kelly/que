/**
 * The guard of the pair's release on npm's live records: the step of `.github/workflows/publish.yml` that runs the
 * guard (`pair-release.ts`) before either package of the pair is published. Run from `server/` as
 * `npx tsx scripts/pair-release-live.ts`.
 *
 * - in: the manifests at the commit (`server/plugin/package.json`, `server/harness/package.json`), and npm's records
 *   of each package: the `versions` of its packument, from the registry npm is set to (`npm_config_registry`, else
 *   https://registry.npmjs.org/). A package the registry does not have (404) has no versions
 * - out: one line for each side of the pair, appended to the file `GITHUB_OUTPUT` names, `plugin=true|false` and
 *   `harness=true|false`: true when the guard names that package to publish
 * - a refusal: the job stops here. It exits non-zero, names each refused package and why, and writes no side true
 */

import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  release,
  type Manifest,
  type NpmVersions,
  type Pair,
  type Why,
} from "./pair-release.ts";

const server = join(import.meta.dirname, "..");
const manifest = (side: string): Manifest =>
  JSON.parse(readFileSync(join(server, side, "package.json"), "utf8"));

/** What each refusal means for the release, said to whoever pushed the tag. */
const because: Record<Why, string> = {
  peer: "its peer range on que-plugin is not met by plugin's version",
  manifest: "npm has this version with other ranges: its version must move",
  attestation: "npm has this version, unattested: its version must move",
};

const registry =
  process.env.npm_config_registry ?? "https://registry.npmjs.org/";

/** npm's records of a package: the `versions` of its packument, or none when the registry does not have it. */
const versions = async (name: string): Promise<NpmVersions> => {
  const response = await fetch(new URL(name.replace("/", "%2f"), registry), {
    headers: { accept: "application/json" },
  });
  if (response.status === 404) return {};
  if (!response.ok)
    throw new Error(`${registry} answers ${response.status} for ${name}`);
  const packument = (await response.json()) as { versions?: NpmVersions };
  return packument.versions ?? {};
};

const manifests: Pair<Manifest> = {
  plugin: manifest("plugin"),
  harness: manifest("harness"),
};
const npm: Pair<NpmVersions> = {
  plugin: await versions(manifests.plugin.name),
  harness: await versions(manifests.harness.name),
};
const { publish, refused } = release(manifests, npm);

if (refused.length) {
  for (const { name, why } of refused)
    console.error(`the release refuses ${name}: ${because[why]}`);
  process.exit(1);
}

const output = process.env.GITHUB_OUTPUT;
if (!output) throw new Error("GITHUB_OUTPUT names no file");
appendFileSync(
  output,
  (["plugin", "harness"] as const)
    .map((side) => `${side}=${publish.includes(manifests[side].name)}\n`)
    .join(""),
);
console.log(
  publish.length
    ? `the release publishes ${publish.join(", then ")}`
    : "npm has both versions, attested: the release publishes nothing",
);
