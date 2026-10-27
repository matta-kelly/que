/**
 * `@mku1tra/que-plugin`: everything a plugin is, in one place. For an author, the contract (definePlugin, Op,
 * OpFailed, defineCases) and its checks (validatePlugin, validateCases). For mount and the evals, where a
 * plugin's files are, how it is read, its card, and the one check. For a lint, the plugin schema and the source of
 * plugins. It depends on ajv, and on basis and zod as peers. npm gets it built to `dist/`; inside que it resolves to
 * this source, with no build, by the `@mku1tra/que-source` condition.
 */

export * from "./card.ts";
export * from "./case.ts";
export * from "./check.ts";
export * from "./contract.ts";
export * from "./fields.ts";
export * from "./layout.ts";
export * from "./lint.ts";
export * from "./names.ts";
export * from "./read.ts";
export { plugin } from "./schema.ts";
export * from "./skill.ts";
export * from "./source.ts";
