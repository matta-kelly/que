/**
 * The harness schema of que's ontology: what runs plugins. An agent, the model it runs on, the loop it runs in, and
 * the deployment that names them. Its links point at the types of the plugin schema, which it imports. Each type is the
 * contract: a definition in code is parsed with it (define.ts), and a note of the same name gives the prose. A link
 * that does not resolve says what to do, in que's words.
 */

import {
  defineRule,
  defineSchema,
  defineType,
  many,
  manyOrNone,
  one,
} from "@mku1tra/basis";
import {
  isCount,
  isText,
  must,
  plugin,
  strict,
  that,
} from "@mku1tra/que-plugin";
import * as z from "zod";

const pluginType = plugin.types.plugin;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isShare = (value: unknown): value is number =>
  typeof value === "number" && value > 0 && value < 1;

const count = that(isCount, "a whole number above zero");
const amount = that(isAmount, "a number of zero or more");

/** What a model costs, in dollars for one million tokens. */
const price = z.strictObject(
  {
    input: amount,
    output: amount,
    /** Tokens in that the provider read from its cache. Left out: they cost as `input`. */
    cachedInput: amount.optional(),
  },
  strict(),
);

const model = defineType({
  name: "model",
  description:
    "One model a deployment's agents can run on. `Model` in @mku1tra/que-harness.",
  fields: {
    /** The provider's model, in "provider:model" form. */
    id: that(
      (id): id is string => typeof id === "string" && /^[^:\s]+:\S+$/.test(id),
      'in "provider:model" form',
    ),
    /** The most tokens the model gives in one reply. A choice: not above the window, and not the most the model can give. */
    maxTokens: count,
    /**
     * The most tokens the model takes in: a run sizes a loop's shares by it. A fact, in one place: the model catalog
     * gives it (catalog.ts) for a model it has an entry for, and the model's file, or its note, for one it has not.
     */
    window: count,
    /** A fact, in one place, as `window` is. Left out: what the model costs is not known, and no cost is shown. */
    price: price.optional(),
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
    "One way an agent handles a chat as it grows, and how far one run can go. `Loop` in @mku1tra/que-harness.",
  fields: {
    /** `max`: in tokens. A tool result over it is not put in the chat whole. */
    result: setting(z.strictObject({ max: some }, strict())),
    /**
     * `at`: the share of the model's window past which the old part of the chat is sent as a summary. `keep`: the share
     * that is sent as it is. Agents on one model id must summarize alike: pi sets compaction per model id, so mount
     * stops on two that would be summarized differently, by their loops here or by the windows of two model entries of
     * that id. Give one of them a model with another id, or make them summarize alike.
     */
    summarize: setting(
      z
        .strictObject({ at: share, keep: share }, strict())
        .superRefine((fields, ctx) => {
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
    args: setting(z.strictObject({ max: some }, strict())),
    /** The most model calls and tool calls one run can make. */
    limits: setting(
      z.strictObject({ modelCalls: some, toolCalls: some }, strict()),
    ),
  },
});

/** The ways que has of loading the environment for the model: what it is shown, and when. */
export const LOADING = ["on-demand", "eager"] as const;

/** A link's own message, as basis's link kinds take it. */
type LinkMessage = NonNullable<
  NonNullable<Parameters<typeof one>[1]>["message"]
>;

// What a link to a thing the deployment does not give says: the folder a thing of that kind is found in.
const found =
  (kind: string, folder: string): LinkMessage =>
  (failure) =>
    failure.kind === "not-a-node"
      ? `names the ${kind} ${failure.target}, which no file in the deployment's ${folder}/ gives`
      : undefined;

const agent = defineType({
  name: "agent",
  description:
    "One way a deployment's plugins are run: the plugins, the model, the loop and the instructions. `Agent` in @mku1tra/que-harness.",
  fields: {
    /** The plugins the agent gets, out of the ones the deployment mounts. Left out or `[]`: none. */
    plugins: manyOrNone(() => pluginType, {
      message: (failure) =>
        failure.kind === "not-a-node"
          ? `names the plugin ${failure.target}, which the deployment does not mount`
          : undefined,
    }),
    /** The model it runs on, one the deployment names. A run can name another. */
    model: one(() => model, { message: found("model", "models") }),
    /** The loop it runs in, one the deployment names. */
    loop: one(() => loop, { message: found("loop", "loops") }),
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

// What a deployment that names none of a kind says: que has no agent, loop or model of its own to fall back on.
const atLeastOne =
  (kind: string, folder: string): LinkMessage =>
  (failure, graph) =>
    failure.kind === "missing"
      ? `is missing: name at least one ${kind}, given by a file in ${folder}/`
      : found(kind, folder)(failure, graph);

const deployment = defineType({
  name: "deployment",
  description:
    "The plugins, agents, loops and models one deployment runs, each by its name. `Deployment` in @mku1tra/que-harness.",
  fields: {
    /** Each by its name, the name of its npm package, found as Node finds an import from the deployment's folder. */
    plugins: manyOrNone(() => pluginType),
    /** The first is the one a run gets when it names none. */
    agents: many(() => agent, { message: atLeastOne("agent", "agents") }),
    loops: many(() => loop, { message: atLeastOne("loop", "loops") }),
    models: many(() => model, { message: atLeastOne("model", "models") }),
  },
});

/** A model gives no more in one reply than it takes in. */
export const maxTokensInWindow = defineRule({
  name: "max-tokens-in-window",
  description: "A model's maxTokens is not above its window.",
  on: model,
  check: ({ maxTokens, window }) =>
    isCount(window) && isCount(maxTokens) && maxTokens > window
      ? [
          {
            field: "/maxTokens",
            message: `must not be above its window, got ${maxTokens} and ${window}`,
          },
        ]
      : [],
});

/**
 * Each agent a deployment names runs with what the deployment names: its plugins, its model and its loop. One that is
 * no node, basis/link says, so each fault is said once. It holds in any graph, the deployment's own or one with more.
 */
export const named = defineRule({
  name: "named",
  description:
    "Each agent a deployment names gets plugins, a model and a loop the deployment names.",
  on: deployment,
  check: (node, graph) =>
    node.agents.flatMap((name, i) => {
      const found = graph.get(name, agent);
      if (!found) return [];
      const field = `/agents/${i}`;
      const plugins = node.plugins ?? [];
      const unnamed = (found.plugins ?? []).filter(
        (plugin) => !plugins.includes(plugin) && graph.get(plugin, pluginType),
      );
      return [
        ...(unnamed.length
          ? [
              {
                field,
                message: `the agent ${name} names plugins the deployment does not name: ${unnamed.join(", ")}`,
              },
            ]
          : []),
        ...(
          [
            ["model", node.models, model],
            ["loop", node.loops, loop],
          ] as const
        ).flatMap(([kind, listed, type]) =>
          listed.includes(found[kind]) || !graph.get(found[kind], type)
            ? []
            : [
                {
                  field,
                  message: `the agent ${name} names the ${kind} ${found[kind]}, which the deployment does not name. ${kind === "loop" ? "Loops" : "Models"}: ${listed.join(", ")}`,
                },
              ],
        ),
      ];
    }),
});

export const harness = defineSchema({
  name: "harness",
  description:
    "What runs que's plugins: a deployment, its agents, and their models and loops.",
  types: { agent, model, loop, deployment },
  imports: [plugin],
  typeNotes: new URL("../types/harness/", import.meta.url),
  // What the package exports, for basis/one-definition: each zod object in it is part of a type.
  exports: () => import("./index.ts"),
  rules: [maxTokensInWindow, named],
});
