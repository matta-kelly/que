import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;

/** The source files in this folder, not the tests or their fixture. */
const sources = readdirSync(here, { recursive: true, encoding: "utf8" })
  .filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fixture.ts",
  )
  .map((f) => ({ file: f, text: readFileSync(join(here, f), "utf8") }));

const imports = (text: string) =>
  [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

test("agents, loops and models are mounted by one function", () => {
  const mount = join(here, "../mount");
  for (const file of ["agents.ts", "loops.ts", "models.ts"]) {
    const text = readFileSync(join(mount, file), "utf8");
    assert.ok(imports(text).includes("./files.js"), `${file} uses files.ts`);
    assert.doesNotMatch(
      text,
      /existsSync|await import\(/,
      `${file} reads a file`,
    );
  }
});

test("only run/engine names deepagents", () => {
  const harness = join(here, "..");
  const files = readdirSync(harness, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) => !f.startsWith(join("run", "engine")));
  for (const file of files)
    assert.ok(
      !imports(readFileSync(join(harness, file), "utf8")).includes(
        "deepagents",
      ),
      `${file} imports deepagents`,
    );
  assert.ok(
    imports(
      readFileSync(join(harness, "run/engine/deepagents.ts"), "utf8"),
    ).includes("deepagents"),
  );
});

test("only run/trace.ts names Langfuse", () => {
  const harness = join(here, "..");
  const names = (file: string) =>
    imports(readFileSync(join(harness, file), "utf8")).filter((path) =>
      /^@langfuse\/|^@opentelemetry\//.test(path),
    );
  const files = readdirSync(harness, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) => f !== join("run", "trace.ts"));
  for (const file of files)
    assert.deepEqual(names(file), [], `${file} names Langfuse`);
  assert.deepEqual(names("run/trace.ts").sort(), [
    "@langfuse/langchain",
    "@langfuse/otel",
    "@opentelemetry/sdk-node",
  ]);
});

test("agent.ts takes its tracing from run/trace", () => {
  const agent = readFileSync(join(here, "../run/agent.ts"), "utf8");
  assert.ok(imports(agent).includes("./trace.js"));
  assert.doesNotMatch(agent, /langfuse|CallbackHandler|callbacks/i);
});

test("run/legibility.ts is the one file in run that names a legibility", () => {
  const run = join(here, "../run");
  const naming = readdirSync(run)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) =>
      imports(readFileSync(join(run, f), "utf8")).some((path) =>
        path.includes("assemble/on-demand"),
      ),
    );
  assert.deepEqual(naming, ["legibility.ts"]);
});

test("legibility does not reach for credentials", () => {
  for (const { file, text } of sources)
    assert.ok(
      !imports(text).some((path) =>
        /credentials|access\/connections/.test(path),
      ),
      `${file} imports credentials`,
    );
});

test("the contract imports no framework", () => {
  const contract = join(here, "../../../contract");
  for (const file of readdirSync(contract).filter((f) => f.endsWith(".ts")))
    assert.ok(
      !imports(readFileSync(join(contract, file), "utf8")).some((path) =>
        /langchain|langgraph/.test(path),
      ),
      `${file} imports a framework`,
    );
});
