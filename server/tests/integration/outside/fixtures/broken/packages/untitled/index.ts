import { definePackage } from "@que/core";

// Breaks the package contract on purpose: it has no description.
export default definePackage({
  name: "untitled",
  title: "Untitled",
} as never);
