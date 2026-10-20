import { definePlugin } from "@que/core";

// Breaks the package contract on purpose: it has no description.
export default definePlugin({
  name: "untitled",
  title: "Untitled",
} as never);
