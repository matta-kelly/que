import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@/` is the UI's own folder, as tsconfig.json has it, for the code a test imports.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["components/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
  },
});
