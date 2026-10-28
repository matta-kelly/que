/**
 * A model config: one model a deployment's agents can run on. A node of the model type, in a file of its own in the
 * deployment's models/. The file holds the choices: a name, the provider's own name for the model, and how much it may
 * give in one reply. What is true of the model (how much it takes in, and what it costs) is a fact: the file can write
 * one, and what it leaves out is filled in when the deployment is mounted. Framework-free, as the plugin contract is.
 */

import { defineNode, type NodeOf } from "./define.ts";

/** What `defineModel` returns, and a model file exports as its default. */
export type Model = NodeOf<"model">;

/** What a model costs, in dollars for one million tokens. */
export type ModelPrice = NonNullable<Model["price"]>;

/** What is true of a model, as a source outside the file gives it. */
export type ModelFacts = Pick<Model, "window" | "price">;

/** A model with every field: what a deployment's models are once mounted. */
export type MountedModel = Model & {
  window: number;
  price: ModelPrice;
};

export const defineModel = defineNode("model");

/** The provider of a model: the part of its id before the first colon. */
export const providerOf = (model: Pick<Model, "id">) =>
  model.id.slice(0, model.id.indexOf(":"));

/** The provider's own name for a model: the part of its id after the first colon. */
export const providerModelOf = (model: Pick<Model, "id">) =>
  model.id.slice(model.id.indexOf(":") + 1);
