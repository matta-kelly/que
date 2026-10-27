/**
 * The harness schema of que's ontology: what runs plugins. An agent, the
 * model it runs on, the loop it runs in, and the deployment that lists them.
 * Its links point at the types of the plugin schema, which it imports.
 * Each field is defined here once: a note and a definition in code are parsed with it. A deployment's definition is
 * the one exception: it lists files, and its node links the things those files define.
 */

import {
  defineSchema,
  defineType,
  many,
  manyOrNone,
  one,
} from "@mku1tra/basis";
import * as z from "zod";
import { isCount, isText, must, that } from "./fields.ts";
import { plugin } from "./plugin.ts";

const pluginType = plugin.types.plugin;

// Closed objects, whose error names a field it does not know.
const closed = <S extends z.ZodRawShape>(shape: S) =>
  z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? issue.keys.map((key) => `has no field "${key}"`).join("; ")
        : issue.code === "invalid_type"
          ? "must be an object"
          : undefined,
  });

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isShare = (value: unknown): value is number =>
  typeof value === "number" && value > 0 && value < 1;

const count = that(isCount, "a whole number above zero");
const amount = that(isAmount, "a number of zero or more");

/** What a model costs, in dollars for one million tokens. */
export const ModelPrice = closed({
  input: amount,
  output: amount,
  /** Tokens in that the provider read from its cache. Left out: they cost as `input`. */
  cachedInput: amount.optional(),
});

const model = defineType({
  name: "model",
  description:
    "One model a deployment's agents can run on. `ModelDefinition` in @que/core.",
  fields: {
    /** The provider's model, in "provider:model" form. */
    id: that(
      (id): id is string => typeof id === "string" && /^[^:\s]+:\S+$/.test(id),
      'in "provider:model" form',
    ),
    /** The most tokens the model gives in one reply. A choice: not above the window, and not the most the model can give. */
    maxTokens: count,
    /** The most tokens the model takes in. Left out: read from the provider at mount. */
    window: count.optional(),
    /** Left out: read from a model database at mount. */
    price: ModelPrice.optional(),
    /**
     * How hard the model thinks before it answers: the provider's own word for a level, sent as `reasoning_effort`.
     * Left out: none is sent, and the model thinks at its provider's default.
     */
    effort: that(
      (effort): effort is string =>
        typeof effort === "string" && /^\S+$/.test(effort),
      "one word",
    ).optional(),
  },
});

/** que's own value for each setting of a loop. */
export const LOOP_DEFAULTS = {
  result: { max: 20_000 },
  summarize: { at: 0.85, keep: 0.1 },
  args: { max: 2_000 },
  limits: { modelCalls: 50, toolCalls: 100 },
} as const;

const some = count.optional();
const share = that(isShare, "a number above zero and below one").optional();

const setting = <S extends z.ZodRawShape>(fields: z.ZodObject<S>) =>
  z
    .union([z.literal(false), fields], { error: "must be an object or false" })
    .optional();

const loop = defineType({
  name: "loop",
  description:
    "One way an agent handles a chat as it grows, and how far one run can go. `LoopDefinition` in @que/core.",
  fields: {
    /** `max`: in tokens. A tool result over it is not put in the chat whole. */
    result: setting(closed({ max: some })),
    /** `at`: the share of the model's window past which the old part of the chat is sent as a summary. `keep`: the share that is sent as it is. */
    summarize: setting(
      closed({ at: share, keep: share }).superRefine((fields, ctx) => {
        // Checked on what the loop runs with, so a part left out counts as que's own.
        const { at, keep } = { ...LOOP_DEFAULTS.summarize, ...fields };
        if (isShare(at) && isShare(keep) && keep >= at)
          ctx.addIssue({
            code: "custom",
            path: ["keep"],
            message: `must be below summarize.at, got ${keep} and ${at}`,
          });
      }),
    ),
    /** `max`: in characters. In the old part of a chat, a longer argument of a tool call is cut. */
    args: setting(closed({ max: some })),
    /** The most model calls and tool calls one run can make. */
    limits: setting(closed({ modelCalls: some, toolCalls: some })),
  },
});

/** The ways que has of loading the environment for the model: what it is shown, and when. */
export const LOADING = ["on-demand", "eager"] as const;

const agent = defineType({
  name: "agent",
  description:
    "One way a deployment's plugins are run: the plugins, the model, the loop and the instructions. `AgentDefinition` in @que/core.",
  fields: {
    /** The plugins the agent gets, out of the ones the deployment mounts. None is `[]`. */
    plugins: manyOrNone(() => pluginType),
    /** The model it runs on, one the deployment lists. A run can name another. */
    model: one(() => model),
    /** The loop it runs in, one the deployment lists. */
    loop: one(() => loop),
    /** Opens the system prompt, in place of que's own role text. Left out: que's role text. */
    instructions: that(isText, "text that is not empty").optional(),
    /** How the model is shown the environment, and when. Left out: `on-demand`. */
    loading: z
      .enum(LOADING, { error: must(`one of: ${LOADING.join(", ")}`) })
      .optional(),
    /** The agent's prompt gets the user's own instructions. One that does not say gets none. */
    userInstructions: z.boolean({ error: must("true or false") }).optional(),
  },
});

const deployment = defineType({
  name: "deployment",
  description:
    "The plugins, agents, loops and models one deployment runs. `DeploymentDefinition` in @que/core, which lists the files that define them.",
  fields: {
    plugins: many(() => pluginType),
    agents: many(() => agent),
    loops: many(() => loop),
    models: many(() => model),
  },
});

export const harness = defineSchema({
  name: "harness",
  description:
    "What runs que's plugins: a deployment, its agents, and their models and loops.",
  types: { agent, model, loop, deployment },
  imports: [plugin],
  typeNotes: new URL("./types/harness/", import.meta.url),
});
