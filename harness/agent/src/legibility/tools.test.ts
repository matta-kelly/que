import { test } from "node:test";
import assert from "node:assert/strict";
import { baseTools, toolName } from "./tools.js";
import {
  besideNothing,
  catalog,
  identityOnly,
  mixed,
  skillsOnly,
} from "./fixture.js";

const call = (name: string, args: Record<string, unknown>) =>
  baseTools(catalog)
    .find((t) => t.name === name)!
    .invoke(args) as Promise<string>;

test("the base tools are open_package, load_operation and read_skill", () => {
  assert.deepEqual(
    baseTools(catalog).map((t) => t.name),
    ["open_package", "load_operation", "read_skill"],
  );
});

test("there are no base tools when the user has no packages", () => {
  assert.deepEqual(baseTools([]), []);
});

test("read_skill is left out when no package has a skill", () => {
  const noSkills = [{ ...catalog[0], pkg: { ...catalog[0].pkg, skills: [] } }];
  assert.deepEqual(
    baseTools(noSkills).map((t) => t.name),
    ["open_package", "load_operation"],
  );
});

test("open_package lists each operation and skill with one line, and no arguments", async () => {
  const text = await call("open_package", { package: "shop" });
  assert.match(
    text,
    /findOrders: Find orders\. Search orders by customer name\./,
  );
  assert.match(text, /getOrder: Get order\. One order with its lines\./);
  assert.match(text, /shop\/refunds: Refunds\. How to refund an order\./);
  assert.doesNotMatch(text, /Returns at most 20/);
  assert.doesNotMatch(text, /Customer name/);
});

test("open_package names the packages that exist when asked for one that does not", async () => {
  const text = await call("open_package", { package: "nope" });
  assert.match(text, /^Error: /);
  assert.match(text, /shop/);
});

test("load_operation says which tool the operation became", async () => {
  const text = await call("load_operation", {
    package: "shop",
    operation: "findOrders",
  });
  assert.doesNotMatch(text, /^Error: /);
  assert.ok(text.includes(toolName("shop", "findOrders")));
});

test("load_operation names the operations that exist when asked for one that does not", async () => {
  const text = await call("load_operation", {
    package: "shop",
    operation: "nope",
  });
  assert.match(text, /^Error: /);
  assert.match(text, /findOrders/);
});

test("read_skill returns the skill's text", async () => {
  assert.equal(
    await call("read_skill", { id: "shop/refunds" }),
    "Refund steps.",
  );
});

test("open_package shows no Operations heading for a package with no operations", async () => {
  const text = (await baseTools(skillsOnly)
    .find((t) => t.name === "open_package")!
    .invoke({ package: "shop" })) as string;
  assert.doesNotMatch(text, /Operations/);
  assert.match(text, /shop\/refunds: Refunds\. How to refund an order\./);
});

test("load_operation is left out when no package has an operation", () => {
  assert.deepEqual(
    baseTools(skillsOnly).map((t) => t.name),
    ["open_package", "read_skill"],
  );
});

test("open_package's description for a package with operations is word for word what it was", () => {
  assert.equal(
    baseTools(catalog)[0].description,
    "Open Package: lists what a package holds, its operations and skills, with one line each. Use it to find the operation for a task. It does not make an operation callable; load_operation does.",
  );
});

test("open_package's description names no operation when no package has one", () => {
  assert.equal(
    baseTools(skillsOnly)[0].description,
    "Open Package: lists what a package holds, with one line each.",
  );
});

test("load_operation stays when one package of several has an operation", () => {
  assert.deepEqual(
    baseTools(mixed).map((t) => t.name),
    ["open_package", "load_operation", "read_skill"],
  );
});

test("load_operation says so when the package has no operations", async () => {
  const text = (await baseTools(mixed)
    .find((t) => t.name === "load_operation")!
    .invoke({ package: "notes", operation: "findNotes" })) as string;
  assert.equal(text, 'Error: package "notes" has no operations.');
});

test("there are no base tools when no package holds an operation or a skill", () => {
  assert.deepEqual(baseTools(identityOnly), []);
});

test("open_package shows no Operations heading for a package with no operations, beside one that has them", async () => {
  const text = (await baseTools(mixed)
    .find((t) => t.name === "open_package")!
    .invoke({ package: "notes" })) as string;
  assert.doesNotMatch(text, /Operations/);
  assert.match(text, /notes\/meetings: Meetings\. How to write up a meeting\./);
});

test("open_package's description is word for word what it was when one package of several has an operation", () => {
  assert.equal(
    baseTools(mixed)[0].description,
    "Open Package: lists what a package holds, its operations and skills, with one line each. Use it to find the operation for a task. It does not make an operation callable; load_operation does.",
  );
});

test("every base tool stays when a package that holds nothing sits beside one with operations and a skill", () => {
  assert.deepEqual(
    baseTools(besideNothing).map((t) => t.name),
    ["open_package", "load_operation", "read_skill"],
  );
});
