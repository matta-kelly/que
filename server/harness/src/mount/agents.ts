/**
 * Mount: read a deployment's agent configs at startup. Each file it is given
 * has one config as its default export. A config that breaks the contract
 * (validateAgent in @que/core) fails mounting, and so do two of one name.
 */

import "./supply.js";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateAgent, type AgentDefinition } from "@que/core";

export async function mountAgents(files: string[]): Promise<AgentDefinition[]> {
  const agents: AgentDefinition[] = [];

  for (const file of files) {
    if (!existsSync(file))
      throw new Error(`mount: ${file} holds no agent (no such file)`);
    const definition = (
      (await import(pathToFileURL(file).href)) as { default?: unknown }
    ).default;
    try {
      validateAgent(definition);
    } catch (error) {
      throw new Error(`mount: ${file}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    if (agents.some((agent) => agent.name === definition.name))
      throw new Error(
        `mount: ${file}: two agents are named "${definition.name}"`,
      );
    agents.push(definition);
  }
  return agents;
}
