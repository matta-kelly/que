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

const tests = ["**/*.test.ts"];
const src = "harness/src";

/** A selector for a path, with the slashes that end it escaped. */
const matching = (path: RegExp) => `/${path.source}/`;

/**
 * Hold a set of files to its rules. ESLint keeps only the last options a file
 * gets for one rule, so each call names every rule its files obey.
 * A path is forbidden in `import … from`, `export … from`, `import()` and a
 * type `import()`.
 */
function hold(files: string[], rules: Rule[], ignores: string[] = []) {
  const paths = rules.filter((rule) => "path" in rule);
  const code = rules.filter((rule) => "code" in rule);
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

/** The file has to import a path: a rule that names one file as the only door is void when that file stops using it. */
const mustImport = (path: RegExp, why: string): Rule => ({
  code: `Program:not(:has(ImportDeclaration[source.value=${matching(path)}]))`,
  why,
});

const otherApp: Rule = {
  path: /^(?:\.\.\/)+ui(?:\/|$)/,
  why: "The server imports nothing from ui/: neither app imports from the other.",
};

// The harness, in the order the work flows. A folder imports from the ones before it, never from one after.
const flow = ["mount", "access", "assemble", "run"];

/** No import from a folder later in the flow. A test can also take the shared fixture of assemble. */
function direction(folder: string, { inTest = false } = {}): Rule {
  const later = flow.slice(flow.indexOf(folder) + 1);
  const paths = later.map((name) =>
    inTest && name === "assemble" ? "assemble/(?!fixture\\.js$)" : `${name}/`,
  );
  return {
    path: new RegExp(`^(?:\\.\\./)+(?:${paths.join("|")})`),
    why: `${folder}/ imports nothing from ${later.join("/, ")}/: an import points one way, to mount, access, assemble, run.`,
  };
}

const deepagents: Rule = {
  path: /^deepagents$/,
  why: "Only run/engine names deepagents.",
};
const langfuse: Rule = {
  path: /^@langfuse\/|^@opentelemetry\//,
  why: "Only run/trace.ts names Langfuse or OpenTelemetry.",
};
const loading: Rule = {
  path: /assemble\/(on-demand|eager)/,
  why: "run/loading.ts is the one file in run that names a way of loading.",
};
const credentials: Rule = {
  path: /credentials|access\/connections/,
  why: "A way of loading does not reach for credentials.",
};
const framework: Rule = {
  path: /langchain|langgraph/,
  why: "The contract imports no agent framework.",
};

// Agents, loops and models are mounted by one function, mountFiles in mount/files.ts.
const oneMount: Rule[] = [
  mustImport(
    /^\.\/files\.js$/,
    "Agents, loops and models are mounted by one function: import it from ./files.js.",
  ),
  {
    code: "ImportExpression",
    why: "Agents, loops and models are mounted by one function: mount/files.ts imports the file.",
  },
  {
    code: "Identifier[name='existsSync']",
    why: "Agents, loops and models are mounted by one function: mount/files.ts looks for the file.",
  },
];

// run/agent.ts takes its tracing from run/trace.ts, and names no part of it.
const tracing = /langfuse|CallbackHandler|callbacks/i;
const tracingWhy = "agent.ts takes its tracing from run/trace.ts.";
const tracedByTrace: Rule[] = [
  mustImport(/^\.\/trace\.js$/, tracingWhy),
  { code: `Identifier[name=/${tracing.source}/i]`, why: tracingWhy },
  { code: `Literal[value=/${tracing.source}/i]`, why: tracingWhy },
  { code: `TemplateElement[value.raw=/${tracing.source}/i]`, why: tracingWhy },
];

const evals = "evals/src";
const evalsAlone: Rule = {
  path: /harness|backend|@que\/(?!core)/,
  why: "The eval runner imports the contract, and nothing from the harness or the backend.",
};
const langGraphSdk: Rule = {
  path: /langgraph/,
  why: "Only evals/src/que.ts imports the LangGraph SDK.",
};
const langfuseSdk: Rule = {
  path: /^@(?:langfuse|opentelemetry)\//,
  why: "Only evals/src/langfuse.ts imports the Langfuse SDK, or OpenTelemetry.",
};
const judgeModel: Rule = {
  path: /^langchain$|^@langchain\/(?!langgraph)/,
  why: "Only evals/src/judge.ts imports langchain, the framework of the judge's model.",
};

// One lint setup for the server: contract, backend, harness and tests.
export default defineConfig([
  globalIgnores(["**/node_modules"]),
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
  hold(["contract/**/*.ts"], [otherApp, framework]),

  // The eval runner. Its tests can use what they need.
  hold(
    [`${evals}/*.ts`],
    [otherApp, evalsAlone, langGraphSdk, langfuseSdk, judgeModel],
    tests,
  ),
  hold(
    [`${evals}/que.ts`],
    [
      otherApp,
      evalsAlone,
      langfuseSdk,
      judgeModel,
      mustImport(langGraphSdk.path, langGraphSdk.why),
    ],
  ),
  hold(
    [`${evals}/langfuse.ts`],
    [
      otherApp,
      evalsAlone,
      langGraphSdk,
      judgeModel,
      mustImport(langfuseSdk.path, langfuseSdk.why),
    ],
  ),
  hold(
    [`${evals}/judge.ts`],
    [
      otherApp,
      evalsAlone,
      langGraphSdk,
      langfuseSdk,
      mustImport(judgeModel.path, judgeModel.why),
    ],
  ),

  // The harness, a folder at a time.
  hold(
    [`${src}/mount/**/*.ts`],
    [otherApp, direction("mount"), deepagents, langfuse],
    tests,
  ),
  hold(
    [`${src}/mount/{agents,loops,models}.ts`],
    [otherApp, direction("mount"), deepagents, langfuse, ...oneMount],
  ),
  hold(
    [`${src}/access/**/*.ts`],
    [otherApp, direction("access"), deepagents, langfuse],
    tests,
  ),
  hold(
    [`${src}/assemble/**/*.ts`],
    [otherApp, direction("assemble"), deepagents, langfuse, credentials],
    [...tests, `${src}/assemble/fixture.ts`],
  ),
  hold([`${src}/run/*.ts`], [otherApp, deepagents, langfuse, loading], tests),
  hold(
    [`${src}/run/loading.ts`],
    [otherApp, deepagents, langfuse, mustImport(loading.path, loading.why)],
  ),
  hold(
    [`${src}/run/trace.ts`],
    [
      otherApp,
      deepagents,
      loading,
      {
        path: /^@langfuse\/(?!langchain$|otel$)|^@opentelemetry\/(?!sdk-node$)/,
        why: "run/trace.ts names three packages: @langfuse/langchain, @langfuse/otel and @opentelemetry/sdk-node.",
      },
      mustImport(/^@langfuse\/langchain$/, langfuse.why),
      mustImport(/^@langfuse\/otel$/, langfuse.why),
      mustImport(/^@opentelemetry\/sdk-node$/, langfuse.why),
    ],
  ),
  hold(
    [`${src}/run/agent.ts`],
    [otherApp, deepagents, langfuse, loading, ...tracedByTrace],
  ),
  hold([`${src}/run/engine/**/*.ts`], [otherApp, langfuse], tests),
  hold(
    [`${src}/run/engine/deepagents.ts`],
    [otherApp, langfuse, mustImport(deepagents.path, deepagents.why)],
  ),

  // A test obeys the direction too. The one exception: it can take the fixture of assemble, which is a test file itself.
  ...["mount", "access", "assemble"].map((folder) =>
    hold(
      [`${src}/${folder}/**/*.test.ts`],
      [otherApp, direction(folder, { inTest: true })],
    ),
  ),
  hold(
    [`${src}/assemble/fixture.ts`],
    [otherApp, direction("assemble", { inTest: true })],
  ),
]);
