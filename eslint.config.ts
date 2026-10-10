import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";

// One lint setup for the whole repo: agent, platform, packages, evals and ui.
export default defineConfig([
  // Build output, test artifacts, and vendored shadcn primitives.
  globalIgnores([
    "**/node_modules",
    "**/.next",
    "**/test-results",
    "**/playwright-report",
    "ui/components/ui",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
  },
  tseslint.configs.recommended,
  // The UI runs in the browser and is React.
  {
    files: ["ui/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  // Vendored from assistant-ui: memoizes by reading a ref during render, on purpose.
  {
    files: ["ui/components/assistant-ui/elements/markdown-text.tsx"],
    rules: { "react-hooks/refs": "off" },
  },
]);
