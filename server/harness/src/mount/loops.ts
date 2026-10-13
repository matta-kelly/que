/**
 * Mount: read a deployment's loop configs at startup. A loop that breaks the
 * contract (validateLoop in @que/core) fails mounting, and so do two of one
 * name.
 */

import { validateLoop, type LoopDefinition } from "@que/core";
import { mountFiles } from "./files.js";

export const mountLoops = (files: string[]): Promise<LoopDefinition[]> =>
  mountFiles(files, "loop", validateLoop);
