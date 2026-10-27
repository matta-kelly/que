/**
 * Mount: hand `@mku1tra/que-plugin` and `@mku1tra/que-harness` to a folder outside que. A
 * plugin or a deployment there imports what que supplies (`supplied.ts`) by
 * name. It gets que's copy, even if it installs its own, so an
 * `OpFailed` it throws is the one que knows. Any other name resolves
 * as usual, from its own install.
 */

import { registerHooks } from "node:module";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPLIED } from "./supplied.js";

const SERVER = join(import.meta.dirname, "../../..");

// Each name goes by its bare name only, the name the type check maps: a package's `exports` list only its index.
const isSupplied = (specifier: string) => Object.hasOwn(SUPPLIED, specifier);

function isOutsideQue(parentURL: string | undefined): boolean {
  if (!parentURL?.startsWith("file:")) return false;
  // The separator keeps a sibling such as `server-old/` outside.
  return !fileURLToPath(parentURL).startsWith(SERVER + sep);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (isSupplied(specifier) && isOutsideQue(context.parentURL))
      return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    return nextResolve(specifier, context);
  },
});
