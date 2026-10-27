/**
 * Mount: read a deployment's loop configs at startup. A loop that breaks the
 * contract (validateLoop in @mku1tra/que-harness) fails mounting, and so do two of one
 * name.
 */

import { validateLoop, type Loop } from "@mku1tra/que-harness";
import { mountFiles } from "./files.js";

export const mountLoops = (files: string[]): Promise<Loop[]> =>
  mountFiles(files, "loop", validateLoop);
