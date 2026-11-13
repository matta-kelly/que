import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * The import rules of the server (README, Layout). A rule either forbids the
 * paths a pattern matches, or forbids the code a selector matches.
 */
type Rule = { path: RegExp; why: string } | { code: string; why: string };

const src = "runtime/src";

/** A selector for a path, with the slashes that end it escaped. */
const matching = (path: RegExp) => `/${path.source}/`;

/** No file imports a framework of agents: que serves plugins over MCP, and runs no agent. */
const frameworks: Rule = {
  path: /^(?:langchain|deepagents|@langfuse\/langchain|@assistant-ui\/react-langgraph)(?:\/|$)|^@langchain\//,
  why: "que serves plugins over MCP and runs no agent: nothing imports LangChain, LangGraph, deepagents or their adapters.",
};

/**
 * Hold a set of files to its rules, and to `frameworks`, which every file
 * obeys. ESLint keeps only the last options a file gets for one rule, so each
 * call names every other rule its files obey.
 * A path is forbidden in `import … from`, `export … from`, `import()` and a
 * type `import()`.
 */
function hold(files: string[], rules: Rule[], ignores: string[] = []) {
  const all = [frameworks, ...rules];
  const paths = all.filter((rule) => "path" in rule);
  const code = all.filter((rule) => "code" in rule);
  return {
    files,
    ignores,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: paths.map(({ path, why }) => ({
            regex: path.source,
            caseSensitive: true,
            message: why,
          })),
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...paths.flatMap(({ path, why }) => [
          {
            selector: `ImportExpression[source.value=${matching(path)}]`,
            message: `'import()' of this path is restricted. ${why}`,
          },
          {
            selector: `TSImportType[source.value=${matching(path)}]`,
            message: `A type 'import()' of this path is restricted. ${why}`,
          },
        ]),
        ...code.map(({ code, why }) => ({ selector: code, message: why })),
      ],
    },
  };
}

const otherApp: Rule = {
  path: /^(?:\.\.\/)+ui(?:\/|$)/,
  why: "The server imports nothing from ui/: neither app imports from the other.",
};

// The runtime, in the order the work flows. A folder imports from the ones before it, never from one after.
const flow = ["mount", "access", "assemble", "mcp", "run"];

/** No import from a folder later in the flow. */
function direction(folder: string): Rule {
  const later = flow.slice(flow.indexOf(folder) + 1);
  return {
    path: new RegExp(
      `^(?:\\.\\./)+(?:${later.map((name) => `${name}/`).join("|")})`,
    ),
    why: `${folder}/ imports nothing from ${later.join("/, ")}/: an import points one way, to ${flow.join(", ")}.`,
  };
}

const credentials: Rule = {
  path: /credentials|access\/connections/,
  why: "The door does not reach for credentials: access gives it a connection.",
};
const pluginAlone: Rule = {
  path: /^(?!\.\/|@mku1tra\/basis$|ajv(?:\/|$)|zod(?:\/|$)|node:)/,
  why: "@mku1tra/que-plugin imports only its own files, basis, ajv, zod and node: the harness package and the runtime build on it, never the other way.",
};
const harnessAlone: Rule = {
  path: /^(?!\.\/|@mku1tra\/basis$|@mku1tra\/que-plugin$|zod(?:\/|$)|node:)/,
  why: "@mku1tra/que-harness imports only its own files, basis, zod, @mku1tra/que-plugin and node: the runtime builds on it, never the other way.",
};
// A test of a published package can also take the roots a lint starts at, from the server's tests: they are never
// published, and a lint starts only at a root on disk.
const testRoots = /\.\.\/\.\.\/tests\/roots\.ts$/;
const pluginTestsAlone: Rule = {
  path: new RegExp(
    pluginAlone.path.source.replace("node:)", `node:|${testRoots.source})`),
  ),
  why: "A test of @mku1tra/que-plugin imports only what the package does, and the roots for tests (tests/roots.ts).",
};
const harnessTestsAlone: Rule = {
  path: new RegExp(
    harnessAlone.path.source.replace("node:)", `node:|${testRoots.source})`),
  ),
  why: "A test of @mku1tra/que-harness imports only what the package does, and the roots for tests (tests/roots.ts).",
};
const backendAlone: Rule = {
  path: /^@que\/runtime(?:\/|$)|^(?:\.\.\/)+runtime(?:\/|$)/,
  why: "The backend imports nothing from @que/runtime: the runtime stands on it, never the other way.",
};
const runtimeAlone: Rule = {
  path: /^@que\/(?!control-plane$|credentials$|identity$|users$)|^(?:\.\.\/)+(?:plugin|harness|backend)\//,
  why: "@que/runtime imports, of que's packages, only @mku1tra/que-plugin, @mku1tra/que-harness and the backend (@que/control-plane, @que/credentials, @que/identity, @que/users), each by its name: it builds on them, and no package imports it.",
};

// One lint setup for the server: plugin, harness, backend, runtime and tests.
export default defineConfig([
  globalIgnores(["**/node_modules", "*/dist"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
  },
  tseslint.configs.recommended,
  // Code that is not used is deleted, not commented out: git keeps the history.
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { sonarjs },
    rules: { "sonarjs/no-commented-code": "error" },
  },

  // The import rules. A later entry replaces an earlier one for the files it names.
  hold(["**/*.{js,mjs,cjs,ts,mts,cts}"], [otherApp]),
  hold(["plugin/src/**/*.ts"], [pluginAlone]),
  hold(["harness/src/**/*.ts"], [harnessAlone]),
  hold(["plugin/src/**/*.test.ts"], [pluginTestsAlone]),
  hold(["harness/src/**/*.test.ts"], [harnessTestsAlone]),
  hold(["backend/**/*.ts"], [otherApp, backendAlone]),

  // The runtime, a folder at a time. Each entry holds it to its packages too. A test obeys the direction too.
  hold([`${src}/**/*.ts`], [otherApp, runtimeAlone]),
  // The last folder in the flow has none after it, so no direction holds it.
  ...flow
    .slice(0, -1)
    .map((folder) =>
      hold(
        [`${src}/${folder}/**/*.ts`],
        [otherApp, runtimeAlone, direction(folder)],
      ),
    ),
  hold(
    [`${src}/assemble/door.ts`],
    [otherApp, runtimeAlone, direction("assemble"), credentials],
  ),
]);
