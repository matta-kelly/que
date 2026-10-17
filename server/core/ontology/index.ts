/**
 * `@que/core/ontology`: que's words, as one basis package.
 * A node carries its identity and its links, and no more: its fields and their values
 * stay in the specs and the code. Each link is named after the spec field it mirrors.
 * It sits apart from `@que/core`, so code that imports the core does not load basis.
 */

import { defineLink, definePackage, defineType } from "basis";
import * as z from "zod";

// Blank text is no title, as the specs refuse it (`!value.trim()`). The value is kept as written.
const title = z.string().regex(/\S/, "text that is not blank");

const op = defineType({
  name: "op",
  description:
    "One operation a package exposes. `Operation` in package-spec.ts.",
  properties: { title },
});

const skill = defineType({
  name: "skill",
  description:
    "The text part of a package, one `SKILL.md`. `Skill` in skill-spec.ts.",
  properties: { title },
});

const capability = defineType({
  name: "capability",
  description:
    "A capability is an outcome someone wants from a system: the unit of intent, and the unit that is proven. Its meaning is owned by the capability note (capability-model/_well/capability.md); this is that meaning as code. `Capability` in package-spec.ts.",
  properties: { title },
});

const pkg = defineType({
  name: "package",
  description:
    "A set of ops, skills and capabilities. `PackageDefinition` in package-spec.ts.",
  properties: { title },
});

const kase = defineType({
  name: "case",
  description: "One behaviour of one capability. `Case` in case-spec.ts.",
  properties: {},
});

const agent = defineType({
  name: "agent",
  description:
    "One way a deployment's packages are run. `AgentDefinition` in agent-spec.ts.",
  properties: {},
});

const model = defineType({
  name: "model",
  description:
    "One model a deployment's agents can run on. `ModelDefinition` in model-spec.ts.",
  properties: {},
});

const loop = defineType({
  name: "loop",
  description:
    "One way an agent handles a chat as it grows. `LoopDefinition` in loop-spec.ts.",
  properties: {},
});

const deployment = defineType({
  name: "deployment",
  description:
    "The packages, agents, loops and models one deployment runs. `DeploymentDefinition` in deployment-spec.ts.",
  properties: {},
});

export const que = definePackage({
  name: "que",
  description:
    "que's words: the things a deployment, an agent and a package are made of.",
  types: [pkg, op, skill, capability, kase, agent, model, loop, deployment],
  links: [
    defineLink({
      name: "ops",
      description: "The ops of a package. `PackageDefinition.ops`.",
      from: pkg,
      to: op,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "skills",
      description: "The skills of a package. `PackageDefinition.skills`.",
      from: pkg,
      to: skill,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "capabilities",
      description:
        "The capabilities of a package. `PackageDefinition.capabilities`.",
      from: pkg,
      to: capability,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "capability",
      description: "The capability a case is about. `Case.capability`.",
      from: kase,
      to: capability,
      cardinality: "one",
    }),
    defineLink({
      name: "packages",
      description:
        "The packages an agent gets. Left out: every package of the deployment. `AgentDefinition.packages`.",
      from: agent,
      to: pkg,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "model",
      description: "The model an agent runs on. `AgentDefinition.model`.",
      from: agent,
      to: model,
      cardinality: "one",
      required: false,
    }),
    defineLink({
      name: "loop",
      description: "The loop an agent runs in. `AgentDefinition.loop`.",
      from: agent,
      to: loop,
      cardinality: "one",
      required: false,
    }),
    defineLink({
      name: "packages",
      description:
        "The packages a deployment uses. `DeploymentDefinition.packages`.",
      from: deployment,
      to: pkg,
      cardinality: "many",
    }),
    defineLink({
      name: "agents",
      description:
        "The agents a deployment can run. `DeploymentDefinition.agents`.",
      from: deployment,
      to: agent,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "loops",
      description:
        "The loops a deployment lists. `DeploymentDefinition.loops`.",
      from: deployment,
      to: loop,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "models",
      description:
        "The models a deployment lists. `DeploymentDefinition.models`.",
      from: deployment,
      to: model,
      cardinality: "many",
      required: false,
    }),
  ],
});
