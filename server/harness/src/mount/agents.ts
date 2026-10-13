/**
 * Mount: read a deployment's agent configs at startup. A config that breaks
 * the contract (validateAgent in @que/core) fails mounting, and so do two of
 * one name.
 */

import { validateAgent, type AgentDefinition } from "@que/core";
import { mountFiles } from "./files.js";

export const mountAgents = (files: string[]): Promise<AgentDefinition[]> =>
  mountFiles(files, "agent", validateAgent);
