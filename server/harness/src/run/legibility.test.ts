import { test } from "node:test";
import assert from "node:assert/strict";
import { onDemand } from "../assemble/on-demand/index.js";
import { legibilityFor } from "./legibility.js";

test("an agent that names no legibility gets on-demand", () => {
  assert.equal(legibilityFor({ name: "chat" }), onDemand);
});

test("an agent that names on-demand gets it", () => {
  assert.equal(
    legibilityFor({ name: "chat", legibility: "on-demand" }),
    onDemand,
  );
});
