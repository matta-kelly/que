import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig, globalIgnores } from "eslint/config";

const fromServer = /(?:^|\/)\.\.\/server(?:\/|$)|^@que\//;
const fromServerWhy =
  "The UI imports nothing from server/: neither app imports from the other.";

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
  // And the UI's unit tests use Vitest, not node's runner.
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
          patterns: [{ regex: fromServer.source, message: fromServerWhy }],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...["ImportExpression", "TSImportType"].map((node) => ({
          selector: `${node}[source.value=/${fromServer.source}/]`,
          message: `'import()' of this path is restricted. ${fromServerWhy}`,
        })),
      ],
    },
  },
  // Vendored from assistant-ui: memoizes by reading a ref during render, on purpose.
  {
    files: ["components/assistant-ui/elements/markdown-text.tsx"],
    rules: { "react-hooks/refs": "off" },
  },
  // What a feature needs is in one folder: its logic and its tests are beside
  // the component that uses them, so one listing shows all of a feature. So no
  // new file in `lib/`, and no `utils/` folder. What is left in `lib/` is shared
  // by many features, and `components/assistant-ui/utils/` is the library's own.
  {
    files: ["lib/**", "**/utils/**"],
    ignores: [
      "lib/que-api.ts",
      "lib/fonts.ts",
      "lib/utils.ts",
      "components/assistant-ui/utils/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "No new file in lib/ or utils/. Put it in the folder of the feature that uses it, beside its component.",
        },
      ],
    },
  },
  // `components/assistant-ui/` holds the library's files only. que's own chat code goes in `components/chat/`.
  {
    files: ["components/assistant-ui/elements/**"],
    ignores: [
      "components/assistant-ui/elements/thread.aui.tsx",
      "components/assistant-ui/elements/thread-list.aui.tsx",
      "components/assistant-ui/elements/markdown-text.tsx",
      "components/assistant-ui/elements/follow-up-suggestions.aui.tsx",
      "components/assistant-ui/elements/tooltip-icon-button.tsx",
      "components/assistant-ui/elements/surfaces.tsx",
      "components/assistant-ui/elements/thinking-indicator.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "components/assistant-ui/ holds the library's files only. que's own code goes in components/chat/.",
        },
      ],
    },
  },
]);
