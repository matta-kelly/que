/**
 * A plugin as pieces for basis's lint: each node its code and skills give, as a piece (piecesOf), which the source of
 * plugins and the deployment's give a root's lint; and a problem, said as basis's lint says it.
 */

import type { Piece, Problem } from "@mku1tra/basis";
import type { ReadPlugin } from "./read.ts";

/** A piece of a node a plugin gives: never a note's body, and of no source until a lint gives it one. */
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

/** A problem, as basis's lint says it: `<path>: <field>: <message> (<rule>)`. */
export const sayProblem = ({ path, field, message, rule }: Problem) =>
  `${path}:${field ? ` ${field}:` : ""} ${message}${rule ? ` (${rule})` : ""}`;
