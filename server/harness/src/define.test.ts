import { test } from "node:test";
import assert from "node:assert/strict";
import { readNode } from "./define.ts";
import { defineDeployment } from "./deployment.ts";

const landl = {
  name: "landl",
  type: "deployment" as const,
  description: "The landl deployment.",
  plugins: ["warehouse"],
};

test("defineDeployment gives the deployment as its node, marked as the definition of its name and type", () => {
  const node = defineDeployment(landl);
  assert.deepEqual(node, landl);
  const mark = Symbol.for("@mku1tra/basis/definition");
  assert.deepEqual(Object.getOwnPropertyDescriptor(node, mark)?.value, {
    name: "landl",
    type: "deployment",
  });
});

test("defineDeployment lists every fault of its node in one error, naming it", () => {
  assert.throws(
    () =>
      defineDeployment({
        ...landl,
        agents: ["chat"],
      } as unknown as typeof landl),
    (error: Error) =>
      error.message.startsWith("deployment landl is invalid:\n- ") &&
      error.message.includes("agents"),
  );
});

test("readNode reads a node by its shape, as another copy of the package makes it, and lists each fault", () => {
  assert.deepEqual(readNode("deployment", { ...landl }), {
    node: landl,
    faults: [],
  });
  assert.equal(
    readNode("deployment", { ...landl, plugins: [""] }).faults.length,
    1,
  );
});
