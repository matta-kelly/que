/**
 * The one check of plugins: each node a plugin's code and skills give, as a piece, linted by basis with the plugin
 * schema, as lot's lint lints them. Mount checks one plugin or a deployment's plugins with it, and says the problems
 * as the lint says them.
 */

import { lint, type Piece, type Problem } from "@mku1tra/basis";
import type { ReadPlugin } from "./read.ts";
import { plugin } from "./schema.ts";

/** A piece of a node a plugin gives: never a note's body, and of no source until the check or a lint gives it one. */
type PluginPiece = Pick<Piece, "path" | "name" | "fields">;

// A node as the piece it is: its name, and its fields, live values too.
const piece = (
  path: string,
  { name, ...fields }: { name: string } & Record<string, unknown>,
) => ({
  path,
  name,
  fields,
});

/**
 * The pieces of a plugin's nodes, each at its file, by `from`: the plugin, and each op, role and capability it holds,
 * at its definition; each case, at its cases; each skill, at its SKILL.md. Each is its node as code gives it, live
 * values too. The plugin's skills are its folders under skills/, as Agent Plugins finds them, and its cases are those
 * of its cases.ts, so its piece lists them.
 * Each node a plugin holds is at its part of the file, so two of one name are told apart: `index.ts#ops/odoo-search`.
 */
export function piecesOf(
  read: ReadPlugin,
  from: (path: string) => string = (path) => path,
): PluginPiece[] {
  const { files, definition, cases, skills, skillNames } = read;
  const at = (file: string, part?: string) =>
    part ? `${from(file)}#${part}` : from(file);
  const pieces: PluginPiece[] = skills.map(({ body, ...skill }) => {
    void body;
    return piece(from(files.skill(skill.name)), skill);
  });
  if (definition) {
    const { plugin, ops, roles, capabilities } = definition;
    pieces.push(
      piece(at(files.definition), {
        ...plugin,
        skills: skillNames,
        cases: cases.map((kase) => kase.name),
      }),
      ...ops.map((op) => piece(at(files.definition, `ops/${op.name}`), op)),
      ...roles.map((role) =>
        piece(at(files.definition, `roles/${role.name}`), role),
      ),
      ...capabilities.map((capability) =>
        piece(
          at(files.definition, `capabilities/${capability.name}`),
          capability,
        ),
      ),
    );
  }
  pieces.push(...cases.map((kase) => piece(at(files.cases, kase.name), kase)));
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
      .map((name) => ({ path: "", name, source: "plugins" })),
  ).problems;
}

/** A problem, as basis's lint says it: `<path>: <field>: <message> (<rule>)`. */
export const sayProblem = ({ path, field, message, rule }: Problem) =>
  `${path}:${field ? ` ${field}:` : ""} ${message}${rule ? ` (${rule})` : ""}`;
