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

throw new Error("not implemented");
