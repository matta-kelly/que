/**
 * `@mku1tra/que-harness`: what runs que's plugins. `harness`, the harness schema of que's ontology (schema.ts): the
 * deployment, which imports the plugin schema of `@mku1tra/que-plugin`. Its type is the contract: a deployment is its
 * node (defineDeployment). Where a deployment's files are, how it is read (readDeployment), the source that gives its
 * graph to its root's lint, the schema of a deployment's own root, and the graph of the root that holds a deployment.
 * Its type notes are in `types/harness/`. Its imports end in `.ts`, so Node loads it with no build.
 */

export * from "./deployment.ts";
export * from "./read.ts";
export * from "./root.ts";
export * from "./source.ts";
export { readNode, type NodeOf } from "./define.ts";
export { harness } from "./schema.ts";
