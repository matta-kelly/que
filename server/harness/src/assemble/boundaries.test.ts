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

test("agent.ts takes only assemble, its legibility from run/legibility, its loop from run/loop, and its build from run/engine", () => {
  const agent = readFileSync(join(here, "../run/agent.ts"), "utf8");
  assert.deepEqual(
    imports(agent)
      .filter((path) => path.includes("assemble"))
      .sort(),
    ["../assemble/assemble.js"],
  );
  assert.ok(imports(agent).includes("./legibility.js"));
  assert.ok(imports(agent).includes("./loop.js"));
  assert.ok(imports(agent).includes("./engine/index.js"));
  assert.doesNotMatch(
    agent,
    /\btool\(|wrapModelCall|createMiddleware|createAgent|createDeepAgent/,
  );
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

test("only the on-demand config names its own tools", () => {
  for (const { file, text } of sources) {
    if (file.startsWith("on-demand")) continue;
    assert.doesNotMatch(text, /load_operation/, `${file} names load_operation`);
    // read_skill's description says where a skill's id is listed.
    if (file !== "skills.ts")
      assert.doesNotMatch(text, /open_package/, `${file} names open_package`);
  }
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
