/**
 * Mount: hand `@que/core` to a folder outside que. A package or a deployment
 * there imports `@que/core`, `zod` and `basis` by name, and their subpaths such as
 * `@que/core/ontology`, and has no copy of its own.
 * It gets que's copy, so an `OperationFailed` it throws is the one que knows.
 */

import { registerHooks } from "node:module";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = join(import.meta.dirname, "../../..");
const SUPPLIED = new Set(["@que/core", "zod", "basis"]);

// A subpath is the package's own: `@que/core/ontology` is supplied, `@que/core-old` is not.
function isSupplied(specifier: string): boolean {
  return [...SUPPLIED].some(
    (name) => specifier === name || specifier.startsWith(name + "/"),
  );
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
