/**
 * `@que/core/ontology`: que's words, as one basis package.
 * A node carries its identity and its links, and no more: its fields and their values
 * stay in the specs and the code. Each link is a field named after the spec field it mirrors,
 * and its comment says what it holds.
 * It sits apart from `@que/core`, so code that imports the core does not load basis.
 */

import { definePackage, defineType, many, manyOrNone, one } from "basis";
import * as z from "zod";

// Blank text is no title, as the specs refuse it (`!value.trim()`). The value is kept as written.
const title = z.string().regex(/\S/, "text that is not blank");

const op = defineType({
  name: "op",
  description:
    "One operation a package exposes. `Operation` in package-spec.ts.",
  fields: { title },
});

const skill = defineType({
  name: "skill",
  description:
    "The text part of a package, one `SKILL.md`. `Skill` in skill-spec.ts.",
  fields: { title },
});

const capability = defineType({
  name: "capability",
  description:
    "A capability is an outcome someone wants from a system: the unit of intent, and the unit that is proven. Its meaning is owned by the capability note (capability-model/_well/capability.md); this is that meaning as code. `Capability` in package-spec.ts.",
  fields: { title },
});

const pkg = defineType({
  name: "package",
  description:
    "A set of ops, skills and capabilities. `PackageDefinition` in package-spec.ts.",
  fields: {
    title,
    // The ops of a package. `PackageDefinition.ops`.
    ops: manyOrNone(() => op),
    // The skills of a package. `PackageDefinition.skills`.
    skills: manyOrNone(() => skill),
    // The capabilities of a package. `PackageDefinition.capabilities`.
    capabilities: manyOrNone(() => capability),
  },
});

const kase = defineType({
  name: "case",
  description: "One behaviour of one capability. `Case` in case-spec.ts.",
  fields: {
    // The capability a case is about. `Case.capability`.
    capability: one(() => capability),
  },
});

const model = defineType({
  name: "model",
  description:
    "One model a deployment's agents can run on. `ModelDefinition` in model-spec.ts.",
  fields: {},
});

const loop = defineType({
  name: "loop",
  description:
    "One way an agent handles a chat as it grows. `LoopDefinition` in loop-spec.ts.",
  fields: {},
});

const agent = defineType({
  name: "agent",
  description:
    "One way a deployment's packages are run. `AgentDefinition` in agent-spec.ts.",
  fields: {
    // The packages an agent gets: `[]` is none. `AgentDefinition.packages`.
    packages: manyOrNone(() => pkg),
    // The model an agent runs on. `AgentDefinition.model`.
    model: one(() => model),
    // The loop an agent runs in. `AgentDefinition.loop`.
    loop: one(() => loop),
  },
});

const deployment = defineType({
  name: "deployment",
  description:
    "The packages, agents, loops and models one deployment runs. `DeploymentDefinition` in deployment-spec.ts.",
  fields: {
    // The packages a deployment uses. `DeploymentDefinition.packages`.
    packages: many(() => pkg),
    // The agents a deployment can run: at least one, since que has no agent of its own. `DeploymentDefinition.agents`.
    agents: many(() => agent),
    // The loops a deployment lists: at least one, since que has no loop of its own. `DeploymentDefinition.loops`.
    loops: many(() => loop),
    // The models a deployment lists: at least one, since que has no model of its own. `DeploymentDefinition.models`.
    models: many(() => model),
  },
});

export const que = definePackage({
  name: "que",
  description:
    "que's words: the things a deployment, an agent and a package are made of.",
  types: {
    package: pkg,
    op,
    skill,
    capability,
    case: kase,
    agent,
    model,
    loop,
    deployment,
  },
});
