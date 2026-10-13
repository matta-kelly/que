/**
 * Mount: hand the contract to a folder outside que. A package or a deployment
 * there imports `@que/core` and `zod` by name, and has no copy of its own.
 * It gets que's copy, so an `OperationFailed` it throws is the one que knows.
 */

import { registerHooks } from "node:module";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = join(import.meta.dirname, "../../..");
const SUPPLIED = new Set(["@que/core", "zod"]);

function isOutsideQue(parentURL: string | undefined): boolean {
  if (!parentURL?.startsWith("file:")) return false;
  // The separator keeps a sibling such as `server-old/` outside.
  return !fileURLToPath(parentURL).startsWith(HARNESS + sep);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (SUPPLIED.has(specifier) && isOutsideQue(context.parentURL))
      return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    return nextResolve(specifier, context);
  },
});
