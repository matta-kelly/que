/**
 * Mount: read a deployment's agent configs at startup. A config that breaks
 * the contract (validateAgent in @mku1tra/que-harness) fails mounting, and so do two of
 * one name.
 */

import { validateAgent, type Agent } from "@mku1tra/que-harness";
import { mountFiles } from "./files.js";

export const mountAgents = (files: string[]): Promise<Agent[]> =>
  mountFiles(files, "agent", validateAgent);
