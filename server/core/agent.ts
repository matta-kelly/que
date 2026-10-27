/**
 * The contract for an agent config: one way a deployment's plugins are run.
 * It has a name and the plugins the agent gets, and says the model it runs
 * on, its instructions, how it is shown the environment, and the loop it
 * runs in, and if it takes the user's own instructions. A config is a
 * file of its own, and a deployment lists it. Framework-free, as the package
 * contract is.
 */

import * as z from "zod";
import { check, fieldsOf, named, standardName, strict } from "@que/plugin";
import { types } from "./ontology.js";

export { LOADING } from "@que/ontology/harness";
export type Loading = NonNullable<AgentDefinition["loading"]>;

const fields = fieldsOf(types.agent);

/** What `defineAgent` returns, and an agent file exports as its default. `name`, `plugins`, `model` and `loop` are needed; each other field says what it is when left out. */
export const AgentDefinition = z.strictObject(
  {
    /** What a run names to get this config. */
    name: standardName,
    ...fields,
    /** The plugins it gets, by name: `[]` is none, and a config says so. */
    plugins: fields.plugins.unwrap(),
  },
  strict({
    legibility: 'the field "legibility" is now named `loading`',
    packages: 'the field "packages" is now named `plugins`',
  }),
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
