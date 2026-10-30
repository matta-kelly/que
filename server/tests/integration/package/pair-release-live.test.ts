/**
 * The guard's step of the pair's release (scripts/pair-release-live.ts), end to end: the step reads the manifests at
 * the commit and npm's records from the registry, and tells the publish steps which of the pair to publish. The
 * registry is a local one, on 127.0.0.1, that serves each package's packument as the npm registry does, built from
 * the manifests at this commit: so no network, and the cases hold whatever versions the manifests move to. The
 * guard's rules are pair-release.test.ts's; these hold that the step reads npm's records and writes the decision.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Manifest, NpmVersion } from "../../../scripts/pair-release.ts";

const server = join(import.meta.dirname, "../../..");
const manifest = (side: string) =>
  JSON.parse(
    readFileSync(join(server, side, "package.json"), "utf8"),
  ) as Manifest;
const plugin = manifest("plugin");
const harness = manifest("harness");

/** npm's record of a version as it was published: the manifest's ranges, with an attestation or with none. */
const record = (of: Manifest, attested: boolean): NpmVersion => ({
  ...(of.dependencies && { dependencies: of.dependencies }),
  ...(of.peerDependencies && { peerDependencies: of.peerDependencies }),
  dist: attested
    ? {
        attestations: {
          url: `https://registry.npmjs.org/-/npm/v1/attestations/${of.name}@${of.version}`,
          provenance: { predicateType: "https://slsa.dev/provenance/v1" },
        },
      }
    : {},
});

/** What the registry has of each package, by name: its versions, or none at all (a 404). */
let has: Record<string, Record<string, NpmVersion>> = {};

let registry: Server;
let url = "";
const work = mkdtempSync(join(tmpdir(), "que-pair-release-live-"));

before(async () => {
  registry = createServer((request, response) => {
    // npm asks for a scoped package as /@scope%2fname; a plain fetch may ask /@scope/name.
    const name = decodeURIComponent(
      (request.url ?? "").split("?")[0].replace(/^\/+/, ""),
    );
    const versions = has[name];
    response.setHeader("content-type", "application/json");
    if (request.method !== "GET" || !versions) {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const latest = Object.keys(versions).at(-1) ?? "";
    response.end(
      JSON.stringify({
        _id: name,
        name,
        "dist-tags": { latest },
        versions: Object.fromEntries(
          Object.entries(versions).map(([version, at]) => [
            version,
            { name, version, ...at },
          ]),
        ),
      }),
    );
  });
  await new Promise<void>((done) => registry.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(registry.address() as AddressInfo).port}/`;
});

after(() => {
  registry.close();
  rmSync(work, { recursive: true, force: true });
});

type Run = { code: number; output: string; said: string };

/** Given what npm has, when the guard's step runs as the job runs it, then its exit, its GITHUB_OUTPUT and what it said. */
const guard = async (
  npm: Record<string, Record<string, NpmVersion>>,
): Promise<Run> => {
  has = npm;
  const output = join(work, `output-${Math.random().toString(36).slice(2)}`);
  writeFileSync(output, "");
  // Async, so the registry in this process can answer the step while it runs.
  const { code, said } = await new Promise<{ code: number; said: string }>(
    (done) =>
      execFile(
        "npx",
        ["tsx", "scripts/pair-release-live.ts"],
        {
          cwd: server,
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            npm_config_registry: url,
          },
        },
        (error, stdout, stderr) =>
          done({
            code: error ? Number(error.code ?? 1) || 1 : 0,
            said: `${stdout}${stderr}`,
          }),
      ),
  );
  return { code, output: readFileSync(output, "utf8"), said };
};

/** Each `name=value` line of GITHUB_OUTPUT, as the publish steps read it. */
const lines = (output: string): Record<string, string> =>
  Object.fromEntries(
    output
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => line.split("=", 2).map((part) => part.trim())),
  );

/** The decision: which side of the pair to publish. */
const sides = (output: string) => {
  const { plugin, harness } = lines(output);
  return { plugin, harness };
};

test("given npm has neither version at the commit, when the guard's step runs, then it names both to publish", async () => {
  const run = await guard({});
  assert.deepEqual(
    sides(run.output),
    { plugin: "true", harness: "true" },
    `GITHUB_OUTPUT: ${JSON.stringify(run.output)}; the step said: ${run.said}`,
  );
  assert.equal(run.code, 0, run.said);
});

test("given a run again after a partial publish, plugin on npm and attested and harness new, when the guard's step runs, then it names harness alone", async () => {
  const run = await guard({
    [plugin.name]: { [plugin.version]: record(plugin, true) },
    [harness.name]: {},
  });
  assert.deepEqual(
    sides(run.output),
    { plugin: "false", harness: "true" },
    `GITHUB_OUTPUT: ${JSON.stringify(run.output)}; the step said: ${run.said}`,
  );
  assert.equal(run.code, 0, run.said);
});

test("given npm has both versions, each the same and attested, when the guard's step runs, then it names neither and passes", async () => {
  const run = await guard({
    [plugin.name]: { [plugin.version]: record(plugin, true) },
    [harness.name]: { [harness.version]: record(harness, true) },
  });
  assert.deepEqual(
    sides(run.output),
    { plugin: "false", harness: "false" },
    `GITHUB_OUTPUT: ${JSON.stringify(run.output)}; the step said: ${run.said}`,
  );
  assert.equal(run.code, 0, run.said);
});

test("given npm has harness's version with no attestation (published by hand), when the guard's step runs, then the job stops there, names harness and publishes nothing", async () => {
  const run = await guard({
    [plugin.name]: { [plugin.version]: record(plugin, true) },
    [harness.name]: { [harness.version]: record(harness, false) },
  });
  assert.ok(
    run.said.includes(harness.name),
    `the step names ${harness.name}; it said: ${run.said}`,
  );
  assert.notEqual(run.code, 0, "a refusal stops the job");
  assert.doesNotMatch(run.output, /=\s*true/, "no side is named to publish");
});

test("given npm has plugin's version with other peer ranges than the commit's, when the guard's step runs, then it names plugin, whose version must move, and publishes nothing", async () => {
  const moved: Manifest = {
    ...plugin,
    peerDependencies: { ...plugin.peerDependencies, zod: "^3.0.0" },
  };
  const run = await guard({
    [plugin.name]: { [plugin.version]: record(moved, true) },
  });
  assert.ok(
    run.said.includes(plugin.name),
    `the step names ${plugin.name}; it said: ${run.said}`,
  );
  assert.notEqual(run.code, 0, "a refusal stops the job");
  assert.doesNotMatch(run.output, /=\s*true/, "no side is named to publish");
});

test("given npm has neither version, when the guard's step runs, then it writes each package's dist-tag, latest for a release version, for the publish step's --tag", async () => {
  for (const side of [plugin, harness])
    assert.equal(
      side.version.includes("-"),
      false,
      `the case reads ${side.name}@${side.version} as a release version`,
    );
  const run = await guard({});
  const written = lines(run.output);
  assert.deepEqual(
    { plugin_tag: written.plugin_tag, harness_tag: written.harness_tag },
    { plugin_tag: "latest", harness_tag: "latest" },
    `GITHUB_OUTPUT: ${JSON.stringify(run.output)}; the step said: ${run.said}`,
  );
});
