import { test } from "vitest";
import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

// The UI's lint, as `npx eslint` runs it from ui/ (eslint.config.ts): no file of the UI imports LangChain, LangGraph,
// deepagents or Langfuse's LangChain handler. Every file the lint reads is linted with the same text, which imports
// each of them, at the file's own path.

const ui = import.meta.dirname;
const eslint = new ESLint({ cwd: ui });

// One import on each line, so a message's line says which import it is for.
const imports = [
  `import "langchain";`,
  `import { createAgent } from "langchain/agents";`,
  `import { AIMessage } from "@langchain/core/messages";`,
  `import type { BaseMessage } from "@langchain/core/messages";`,
  `import { Client } from "@langchain/langgraph-sdk";`,
  `import { createDeepAgent } from "deepagents";`,
  `import { CallbackHandler } from "@langfuse/langchain";`,
  `import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";`,
  `export * from "@assistant-ui/react-langgraph";`,
  `void import("@langchain/langgraph-sdk");`,
  `void import("@assistant-ui/react-langgraph");`,
];

const restricted = new Set(["no-restricted-imports", "no-restricted-syntax"]);

/** The lines of `text` that the lint reports a restricted import on, at `path` under ui/. */
const flagged = async (text: string, path: string) => {
  const [result] = await eslint.lintText(text, { filePath: join(ui, path) });
  return new Set(
    result!.messages
      .filter((m) => m.severity === 2 && restricted.has(m.ruleId ?? ""))
      .map((m) => m.line),
  );
};

// Folders the lint does not read, and that only a build or a test run makes.
const made = new Set([
  "node_modules",
  ".next",
  "test-results",
  "playwright-report",
]);

/** Every file the lint reads: each file of a type the config names, that it does not ignore. */
const linted = async () => {
  const files = globSync("**/*.{js,mjs,cjs,ts,mts,cts,tsx}", {
    cwd: ui,
    exclude: (name) => made.has(name),
  });
  const read: string[] = [];
  for (const file of files)
    if (!(await eslint.isPathIgnored(join(ui, file)))) read.push(file);
  return read;
};

test("the lint fails on an import of LangChain, LangGraph, deepagents, @langfuse/langchain or @assistant-ui/react-langgraph, in every file of the UI", async () => {
  const files = await linted();
  for (const file of [
    "components/runtime/runtime-provider.tsx",
    "components/assistant-ui/elements/thread.aui.tsx",
    "lib/que-api.ts",
    "app/layout.tsx",
    "tests/e2e/chat.spec.ts",
    "next.config.ts",
  ])
    assert.ok(files.includes(file), `the lint reads ${file}`);

  const text = imports.join("\n");
  // For each import, the files the lint lets it in: the first few of them, and how many.
  const passed: Record<string, { files: number; first: string[] }> = {};
  for (const file of files) {
    const lines = await flagged(text, file);
    imports.forEach((line, i) => {
      if (lines.has(i + 1)) return;
      const entry = (passed[line] ??= { files: 0, first: [] });
      entry.files++;
      if (entry.first.length < 3) entry.first.push(file);
    });
  }
  assert.deepEqual(passed, {});
}, 60_000);

test("the lint still lets assistant-ui and AG-UI in", async () => {
  const text = [
    `import { useThread } from "@assistant-ui/react";`,
    `import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";`,
    `import { HttpAgent } from "@ag-ui/client";`,
  ].join("\n");
  assert.deepEqual(
    [...(await flagged(text, "components/runtime/runtime-provider.tsx"))],
    [],
  );
});
