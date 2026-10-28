/**
 * The one check of plugins: their cards and skills as pieces of nodes, linted by basis with the plugin schema, as
 * lot's lint lints them. `validatePlugin` checks one definition, mount one plugin or a deployment's plugins, and each
 * says the problems as the lint says them.
 */

import { lint, type Piece, type Problem } from "@mku1tra/basis";
import { cardOf, type Card } from "./card.ts";
import { faults, named, refuse } from "./check.ts";
import { Plugin } from "./contract.ts";
import { pluginFiles } from "./layout.ts";
import { NAMESPACE, nameIn } from "./names.ts";
import { plugin } from "./schema.ts";
import type { Skill } from "./skill.ts";

/** A piece of a node a plugin gives: never a note's body, and of no source until the check or a lint gives it one. */
type PluginPiece = Pick<Piece, "path" | "name" | "fields">;

/**
 * The pieces of a plugin's nodes, from its card and its skills, each at its file in `dir`: the plugin, its ops, roles,
 * capabilities and cases, each at its part of the card, and its skills. The one way a plugin becomes nodes: the source gives them to the lint, and
 * the check lints them.
 */
export function piecesOf(
  card: Card,
  skills: readonly Skill[],
  dir: string,
): PluginPiece[] {
  const name = card.name;
  const part = card.extensions[NAMESPACE];
  const files = pluginFiles(dir);
  const pieces: PluginPiece[] = skills.map((skill) => ({
    path: files.skill(skill.id.slice(name.length + 1)),
    name: skill.id,
    fields: {
      type: "skill",
      description: skill.description,
      title: skill.title,
    },
  }));
  // Each at the part of the card that gives it, so two of one name in one card are told apart: `plugin.json#ops/find`.
  const piece = (of: string, fields: Record<string, unknown>, part?: string) =>
    pieces.push({
      path: part ? `${files.card}#${part}` : files.card,
      name: of,
      fields,
    });
  piece(name, {
    type: "plugin",
    description: card.description,
    title: part.title,
    ...(part.credential === undefined ? {} : { credential: part.credential }),
    ops: part.ops.map((op) => nameIn(name, op.name)),
    skills: skills.map((skill) => skill.id),
    capabilities: part.capabilities.map((c) => c.name),
    roles: part.roles.map((role) => nameIn(name, role.name)),
    usesOps: part.uses.ops,
    usesSkills: part.uses.skills,
    cases: part.cases.map((c) => c.name),
  });
  for (const op of part.ops)
    piece(
      nameIn(name, op.name),
      {
        type: "op",
        description: op.description,
        title: op.title,
        ...(op.role === undefined ? {} : { role: nameIn(name, op.role) }),
        input: op.input,
      },
      `ops/${op.name}`,
    );
  for (const role of part.roles)
    piece(
      nameIn(name, role.name),
      {
        type: "access-role",
        description: role.description,
      },
      `roles/${role.name}`,
    );
  for (const { name: capability, ...fields } of part.capabilities)
    piece(
      capability,
      { type: "capability", ...fields },
      `capabilities/${capability}`,
    );
  for (const { name: kase, ...fields } of part.cases)
    piece(kase, { type: "case", ...fields }, `cases/${kase}`);
  return pieces;
}

/**
 * What is wrong with plugins' pieces, by the plugin schema, as one graph. Each name in `unread` that no piece gives is
 * there and not read, so a link to it is no problem: what one plugin uses, checked without the plugins that give it.
 * The pieces are of one source, so two of one name are two things.
 */
export function checkPlugins(
  pieces: readonly PluginPiece[],
  unread: readonly string[] = [],
): Problem[] {
  const given = new Set(pieces.map((piece) => piece.name));
  return lint(
    plugin,
    pieces.map((piece) => ({ ...piece, source: "plugins" })),
    unread
      .filter((name) => !given.has(name))
      .map((name) => ({ path: "", name })),
  ).problems;
}

/** A problem, as basis's lint says it: `<path>: <field>: <message> (<rule>)`. */
export const sayProblem = ({ path, field, message, rule }: Problem) =>
  `${path}:${field ? ` ${field}:` : ""} ${message}${rule ? ` (${rule})` : ""}`;

// What the plugin schema finds wrong with a definition that keeps the contract: its card's pieces, checked alone. An op
// schema with no JSON Schema form has no card, and is a fault of its own.
function ruleFaults(definition: Plugin): string[] {
  let card: Card;
  try {
    card = cardOf({ definition, cases: [] });
  } catch (error) {
    return [(error as Error).message];
  }
  return checkPlugins(piecesOf(card, [], ""), [
    ...definition.uses.ops,
    ...definition.uses.skills,
  ]).map(sayProblem);
}

/**
 * Check a definition against the contract and the plugin schema, throwing one error that lists every problem. Types
 * can't catch these: a plugin is loaded at runtime, and names, titles and descriptions are what the model reads. The
 * schema's rules read a definition that keeps the contract. It is checked alone, with no skills or cases: what it
 * uses is another plugin's, which a deployment gives.
 */
export function validatePlugin(def: Plugin | undefined): asserts def is Plugin {
  const contract = faults(Plugin, def);
  refuse(
    `plugin${named(def)} is invalid`,
    contract.length ? contract : ruleFaults(def as Plugin),
  );
}
