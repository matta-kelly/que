import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;

/** The source files of the runner, not its tests. */
const sources = readdirSync(here)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ file: f, text: readFileSync(join(here, f), "utf8") }));

const imports = (text: string) =>
  [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

test("evals imports nothing from the harness or the backend", () => {
  for (const { file, text } of sources)
    assert.ok(
      !imports(text).some((path) =>
        /harness|backend|@que\/(?!core)/.test(path),
      ),
      `${file} imports from the harness or the backend`,
    );
});

test("only que.ts imports the LangGraph SDK", () => {
  assert.deepEqual(
    sources
      .filter(({ text }) =>
        imports(text).some((path) => path.includes("langgraph")),
      )
      .map(({ file }) => file),
    ["que.ts"],
  );
});

test("only langfuse.ts imports the Langfuse SDK, or OpenTelemetry", () => {
  assert.deepEqual(
    sources
      .filter(({ text }) =>
        imports(text).some((path) => /^@(langfuse|opentelemetry)\//.test(path)),
      )
      .map(({ file }) => file),
    ["langfuse.ts"],
  );
});
