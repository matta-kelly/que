import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig, globalIgnores } from "eslint/config";

const fromServer = /(?:^|\/)\.\.\/server(?:\/|$)|^@que\//;
const fromServerWhy =
  "The UI imports nothing from server/: neither app imports from the other.";
const frameworks =
  /^(?:langchain|deepagents|@langfuse\/langchain|@assistant-ui\/react-langgraph)(?:\/|$)|^@langchain\//;
const frameworksWhy =
  "que runs on pi: nothing imports LangChain, LangGraph, deepagents or their adapters.";

/** The `import()` and type `import()` of each path a pattern forbids. Each entry that sets no-restricted-syntax spreads them, as ESLint keeps only its last options. */
const dynamicImports = [
  [fromServer, fromServerWhy],
  [frameworks, frameworksWhy],
].flatMap(([path, why]) =>
  ["ImportExpression", "TSImportType"].map((node) => ({
    selector: `${node}[source.value=/${(path as RegExp).source}/]`,
    message: `'import()' of this path is restricted. ${why}`,
  })),
);

export default defineConfig([
  // Build output, test artifacts, and vendored shadcn primitives.
  globalIgnores([
    "**/node_modules",
    ".next",
    "test-results",
    "playwright-report",
    "components/ui",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    plugins: { js },
    extends: ["js/recommended", reactHooks.configs.flat.recommended],
    // Browser for the app, Node for the config files and the tests.
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  tseslint.configs.recommended,
  // Code that is not used is deleted, not commented out: git keeps the history.
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    plugins: { sonarjs },
    rules: { "sonarjs/no-commented-code": "error" },
  },
  // Neither app imports from the other: the UI takes nothing from server/, by path or by package name.
  // No file imports LangChain, LangGraph or their adapters. And the UI's unit tests use Vitest, not node's runner.
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:test",
              message: "UI unit tests run under Vitest: import from 'vitest'.",
            },
          ],
          patterns: [
            { regex: fromServer.source, message: fromServerWhy },
            { regex: frameworks.source, message: frameworksWhy },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...dynamicImports],
    },
  },
  // What a feature needs is in one folder: its logic and its tests are beside
  // the component that uses them, so one listing shows all of a feature. So no
  // new file in `lib/`, and no `utils/` folder. What is left in `lib/` is shared
  // by many features.
  {
    files: ["lib/**", "**/utils/**"],
    ignores: ["lib/que-api.ts", "lib/fonts.ts", "lib/utils.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...dynamicImports,
        {
          selector: "Program",
          message:
            "No new file in lib/ or utils/. Put it in the folder of the feature that uses it, beside its component.",
        },
      ],
    },
  },
]);
