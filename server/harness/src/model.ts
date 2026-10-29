/**
 * A model config: one model a deployment's agents can run on. A node of the model type, in a file of its own in the
 * deployment's models/. The file holds the choices: a name, the provider's own name for the model, and how much it may
 * give in one reply. What is true of the model (how much it takes in, and what it costs) is a fact, and each fact has
 * one place: the model catalog (catalog.ts) for a model it has an entry for, and the model's file, or its note, for one
 * it has not. A model needs a window: a run sizes a loop's shares by it. Its price can be left out. Framework-free, as
 * the plugin contract is.
 */

import { defineNode, type NodeOf, type PieceOf } from "./define.ts";

/** A model, as a deployment's graph gives it: its file's choices, and its facts from the one place that gives them. */
export type Model = NodeOf<"model">;

/** What a model costs, in dollars for one million tokens. */
export type ModelPrice = NonNullable<Model["price"]>;

/**
 * A model as its file gives it, and what a model file exports as its default: the choices, and a window and a price
 * only for a model the model catalog has no entry for.
 */
export const defineModel: (definition: PieceOf<"model">) => PieceOf<"model"> =
  defineNode("model");

/** The provider of a model: the part of its id before the first colon. */
export const providerOf = (model: Pick<Model, "id">) =>
  model.id.slice(0, model.id.indexOf(":"));

/** The provider's own name for a model: the part of its id after the first colon. */
export const providerModelOf = (model: Pick<Model, "id">) =>
  model.id.slice(model.id.indexOf(":") + 1);
