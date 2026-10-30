/**
 * The server's lint, as `npx eslint` runs it from server/ (eslint.config.ts): no file of the server imports LangChain,
 * LangGraph, deepagents or Langfuse's LangChain handler. Every file the lint reads is linted with the same text, which
 * imports each of them, at the file's own path: so a later entry of the config that holds a folder to its own rules
 * keeps the rule too.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

const server = join(import.meta.dirname, "../../..");
const eslint = new ESLint({ cwd: server });

// One import on each line, so a message's line says which import it is for.
const imports = [
  `import "langchain";`,
  `import { createAgent } from "langchain/agents";`,
  `import { AIMessage } from "@langchain/core/messages";`,
  `import type { BaseMessage } from "@langchain/core/messages";`,
  `import { StateGraph } from "@langchain/langgraph";`,
  `import { Client } from "@langchain/langgraph-sdk";`,
  `import { ChatOpenAI } from "@langchain/openai";`,
  `import { createDeepAgent } from "deepagents";`,
  `import { CallbackHandler } from "@langfuse/langchain";`,
  `import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";`,
  `export * from "@langchain/core";`,
  `void import("langchain");`,
  `void import("@langchain/langgraph");`,
  `void import("deepagents");`,
];

const restricted = new Set(["no-restricted-imports", "no-restricted-syntax"]);

/** The lines of `text` that the lint reports a restricted import on, at `path` under server/. */
const flagged = async (text: string, path: string) => {
  const [result] = await eslint.lintText(text, {
    filePath: join(server, path),
  });
  return new Set(
    result!.messages
      .filter((m) => m.severity === 2 && restricted.has(m.ruleId ?? ""))
      .map((m) => m.line),
  );
};

/** Every file the lint reads: each file of a type the config names, that it does not ignore. */
const linted = async () => {
  const files = globSync("**/*.{js,mjs,cjs,ts,mts,cts}", {
    cwd: server,
    exclude: (name) => name === "node_modules",
  });
  const read: string[] = [];
  for (const file of files)
    if (!(await eslint.isPathIgnored(join(server, file)))) read.push(file);
  return read;
};

test("the lint fails on an import of LangChain, LangGraph, deepagents or @langfuse/langchain, in every file of the server", async () => {
  const files = await linted();
  // The files of each config entry: the plugin, the harness, the backend, the model maker, each folder of the runtime,
  // the eval runner, the tests and their fixtures.
  for (const file of [
    "plugin/src/index.ts",
    "backend/pi-storage/src/storage.ts",
    "harness/src/catalog.ts",
    "chat-model/pi.ts",
    "runtime/src/mount/models.ts",
    "runtime/src/assemble/door.ts",
    "runtime/src/run/loading.ts",
    "runtime/src/run/trace.ts",
    "evals/src/que.ts",
    "evals/src/judge.ts",
    "tests/integration/mount/mount.test.ts",
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
});

test("the lint still lets pi-ai in where it did: the model maker and the runtime", async () => {
  for (const file of ["chat-model/pi.ts", "runtime/src/runner/pi/harness.ts"])
    assert.deepEqual(
      [...(await flagged(`import "@earendil-works/pi-ai";`, file))],
      [],
      `${file} imports pi-ai`,
    );
});
