/**
 * Puts one config on the shared base: the system prompt, the tools, and the
 * rule for which tools go out with each model request. Every operation is
 * registered with the agent so it can run; the config decides which ones the
 * model is shown.
 */

import {
  ToolInvocationError,
  createMiddleware,
  toolErrorMiddleware,
} from "langchain";
import { OperationFailed, type PluginDefinition } from "@que/core";
import type { Catalog } from "../access/catalog.js";
import type { Config } from "./config.js";
import { operationTools } from "./operations.js";
import { systemPrompt } from "./prompt.js";
import { skillTools } from "./skills.js";

/** The base tools and the loaded operations, out of everything registered. */
export function toolsInReach<T>(
  registered: T[],
  base: string[],
  loaded: Set<string>,
): T[] {
  return registered.filter((t) => {
    const name = (t as { name?: unknown }).name;
    // A tool without a name is a provider's own; it is not ours to hold back.
    return typeof name !== "string" || base.includes(name) || loaded.has(name);
  });
}

export function assemble(
  config: Config,
  {
    user,
    catalog,
    connect,
    instructions,
  }: {
    user?: { name: string; email: string; instructions?: string };
    catalog: Catalog;
    connect: (plugin: PluginDefinition) => Promise<unknown>;
    instructions?: string;
  },
) {
  const base = [...config.tools(catalog), ...skillTools(catalog)];
  const operations = operationTools(catalog, connect);
  const operationNames = operations.map((t) => t.name);
  // Only an operation is held back. A tool another middleware adds is not ours to hold back.
  const notOperations = (tools: unknown[]) =>
    tools.flatMap((t) => {
      const name = (t as { name?: unknown }).name;
      return typeof name === "string" && !operationNames.includes(name)
        ? [name]
        : [];
    });

  return {
    systemPrompt: systemPrompt({
      user,
      catalog,
      environment: config.prompt,
      instructions,
    }),
    tools: [...base, ...operations],
    middleware: [
      // A tool that fails throws an OperationFailed. The model reads its message, and the call is marked as failed.
      // Arguments that fail a tool's schema throw a ToolInvocationError, marked as failed too. Its message holds a stack:
      // the model reads the schema's own text, on one line.
      // Any other error is a bug, and is thrown on.
      toolErrorMiddleware({
        onError: (error) =>
          error instanceof OperationFailed
            ? `Error: ${error.message}`
            : ToolInvocationError.isInstance(error)
              ? `Error: ${error.toolError.message.replace(/\s*\n\s*/g, " ")}`
              : undefined,
      }),
      createMiddleware({
        name: "OperationsInReach",
        wrapModelCall: (request, handler) =>
          handler({
            ...request,
            tools: toolsInReach(
              request.tools,
              notOperations(request.tools),
              new Set(config.send(request.messages, operationNames)),
            ),
          }),
      }),
    ],
  };
}
