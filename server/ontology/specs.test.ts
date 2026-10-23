import { test } from "node:test";
import assert from "node:assert/strict";
import { linksOf } from "@mku1tra/basis";
import type {
  AgentDefinition,
  Capability,
  Case,
  DeploymentDefinition,
  LoopDefinition,
  ModelDefinition,
  Operation,
  PluginDefinition,
  Role,
  Skill,
} from "@que/core";
import { harness, plugin } from "@que/ontology";

/** The types of both schemas, each by its name. */
const types = { ...plugin.types, ...harness.types };

/** What a spec field is in the ontology: the type or types its link points at, or null for a field that is no link. */
type Target = keyof typeof types | (keyof typeof types)[] | null;

/** Every field of a spec, and its target. */
type Fields<Spec> = Record<keyof Spec, Target>;

/**
 * Each type of the ontology, and every field of its spec with its target. A field that is no link is one every node
 * has, the title, or a value that stays in the config.
 * Each table holds each key of its spec and no other (`satisfies`), and there is a table for each type: a field
 * added to a spec, or a type added to the ontology, fails the type check until it is put here as a link or not.
 */
const specs: { [Name in keyof typeof types]: Record<string, Target> } = {
  plugin: {
    name: null,
    title: null,
    description: null,
    credential: null,
    connect: null,
    whoami: null,
    ops: "op",
    // Not in the definition: each folder under skills/ with a SKILL.md, as Agent Plugins finds them.
    skills: "skill",
    capabilities: "capability",
    roles: "access-role",
    uses: ["op", "skill"],
  } satisfies Fields<PluginDefinition & { skills: unknown }>,
  op: {
    name: null,
    title: null,
    description: null,
    schema: null,
    run: null,
    role: "access-role",
  } satisfies Fields<Operation>,
  "access-role": {
    name: null,
    description: null,
  } satisfies Fields<Role>,
  skill: {
    id: null,
    title: null,
    description: null,
    body: null,
  } satisfies Fields<Skill>,
  capability: {
    name: null,
    title: null,
    description: null,
  } satisfies Fields<Capability>,
  case: {
    name: null,
    capability: "capability",
    input: null,
    start: null,
    good: null,
  } satisfies Fields<Case>,
  agent: {
    name: null,
    plugins: "plugin",
    model: "model",
    instructions: null,
    loading: null,
    loop: "loop",
    userInstructions: null,
  } satisfies Fields<AgentDefinition>,
  model: {
    name: null,
    id: null,
    maxTokens: null,
    effort: null,
    window: null,
    price: null,
  } satisfies Fields<ModelDefinition>,
  loop: {
    name: null,
    result: null,
    summarize: null,
    args: null,
    limits: null,
  } satisfies Fields<LoopDefinition>,
  deployment: {
    name: null,
    plugins: "plugin",
    agents: "agent",
    loops: "loop",
    models: "model",
  } satisfies Fields<DeploymentDefinition>,
};

/** The fields of a spec that are links, each with its target. */
const referencesOf = (name: keyof typeof types) =>
  Object.entries(specs[name]).filter(([, target]) => target !== null);

const names = Object.keys(specs) as (keyof typeof types)[];

test("each type's links are named as its spec's reference fields", () => {
  for (const name of names)
    assert.deepEqual(
      linksOf(types[name])
        .map((link) => link.name)
        .sort(),
      referencesOf(name)
        .map(([field]) => field)
        .sort(),
      name,
    );
});

test("each link points at the type its spec field names", () => {
  for (const name of names)
    for (const link of linksOf(types[name]))
      assert.deepEqual(
        link.to().map((type) => type.name),
        [specs[name][link.name]].flat(),
        `${name}.${link.name}`,
      );
});
