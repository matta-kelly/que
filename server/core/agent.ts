/**
 * The contract for an agent config: one way a deployment's plugins are run.
 * It has a name and the plugins the agent gets, and says the model it runs
 * on, its instructions, how it is shown the environment, and the loop it
 * runs in, and if it takes the user's own instructions. A config is a
 * file of its own, and a deployment lists it. Framework-free, as the package
 * contract is.
 */

import * as z from "zod";
import {
  check,
  isName,
  isText,
  must,
  name,
  named,
  strict,
  that,
} from "./check.js";

/** The ways que has of loading the environment for the model: what it is shown, and when. A config names one. */
export const LOADING = ["on-demand", "eager"] as const;
export type Loading = (typeof LOADING)[number];

/** What `defineAgent` returns, and an agent file exports as its default. `name`, `plugins`, `model` and `loop` are needed; each other field says what it is when left out. */
export const AgentDefinition = z.strictObject(
  {
    /** What a run names to get this config. */
    name,
    /** Names of the plugins the agent gets, out of the ones the deployment mounts. `[]` is none. */
    plugins: z.array(that(isText, "a plugin name"), {
      error: must(
        "an array",
        "is missing: list the plugins it gets, or `[]` for none",
      ),
    }),
    /** The name of a model config the deployment lists. A run can name another. */
    model: z
      .custom<string>()
      .refine((model) => typeof model !== "string" || !model.includes(":"), {
        message:
          'is written as "provider:model": a model is a file of its own, listed in `models` in the deployment, and the agent names it',
        abort: true,
      })
      .refine(isName, {
        error: must(
          "the name of a model",
          "is missing: name a model config the deployment lists",
        ),
      }),
    /** Opens the system prompt, in place of que's own role text. Left out: que's role text. */
    instructions: that(isText, "text that is not empty").optional(),
    /** How the model is shown the environment, and when. Left out: `on-demand`. */
    loading: z
      .enum(LOADING, { error: must(`one of: ${LOADING.join(", ")}`) })
      .optional(),
    /** The name of a loop config the deployment lists: how the agent's loop is run. */
    loop: that(
      isName,
      "the name of a loop",
      "is missing: name a loop config the deployment lists",
    ),
    /** The agent's prompt gets the user's own instructions. One that does not say gets none. */
    userInstructions: z.boolean({ error: must("true or false") }).optional(),
  },
  strict({ legibility: 'the field "legibility" is now named `loading`' }),
);

export type AgentDefinition = z.infer<typeof AgentDefinition>;

export function defineAgent(definition: AgentDefinition): AgentDefinition {
  return definition;
}

/**
 * Check a config against the contract, throwing one error that lists every
 * problem. Types can't catch these: a config is loaded at runtime.
 */
export function validateAgent(def: unknown): asserts def is AgentDefinition {
  check(AgentDefinition, def, `agent${named(def)} is invalid`);
}
