import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";

/**
 * The files of basis that importing `specifier` loads, in a new process, so that
 * nothing this test file has imported counts.
 */
const basisLoadedBy = (specifier: string) =>
  new Promise<string[]>((resolve, reject) => {
    const probe = `
      import { registerHooks } from "node:module";
      const loaded = [];
      registerHooks({
        resolve(specifier, context, nextResolve) {
          const resolved = nextResolve(specifier, context);
          if (resolved.url.includes("/node_modules/basis/")) loaded.push(resolved.url);
          return resolved;
        },
      });
      await import(${JSON.stringify(specifier)});
      console.log(JSON.stringify(loaded));
    `;
    execFile(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", probe],
      { cwd: import.meta.dirname, timeout: 20_000 },
      (error, out) =>
        error ? reject(error) : resolve(JSON.parse(out) as string[]),
    );
  });

test("@que/core/ontology gives a basis package named que", async () => {
  const { que } = await import("@que/core/ontology");
  assert.equal(que.name, "que");
  assert.equal(typeof que.parse, "function");
});

test("importing @que/core does not load basis, and importing @que/core/ontology does", async () => {
  assert.deepEqual(await basisLoadedBy("@que/core"), []);
  // The probe sees basis when it is loaded, so the empty list above is not for want of looking.
  assert.notDeepEqual(await basisLoadedBy("@que/core/ontology"), []);
});
