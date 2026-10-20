/**
 * The contract every deployment is written against: its name, the plugins
 * it uses, the agent configs it can run, and its loop and model configs. Framework-free, as the plugin
 * contract is.
 */

import * as z from "zod";
import {
  check,
  isText,
  must,
  name,
  named,
  onePluginList,
  strict,
  that,
} from "./check.js";

// que has no agent, loop or model of its own to fall back on.
const files = (kind: string) => {
  const none = `list at least one ${kind} config`;
  return z
    .array(that(isText, "a file path"), {
      error: must("an array", `is missing: ${none}`),
    })
    .min(1, `is empty: ${none}`);
};

/** What `defineDeployment` returns, and a deployment exports as its default. */
const plugins = z.array(that(isText, "a package name or a folder path"), {
  error: must("an array"),
});

export const DeploymentDefinition = z
  .strictObject(
    {
      name,
      /** One entry per plugin: the name of its npm package, found as Node finds an import from the deployment's own folder; or a folder path, absolute or taken from that folder. */
      plugins: plugins.optional(),
      /** @deprecated The old name of `plugins`. A deployment gives one of the two. */
      packages: plugins.optional(),
      /** One file per agent config: an absolute path, or one taken from the deployment's own folder. At least one: que has no agent of its own. */
      agents: files("agent"),
      /** One file per loop config: an absolute path, or one taken from the deployment's own folder. At least one: que has no loop of its own. */
      loops: files("loop"),
      /** One file per model config: an absolute path, or one taken from the deployment's own folder. At least one: que has no model of its own. */
      models: files("model"),
    },
    strict(
      {
        agent:
          "has an `agent` block: an agent config is a file of its own, listed in `agents`",
      },
      "no definition (default export)",
    ),
  )
  .superRefine(
    onePluginList("is missing: list the plugins it uses, or `[]` for none"),
  );

export type DeploymentDefinition = z.infer<typeof DeploymentDefinition>;

export function defineDeployment(
  definition: DeploymentDefinition,
): DeploymentDefinition {
  return definition;
}

/**
 * Check a definition against the contract, throwing one error that lists
 * every problem. Types can't catch these: a deployment is loaded at runtime.
 */
export function validateDeployment(
  def: unknown,
): asserts def is DeploymentDefinition {
  check(DeploymentDefinition, def, `deployment${named(def)} is invalid`);
}
