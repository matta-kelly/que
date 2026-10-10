/**
 * LangChain Agent Graph
 *
 * Chat factory: buildAgent(rep) assembles an agent for one rep from the
 * packages they have access to: their ops as tools, plus what capability
 * retrieval (src/retrieval) adds to the prompt and tools. Packages the rep
 * can't use are never loaded. The rep is fixed when the agent is built, so
 * every tool call runs as them.
 */

import { createAgent, tool, type StructuredTool } from "langchain";
import { OperationFailed } from "@que/core";
import { SYSTEM_PROMPT } from "./prompts.js";
import { packages, type MountedPackage } from "./mount.js";
import { getConnection, getServiceIdentity, hasAccess } from "./credentials.js";
import { eager } from "./retrieval/eager.js";
import { users } from "./users.js";

const MODEL =
  process.env.MODEL ?? "fireworks:accounts/fireworks/models/deepseek-v4p1-flash";

// Model APIs only allow [a-zA-Z0-9_-] in tool names (validatePackage enforces it).
const toolName = (pkg: string, op: string) => `${pkg}_${op}`;

function opTools({ definition: pkg }: MountedPackage, rep: string): StructuredTool[] {
  return pkg.ops.map((op) =>
    tool(
      async (params) => {
        try {
          const conn = await getConnection(pkg, rep);
          return JSON.stringify(await op.run({ conn }, params));
        } catch (error) {
          if (error instanceof OperationFailed) return `Error: ${error.message}`;
          throw error;
        }
      },
      {
        name: toolName(pkg.name, op.name),
        description: `${op.title}: ${op.description}`,
        schema: op.schema,
      },
    ),
  );
}

export async function buildAgent(rep: string) {
  const access = await Promise.all(packages.map((p) => hasAccess(p.definition, rep)));
  const available = packages.filter((_, i) => access[i]);

  // Who the model is assisting, in que and in each connected service.
  const [user, catalog] = await Promise.all([
    users.get(rep).catch(() => undefined),
    Promise.all(available.map(async (pkg) => ({ pkg, identity: await getServiceIdentity(pkg.definition, rep) }))),
  ]);
  const you = user ? `## You\n\nYou're assisting ${user.name} (${user.email}).` : "";
  const retrieval = eager(catalog);

  return createAgent({
    // "provider:model" format, set via MODEL in .env
    model: MODEL,
    tools: [...available.flatMap((p) => opTools(p, rep)), ...retrieval.tools],
    systemPrompt: [SYSTEM_PROMPT, you, retrieval.prompt].filter(Boolean).join("\n\n"),
  });
}

// Served by `langgraph dev`: a factory, so the server builds the agent per run
// for that run's user (`langgraph_auth_user_id`, set by the auth hook), with
// whatever they have connected right now. Calls without a user (e.g. fetching
// the graph schema) get no packages.
export const agent = (config?: { configurable?: Record<string, unknown> }) =>
  buildAgent((config?.configurable?.langgraph_auth_user_id as string | undefined) ?? "anonymous");
