/**
 * LangChain Agent Graph
 *
 * Chat factory: buildAgent(userId) assembles an agent for one user from the
 * packages they have access to. The agent starts with the system prompt and
 * base tools from src/legibility; an operation is sent to the model only once
 * the chat has loaded it. Packages the user can't use are never loaded. The user
 * is fixed when the agent is built, so every tool call runs as them.
 */

import { createAgent, tool, type StructuredTool } from "langchain";
import { OperationFailed } from "@que/core";
import { packages, type MountedPackage } from "./mount/packages.js";
import {
  getConnection,
  getServiceIdentity,
  hasAccess,
} from "./mount/credentials.js";
import { operationsInReach } from "./legibility/middleware.js";
import { systemPrompt } from "./legibility/system-prompt.js";
import { baseTools, toolName } from "./legibility/tools.js";
import { users } from "./users.js";

const MODEL =
  process.env.MODEL ??
  "fireworks:accounts/fireworks/models/deepseek-v4p1-flash";

function opTools(
  { definition: pkg }: MountedPackage,
  userId: string,
): StructuredTool[] {
  return pkg.ops.map((op) =>
    tool(
      async (params) => {
        try {
          const conn = await getConnection(pkg, userId);
          return JSON.stringify(await op.run({ conn }, params));
        } catch (error) {
          if (error instanceof OperationFailed)
            return `Error: ${error.message}`;
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

export async function buildAgent(userId: string) {
  const access = await Promise.all(
    packages.map((p) => hasAccess(p.definition, userId)),
  );
  const available = packages.filter((_, i) => access[i]);

  // Who the model is assisting, in que and in each connected service.
  const [user, catalog] = await Promise.all([
    users.get(userId).catch(() => undefined),
    Promise.all(
      available.map(async (pkg) => ({
        pkg,
        identity: await getServiceIdentity(pkg.definition, userId),
      })),
    ),
  ]);
  const base = baseTools(catalog);

  return createAgent({
    // "provider:model" format, set via MODEL in .env
    model: MODEL,
    // Every operation is registered so it can run; the middleware sends the
    // model only the base tools and the operations the chat has loaded.
    tools: [...base, ...available.flatMap((p) => opTools(p, userId))],
    middleware: [operationsInReach(base.map((t) => t.name))],
    systemPrompt: systemPrompt({ user, catalog }),
  });
}

// Served by `langgraph dev`: a factory, so the server builds the agent per run
// for that run's user (`langgraph_auth_user_id`, set by the auth hook), with
// whatever they have connected right now. Calls without a user (e.g. fetching
// the graph schema) get no packages.
export const agent = (config?: { configurable?: Record<string, unknown> }) =>
  buildAgent(
    (config?.configurable?.langgraph_auth_user_id as string | undefined) ??
      "anonymous",
  );
