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
const src = "runtime/src";

/** A selector for a path, with the slashes that end it escaped. */
const matching = (path: RegExp) => `/${path.source}/`;

/** No file imports a framework of agents: que runs on pi. */
const frameworks: Rule = {
  path: /^(?:langchain|deepagents|@langfuse\/langchain|@assistant-ui\/react-langgraph)(?:\/|$)|^@langchain\//,
  why: "que runs on pi: nothing imports LangChain, LangGraph, deepagents or their adapters.",
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

const langfuse: Rule = {
  path: /^@langfuse\/|^@opentelemetry\//,
  why: "Only run/trace.ts names Langfuse or OpenTelemetry.",
};
// The door opens a span for each op it calls, on OpenTelemetry's API alone. run/trace.ts sends it.
const langfuseButSpanApi: Rule = {
  path: /^@langfuse\/|^@opentelemetry\/(?!api$)/,
  why: "Only run/trace.ts names Langfuse or an OpenTelemetry SDK. assemble/door.ts names its API alone, to open an op's span.",
};
const loading: Rule = {
  path: /assemble\/(on-demand|eager)/,
  why: "run/loading.ts is the one file in run that names a way of loading.",
};
const credentials: Rule = {
  path: /credentials|access\/connections/,
  why: "A way of loading does not reach for credentials.",
};
const chatModelAlone: Rule = {
  path: /^(?!\.\/|@mku1tra\/que-harness$|@earendil-works\/pi-ai(?:\/|$)|node:)/,
  why: "@que/chat-model imports only its own files, @mku1tra/que-harness, pi-ai and node: the runtime and the eval runner both import it, never the other way.",
};
const providers: Rule = {
  // pi-ai's faux provider calls no service: a test scripts a model with it.
  path: /^@earendil-works\/pi-ai\/(?:providers\/(?!faux$)|bedrock-provider$|api\/)/,
  why: "Only chat-model/ names a provider or provider API of pi-ai's.",
};
const pluginAlone: Rule = {
  path: /^(?!\.\/|@mku1tra\/basis$|ajv(?:\/|$)|zod(?:\/|$)|node:)/,
  why: "@mku1tra/que-plugin imports only its own files, basis, ajv, zod and node: the harness package and the runtime build on it, never the other way.",
};
const harnessAlone: Rule = {
  path: /^(?!\.\/|@mku1tra\/basis$|@mku1tra\/que-plugin$|@earendil-works\/pi-ai\/providers\/all$|zod(?:\/|$)|node:)/,
  why: "@mku1tra/que-harness imports only its own files, basis, zod, @mku1tra/que-plugin, pi's model catalog (catalog.ts) and node: the runtime, the model maker and the eval runner build on it, never the other way.",
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
  path: /^@que\/(?:runtime|chat-model|evals)(?:\/|$)|^(?:\.\.\/)+(?:runtime|chat-model|evals)(?:\/|$)/,
  why: "The backend imports nothing from @que/runtime, @que/chat-model or @que/evals: the runtime stands on it, never the other way.",
};
const runtimeAlone: Rule = {
  path: /^@que\/(?!chat-model$|credentials$|identity$|pi-storage$|threads$|users$)|^(?:\.\.\/)+(?:plugin|harness|chat-model|backend|evals)\//,
  why: "@que/runtime imports, of que's packages, only @mku1tra/que-plugin, @mku1tra/que-harness, @que/chat-model and the backend (@que/credentials, @que/identity, @que/pi-storage, @que/threads, @que/users), each by its name: it builds on them, and no package imports it.",
};

// A deployment's files are read by one function, readDeployment in @mku1tra/que-harness: mount imports no file and
// looks for none.
const oneReader: Rule[] = [
  {
    code: "ImportExpression",
    why: "A deployment's files are read by one function: readDeployment in @mku1tra/que-harness imports each file.",
  },
  {
    code: "Identifier[name='existsSync']",
    why: "A deployment's files are read by one function: readDeployment in @mku1tra/que-harness looks for each file.",
  },
];

const evals = "evals/src";
const evalsAlone: Rule = {
  path: /^@que\/(?!chat-model$)|^(?:\.\.\/)+(?:plugin|harness|chat-model|runtime|backend)(?:\/|$)/,
  why: "The eval runner imports, of que's packages, only @mku1tra/que-plugin, @mku1tra/que-harness and the model maker, @que/chat-model, each by its name, and nothing from the runtime or the backend.",
};
const agUiClient: Rule = {
  path: /^@ag-ui\/client$/,
  why: "Only evals/src/que.ts imports AG-UI's client, the eval runner's one door to que's server.",
};
const langfuseSdk: Rule = {
  path: /^@(?:langfuse|opentelemetry)\//,
  why: "Only evals/src/langfuse.ts imports the Langfuse SDK, or OpenTelemetry.",
};
const judgeModel: Rule = {
  path: /^@que\/chat-model$/,
  why: "Only evals/src/judge.ts imports @que/chat-model, the maker of the judge's model.",
};

// One lint setup for the server: plugin, harness, backend, chat-model, runtime, evals and tests.
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
  hold(["**/*.{js,mjs,cjs,ts,mts,cts}"], [otherApp, providers]),
  hold(["plugin/src/**/*.ts"], [pluginAlone]),
  hold(["harness/src/**/*.ts"], [harnessAlone]),
  hold(["plugin/src/**/*.test.ts"], [pluginTestsAlone]),
  hold(["harness/src/**/*.test.ts"], [harnessTestsAlone]),
  hold(["chat-model/**/*.ts"], [otherApp, chatModelAlone]),
  hold(["backend/**/*.ts"], [otherApp, providers, backendAlone]),

  // The eval runner. Its tests can use what they need.
  hold(
    [`${evals}/*.ts`],
    [otherApp, providers, evalsAlone, agUiClient, langfuseSdk, judgeModel],
    tests,
  ),
  hold(
    [`${evals}/que.ts`],
    [
      otherApp,
      providers,
      evalsAlone,
      langfuseSdk,
      judgeModel,
      mustImport(agUiClient.path, agUiClient.why),
    ],
  ),
  hold(
    [`${evals}/langfuse.ts`],
    [
      otherApp,
      providers,
      evalsAlone,
      agUiClient,
      judgeModel,
      mustImport(langfuseSdk.path, langfuseSdk.why),
    ],
  ),
  hold(
    [`${evals}/judge.ts`],
    [
      otherApp,
      providers,
      evalsAlone,
      agUiClient,
      langfuseSdk,
      mustImport(judgeModel.path, judgeModel.why),
    ],
  ),

  // The runtime, a folder at a time. Each entry holds it to its packages too.
  hold([`${src}/**/*.ts`], [otherApp, providers, runtimeAlone]),
  hold(
    [`${src}/mount/**/*.ts`],
    [otherApp, providers, runtimeAlone, direction("mount"), langfuse],
    tests,
  ),
  hold(
    [`${src}/mount/models.ts`],
    [
      otherApp,
      providers,
      runtimeAlone,
      direction("mount"),
      langfuse,
      ...oneReader,
    ],
  ),
  hold(
    [`${src}/access/**/*.ts`],
    [otherApp, providers, runtimeAlone, direction("access"), langfuse],
    tests,
  ),
  hold(
    [`${src}/assemble/**/*.ts`],
    [
      otherApp,
      providers,
      runtimeAlone,
      direction("assemble"),
      langfuse,
      credentials,
    ],
    [...tests, `${src}/assemble/fixture.ts`],
  ),
  hold(
    [`${src}/assemble/door.ts`],
    [
      otherApp,
      providers,
      runtimeAlone,
      direction("assemble"),
      langfuseButSpanApi,
      credentials,
    ],
  ),
  hold(
    [`${src}/run/*.ts`],
    [otherApp, providers, runtimeAlone, langfuse, loading],
    tests,
  ),
  hold(
    [`${src}/run/loading.ts`],
    [
      otherApp,
      providers,
      runtimeAlone,
      langfuse,
      mustImport(loading.path, loading.why),
    ],
  ),
  hold(
    [`${src}/run/trace.ts`],
    [
      otherApp,
      providers,
      runtimeAlone,
      loading,
      {
        path: /^@langfuse\/(?!otel$|tracing$)|^@opentelemetry\/(?!api$|sdk-node$)/,
        why: "run/trace.ts names four packages: @langfuse/otel, @langfuse/tracing, @opentelemetry/api and @opentelemetry/sdk-node.",
      },
      mustImport(/^@langfuse\/otel$/, langfuse.why),
      mustImport(/^@langfuse\/tracing$/, langfuse.why),
      mustImport(/^@opentelemetry\/api$/, langfuse.why),
      mustImport(/^@opentelemetry\/sdk-node$/, langfuse.why),
    ],
  ),
  // A test obeys the direction too. The one exception: it can take the fixture of assemble, which is a test file itself.
  ...["mount", "access", "assemble"].map((folder) =>
    hold(
      [`${src}/${folder}/**/*.test.ts`],
      [otherApp, providers, runtimeAlone, direction(folder, { inTest: true })],
    ),
  ),
  hold(
    [`${src}/assemble/fixture.ts`],
    [
      otherApp,
      providers,
      runtimeAlone,
      direction("assemble", { inTest: true }),
    ],
  ),
]);
