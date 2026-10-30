/**
 * The guard of the pair's release: given the manifests of @mku1tra/que-plugin and @mku1tra/que-harness at the commit
 * a tag names, and npm's records of each package's versions, it says which of the pair to publish, or refuses and
 * names why. One tag publishes the pair from one job, with provenance, and no package of the pair is published by hand.
 */

import { satisfies } from "semver";

/** A package's manifest at the commit: its package.json, of which the guard reads these fields. */
export type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** npm's record of one version: an entry of the package's `versions` on the registry (GET registry.npmjs.org/<name>). */
export type NpmVersion = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  dist?: {
    attestations?: { url: string; provenance?: { predicateType: string } };
  };
};

/** Each version npm has of a package, by version: the `versions` of its packument. A package npm does not have has none. */
export type NpmVersions = Record<string, NpmVersion>;

/** The two packages of the pair. */
export type Pair<T> = { plugin: T; harness: T };

/**
 * Why a release refuses a package
 * - peer: harness's peer range on que-plugin is not met by plugin's version at the commit
 * - manifest: npm has the version, and its `dependencies` or `peerDependencies` there differ from the manifest, so the version must move
 * - attestation: npm has the version with no provenance attestation: it was published by hand
 */
export type Why = "peer" | "manifest" | "attestation";

/** A package the release refuses, by its npm name, and why. */
export type Refusal = { name: string; why: Why };

/**
 * What one tag's job does: the packages to publish by name, plugin before harness, and the refusals.
 * A release that refuses publishes nothing.
 */
export type Decision = { publish: string[]; refused: Refusal[] };

export type Release = (
  manifests: Pair<Manifest>,
  npm: Pair<NpmVersions>,
) => Decision;

/** The same ranges, in any key order. A manifest with no field has none. */
const same = (
  here: Record<string, string> = {},
  there: Record<string, string> = {},
) =>
  Object.keys(here).length === Object.keys(there).length &&
  Object.entries(here).every(([name, range]) => there[name] === range);

/** Why npm's record refuses the manifest's version, or nothing when npm has none or the same one, attested. */
const refuses = (manifest: Manifest, npm: NpmVersions): Why | undefined => {
  const published = npm[manifest.version];
  if (!published) return undefined;
  if (
    !same(manifest.dependencies, published.dependencies) ||
    !same(manifest.peerDependencies, published.peerDependencies)
  )
    return "manifest";
  if (!published.dist?.attestations?.provenance) return "attestation";
  return undefined;
};

export const release: Release = (manifests, npm) => {
  const { plugin, harness } = manifests;
  const onPlugin = harness.peerDependencies?.[plugin.name];
  const refused: Refusal[] = [];
  if (onPlugin === undefined || !satisfies(plugin.version, onPlugin))
    refused.push({ name: harness.name, why: "peer" });
  for (const side of ["plugin", "harness"] as const) {
    const why = refuses(manifests[side], npm[side]);
    if (why) refused.push({ name: manifests[side].name, why });
  }
  if (refused.length) return { publish: [], refused };
  const publish = (["plugin", "harness"] as const)
    .filter((side) => !npm[side][manifests[side].version])
    .map((side) => manifests[side].name);
  return { publish, refused };
};
