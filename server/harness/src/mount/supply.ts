/**
 * Mount: hand `@que/core` to a folder outside que. A package or a deployment
 * there imports `@que/core`, `zod` and `basis`, or a subpath of `@que/core`
 * (`@que/core/ontology`), by name. It has no copy of its own.
 * It gets que's copy, so an `OperationFailed` it throws is the one que knows.
 */

import { registerHooks } from "node:module";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = join(import.meta.dirname, "../../..");
const SUPPLIED = ["@que/core", "zod", "basis"];

// A subpath of `@que/core` is supplied, as its `exports` allow; `@que/core-old` is not.
// zod and basis go by their bare names only, the names the type check maps.
function isSupplied(specifier: string): boolean {
  return SUPPLIED.includes(specifier) || specifier.startsWith("@que/core/");
}

function isOutsideQue(parentURL: string | undefined): boolean {
  if (!parentURL?.startsWith("file:")) return false;
  // The separator keeps a sibling such as `server-old/` outside.
  return !fileURLToPath(parentURL).startsWith(HARNESS + sep);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (isSupplied(specifier) && isOutsideQue(context.parentURL))
      return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    return nextResolve(specifier, context);
  },
});
