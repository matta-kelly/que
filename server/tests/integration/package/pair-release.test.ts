/**
 * The guard of the pair's release (scripts/pair-release.ts): from the manifests of @mku1tra/que-plugin and
 * @mku1tra/que-harness at a commit, and npm's records of their versions, which of the pair one tag publishes, or why it
 * refuses. No network: npm's records are fixtures/npm-versions.json, the `versions` of each package on the registry,
 * with each version's peer ranges and attestation as npm gave them on 2026-10-29 (npm's key order kept), and its
 * dependencies as its manifest at its tag. The manifests are que's at its tags, at 7f88575 and at main, as named.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  release,
  type Manifest,
  type NpmVersions,
  type Pair,
} from "../../../scripts/pair-release.ts";

const PLUGIN = "@mku1tra/que-plugin";
const HARNESS = "@mku1tra/que-harness";

const registry = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures/npm-versions.json"), "utf8"),
) as Record<string, NpmVersions>;
const npm: Pair<NpmVersions> = {
  plugin: registry[PLUGIN],
  harness: registry[HARNESS],
};

type Ranges = Record<string, string>;

const plugin = (
  version: string,
  basis: string,
  dependencies: Ranges | null = { ajv: "^8.20.0" },
): Manifest => ({
  name: PLUGIN,
  version,
  ...(dependencies && { dependencies }),
  peerDependencies: { "@mku1tra/basis": basis, zod: "^4.6.5" },
});

const harness = (
  version: string,
  basis: string,
  onPlugin: string,
  dependencies?: Ranges,
): Manifest => ({
  name: HARNESS,
  version,
  ...(dependencies && { dependencies }),
  peerDependencies: {
    "@mku1tra/basis": basis,
    "@mku1tra/que-plugin": onPlugin,
    zod: "^4.6.5",
  },
});

const piAi = { "@earendil-works/pi-ai": "1.4.0" };

// que at its tag que-harness-v0.2.0: both versions npm has, published by that tag's run and the one before.
const atHarness020 = {
  plugin: plugin("0.7.0", "^0.30.0"),
  harness: harness("0.2.0", "^0.30.0", "^0.7.0", {
    "@earendil-works/pi-ai": "^1.4.0",
  }),
};
// que at its tag que-harness-v0.1.1: harness has no dependencies, here or on npm.
const atHarness011 = {
  plugin: plugin("0.6.0", "^0.22.0"),
  harness: harness("0.1.1", "^0.22.0", "^0.6.0"),
};
// que at 7f88575: plugin 0.8.0 as npm has it, and harness still 0.2.0, which asks for ^0.8.0 here and ^0.7.0 on npm.
const at7f88575 = {
  plugin: plugin("0.8.0", "^0.30.0"),
  harness: harness("0.2.0", "^0.30.0", "^0.8.0", piAi),
};
// que at main: harness 0.3.0, which npm has from a publish by hand, with no attestation.
const atMain = {
  plugin: plugin("0.8.0", "^0.30.0"),
  harness: harness("0.3.0", "^0.30.0", "^0.8.0", piAi),
};

const refused = (name: string, why: string) => ({
  publish: [],
  refused: [{ name, why }],
});
const publishes = (...names: string[]) => ({ publish: names, refused: [] });

test("given harness's peer range on que-plugin not met by plugin's version at the commit, when the guard decides, then it refuses for harness and publishes nothing", () => {
  const cases: [string, Pair<Manifest>][] = [
    [
      "plugin 0.9.0 and harness 0.4.0 asking ^0.8.0, both new",
      {
        plugin: plugin("0.9.0", "^0.30.0"),
        harness: harness("0.4.0", "^0.30.0", "^0.8.0", piAi),
      },
    ],
    [
      "plugin 0.8.0 on npm, and harness 0.4.0 new asking ^0.9.0",
      {
        plugin: plugin("0.8.0", "^0.30.0"),
        harness: harness("0.4.0", "^0.30.0", "^0.9.0", piAi),
      },
    ],
    [
      "plugin 0.7.0 on npm, and harness 0.4.0 new asking ^0.8.0",
      {
        plugin: plugin("0.7.0", "^0.30.0"),
        harness: harness("0.4.0", "^0.30.0", "^0.8.0", piAi),
      },
    ],
  ];
  for (const [given, manifests] of cases)
    assert.deepEqual(release(manifests, npm), refused(HARNESS, "peer"), given);
});

test("given a package at a version npm has, whose dependencies or peerDependencies on npm differ from its manifest, when the guard decides, then it refuses for that package, whose version must move", () => {
  const cases: [string, Pair<Manifest>, string][] = [
    [
      "que at 7f88575: harness 0.2.0 asks ^0.8.0 of plugin and pi-ai 1.4.0, npm's 0.2.0 ^0.7.0 and ^1.4.0",
      at7f88575,
      HARNESS,
    ],
    [
      "harness 0.2.0 whose peer range on plugin alone moved, to ^0.8.0",
      {
        plugin: plugin("0.8.0", "^0.30.0"),
        harness: harness("0.2.0", "^0.30.0", "^0.8.0", {
          "@earendil-works/pi-ai": "^1.4.0",
        }),
      },
      HARNESS,
    ],
    [
      "plugin 0.8.0 whose dependency on ajv moved, to ^8.21.0",
      {
        plugin: plugin("0.8.0", "^0.30.0", { ajv: "^8.21.0" }),
        harness: harness("0.4.0", "^0.30.0", "^0.8.0", piAi),
      },
      PLUGIN,
    ],
    [
      "plugin 0.7.0 with a dependency npm's 0.7.0 does not have",
      {
        plugin: plugin("0.7.0", "^0.30.0", {
          ajv: "^8.20.0",
          semver: "^7.8.5",
        }),
        harness: atHarness020.harness,
      },
      PLUGIN,
    ],
    [
      "plugin 0.8.0 with no dependencies, where npm's 0.8.0 has ajv",
      {
        plugin: plugin("0.8.0", "^0.30.0", null),
        harness: harness("0.4.0", "^0.30.0", "^0.8.0", piAi),
      },
      PLUGIN,
    ],
    [
      "plugin 0.7.0 whose peer range on basis moved, to ^0.31.0",
      {
        plugin: plugin("0.7.0", "^0.31.0"),
        harness: atHarness020.harness,
      },
      PLUGIN,
    ],
  ];
  for (const [given, manifests, name] of cases)
    assert.deepEqual(release(manifests, npm), refused(name, "manifest"), given);
});

test("given a package at a version npm has with no provenance attestation, when the guard decides, then it refuses for that package", () => {
  const cases: [string, Pair<Manifest>, string][] = [
    ["que at main: harness 0.3.0, published by hand", atMain, HARNESS],
    [
      "plugin 0.5.0, published by hand, and harness 0.4.0 new asking ^0.5.0",
      {
        plugin: plugin("0.5.0", "^0.19.0"),
        harness: harness("0.4.0", "^0.19.0", "^0.5.0", piAi),
      },
      PLUGIN,
    ],
  ];
  for (const [given, manifests, name] of cases)
    assert.deepEqual(
      release(manifests, npm),
      refused(name, "attestation"),
      given,
    );
});

test("given both versions on npm, each with the same manifest and an attestation, when the guard decides, then it publishes nothing and does not refuse: a run again", () => {
  const cases: [string, Pair<Manifest>][] = [
    [
      "que at que-harness-v0.2.0, its peer ranges in another key order than npm's",
      atHarness020,
    ],
    ["que at que-harness-v0.1.1, harness with no dependencies", atHarness011],
  ];
  for (const [given, manifests] of cases)
    assert.deepEqual(release(manifests, npm), publishes(), given);
});

test("given one version new and the other on npm, the same and attested, when the guard decides, then it publishes only the new one", () => {
  const cases: [string, Pair<Manifest>, string[]][] = [
    [
      "the run again after a partial publish: plugin 0.8.0 on npm from the failed run, and harness 0.4.0 new",
      {
        plugin: plugin("0.8.0", "^0.30.0"),
        harness: harness("0.4.0", "^0.30.0", "^0.8.0", piAi),
      },
      [HARNESS],
    ],
    [
      "plugin 0.7.1 new, which harness 0.2.0 on npm takes at ^0.7.0",
      {
        plugin: plugin("0.7.1", "^0.30.0"),
        harness: atHarness020.harness,
      },
      [PLUGIN],
    ],
    [
      "both new: plugin 0.9.0, and harness 0.4.0 asking ^0.9.0, plugin first",
      {
        plugin: plugin("0.9.0", "^0.30.0"),
        harness: harness("0.4.0", "^0.30.0", "^0.9.0", piAi),
      },
      [PLUGIN, HARNESS],
    ],
  ];
  for (const [given, manifests, names] of cases)
    assert.deepEqual(release(manifests, npm), publishes(...names), given);
});

test("given harness with no peer range on que-plugin, when the guard decides, then it refuses for harness, which must declare the plugin it runs on, and publishes nothing", () => {
  const noPluginPeer: Manifest = {
    name: HARNESS,
    version: "0.4.0",
    dependencies: piAi,
    peerDependencies: { "@mku1tra/basis": "^0.30.0", zod: "^4.6.5" },
  };
  const noPeers: Manifest = {
    name: HARNESS,
    version: "0.4.0",
    dependencies: piAi,
  };
  const cases: [string, Pair<Manifest>][] = [
    [
      "plugin 0.8.0 on npm, and harness 0.4.0 new with peers on basis and zod alone",
      { plugin: plugin("0.8.0", "^0.30.0"), harness: noPluginPeer },
    ],
    [
      "plugin 0.9.0 and harness 0.4.0 with no peerDependencies, both new",
      { plugin: plugin("0.9.0", "^0.30.0"), harness: noPeers },
    ],
  ];
  for (const [given, manifests] of cases)
    assert.deepEqual(release(manifests, npm), refused(HARNESS, "peer"), given);
});

test("given several refusals in one release, when the guard decides, then it lists each, one for each package and reason, and publishes nothing; a version npm has whose manifest differs is refused for its manifest alone, with or without an attestation", () => {
  const cases: [string, Pair<Manifest>, [string, string][]][] = [
    [
      "plugin 0.8.0 whose ajv moved, and harness 0.3.0 published by hand",
      {
        plugin: plugin("0.8.0", "^0.30.0", { ajv: "^8.21.0" }),
        harness: atMain.harness,
      },
      [
        [PLUGIN, "manifest"],
        [HARNESS, "attestation"],
      ],
    ],
    [
      "plugin 0.5.0 published by hand, and harness 0.4.0 new asking ^0.8.0",
      {
        plugin: plugin("0.5.0", "^0.19.0"),
        harness: harness("0.4.0", "^0.19.0", "^0.8.0", piAi),
      },
      [
        [PLUGIN, "attestation"],
        [HARNESS, "peer"],
      ],
    ],
    [
      "harness 0.3.0, published by hand, now asking ^0.9.0 of plugin 0.8.0",
      {
        plugin: atMain.plugin,
        harness: harness("0.3.0", "^0.30.0", "^0.9.0", piAi),
      },
      [
        [HARNESS, "peer"],
        [HARNESS, "manifest"],
      ],
    ],
    [
      "harness 0.3.0, published by hand, whose pi-ai moved, to ^1.4.0",
      {
        plugin: atMain.plugin,
        harness: harness("0.3.0", "^0.30.0", "^0.8.0", {
          "@earendil-works/pi-ai": "^1.4.0",
        }),
      },
      [[HARNESS, "manifest"]],
    ],
    [
      "plugin 0.5.0, published by hand, whose peer range on basis moved, to ^0.20.0",
      {
        plugin: plugin("0.5.0", "^0.20.0"),
        harness: harness("0.4.0", "^0.20.0", "^0.5.0", piAi),
      },
      [[PLUGIN, "manifest"]],
    ],
  ];
  // The order of the refusals is not the guard's contract: each one is.
  const sorted = (refusals: { name: string; why: string }[]) =>
    refusals
      .map(({ name, why }) => `${name} ${why}`)
      .sort((a, b) => a.localeCompare(b));
  for (const [given, manifests, expected] of cases) {
    const decision = release(manifests, npm);
    assert.deepEqual(decision.publish, [], given);
    assert.deepEqual(
      sorted(decision.refused),
      sorted(expected.map(([name, why]) => ({ name, why }))),
      given,
    );
  }
});
