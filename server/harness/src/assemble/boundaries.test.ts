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

test("agent.ts takes only assemble, and its legibility from run/legibility", () => {
  const agent = readFileSync(join(here, "../run/agent.ts"), "utf8");
  assert.deepEqual(
    imports(agent)
      .filter((path) => path.includes("assemble"))
      .sort(),
    ["../assemble/assemble.js"],
  );
  assert.ok(imports(agent).includes("./legibility.js"));
  assert.doesNotMatch(agent, /\btool\(|wrapModelCall|createMiddleware/);
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
