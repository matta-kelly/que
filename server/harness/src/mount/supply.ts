/**
 * Mount: hand `@que/core` and `@que/ontology` to a folder outside que. A
 * plugin or a deployment there imports what que supplies (`supplied.ts`), or
 * another subpath of `@que/core`, by name. It gets que's copy, even if it
 * installs its own, so an `OperationFailed` it throws is the one que knows.
 * Any other name resolves as usual, from its own install.
 */

import { registerHooks } from "node:module";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPLIED } from "./supplied.js";

const HARNESS = join(import.meta.dirname, "../../..");

// A subpath of `@que/core` is supplied, as its `exports` allow; `@que/core-old` is not.
// zod and @mku1tra/basis go by their bare names only, the names the type check maps.
function isSupplied(specifier: string): boolean {
  return (
    Object.hasOwn(SUPPLIED, specifier) || specifier.startsWith("@que/core/")
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
