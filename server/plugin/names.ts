/** The names que gives: of a thing in a plugin, and of its own namespace. */

/**
 * The name of a thing a plugin holds under its own name: an op, a role or a skill is named in its plugin, and is the
 * node `<plugin>-<name>` in the graph, so each one is unique. The same name is an op's tool name, and what a domain's
 * `uses` names. A capability and a case are named once for the whole graph, and keep their names.
 */
export const nameIn = (plugin: string, name: string) => `${plugin}-${name}`;

/** que's namespace, a reverse-domain name: the folder of que's files in a plugin, and its key in a card's `extensions`. */
export const NAMESPACE = "io.github.matta-kelly.que";
