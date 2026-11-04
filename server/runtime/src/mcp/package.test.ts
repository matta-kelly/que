/**
 * The runtime's package, and which MCP SDK it ships. The mouth serves on
 * `@modelcontextprotocol/server` 2.x; the v1 `@modelcontextprotocol/sdk`
 * stays only as the test client the mouth's tests speak through, so it must
 * not be a runtime dependency. A note beside this test says why it is kept.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The runtime's package, as the install reads it. */
const runtime = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

test("given the runtime's package, when it is read, then @modelcontextprotocol/sdk is not a runtime dependency, because the mouth serves on @modelcontextprotocol/server 2.x and the v1 sdk is only a test client", () => {
  const runtimeFields = [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const;

  for (const field of runtimeFields) {
    assert.equal(
      runtime[field]?.["@modelcontextprotocol/sdk"],
      undefined,
      `the runtime names @modelcontextprotocol/sdk in ${field}: the mouth must not ship the v1 sdk`,
    );
  }
});
