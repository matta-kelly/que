import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@/` is the UI's own folder, as tsconfig.json has it, for the code a test imports.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // The tests of a feature are beside its component; the lint's are beside its config, eslint.config.ts.
    include: [
      "components/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "eslint.config.test.ts",
    ],
  },
});
