import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig, globalIgnores } from "eslint/config";

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
  // Vendored from assistant-ui: memoizes by reading a ref during render, on purpose.
  {
    files: ["components/assistant-ui/elements/markdown-text.tsx"],
    rules: { "react-hooks/refs": "off" },
  },
]);
