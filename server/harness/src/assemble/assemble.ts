/**
 * Puts one config on the shared base: the system prompt, the tools, and the
 * rule for which tools go out with each model request. Every operation is
 * registered with the agent so it can run; the config decides which ones the
 * model is shown.
 */

import { createMiddleware } from "langchain";
import type { PackageDefinition } from "@que/core";
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
  }: {
    user?: { name: string; email: string };
    catalog: Catalog;
    connect: (pkg: PackageDefinition) => Promise<unknown>;
  },
) {
  const base = [...config.tools(catalog), ...skillTools(catalog)];
  const operations = operationTools(catalog, connect);
  const baseNames = base.map((t) => t.name);
  const operationNames = operations.map((t) => t.name);

  return {
    systemPrompt: systemPrompt({ user, catalog, environment: config.prompt }),
    tools: [...base, ...operations],
    middleware: [
      createMiddleware({
        name: "OperationsInReach",
        wrapModelCall: (request, handler) =>
          handler({
            ...request,
            tools: toolsInReach(
              request.tools,
              baseNames,
              new Set(config.send(request.messages, operationNames)),
            ),
          }),
      }),
    ],
  };
}
