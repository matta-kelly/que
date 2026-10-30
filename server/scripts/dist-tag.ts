/**
 * The npm dist-tag a publish of the pair names, from the version it publishes.
 *
 * - a release version: `latest`
 * - a prerelease: its first prerelease identifier, when `semver.validRange` rejects it and it is not `latest`
 *   (`0.9.0-rc.1` gives `rc`); else `next` (`0.9.0-1`, `0.9.0-x.1`, `0.9.0-latest.1`). npm refuses a tag that is a
 *   valid range, and a prerelease never takes `latest`
 */

export const distTag = (version: string): string => {
  void version;
  return "";
};
