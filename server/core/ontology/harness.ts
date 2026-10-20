/**
 * The harness schema of que's ontology: what runs packages. An agent, the
 * model it runs on, the loop it runs in, and the deployment that lists them.
 * Its links point at the types of the plugin schema, which it imports.
 */

import { defineSchema, defineType, many, manyOrNone, one } from "basis";
import { plugin } from "./plugin.js";

const pluginType = plugin.types.plugin;

const model = defineType({
  name: "model",
  description:
    "One model a deployment's agents can run on. `ModelDefinition` in model.ts.",
  fields: {},
});

const loop = defineType({
  name: "loop",
  description:
    "One way an agent handles a chat as it grows. `LoopDefinition` in loop.ts.",
  fields: {},
});

const agent = defineType({
  name: "agent",
  description:
    "One way a deployment's packages are run. `AgentDefinition` in agent.ts.",
  fields: {
    // The packages an agent gets: `[]` is none. `AgentDefinition.packages`.
    // The spec needs the field, and a note can leave it out: basis has no link that is needed and can be empty.
    packages: manyOrNone(() => pluginType),
    // The model an agent runs on. `AgentDefinition.model`.
    model: one(() => model),
    // The loop an agent runs in. `AgentDefinition.loop`.
    loop: one(() => loop),
  },
});

const deployment = defineType({
  name: "deployment",
  description:
    "The packages, agents, loops and models one deployment runs. `DeploymentDefinition` in deployment.ts.",
  fields: {
    // The packages a deployment uses. `DeploymentDefinition.packages`.
    // The spec takes `[]`, and a note refuses it: basis has no link that is needed and can be empty.
    packages: many(() => pluginType),
    // The agents a deployment can run: at least one, since que has no agent of its own. `DeploymentDefinition.agents`.
    agents: many(() => agent),
    // The loops a deployment lists: at least one, since que has no loop of its own. `DeploymentDefinition.loops`.
    loops: many(() => loop),
    // The models a deployment lists: at least one, since que has no model of its own. `DeploymentDefinition.models`.
    models: many(() => model),
  },
});

export const harness = defineSchema({
  name: "harness",
  description:
    "What runs que's packages: a deployment, its agents, and their models and loops.",
  types: { agent, model, loop, deployment },
  imports: [plugin],
});
