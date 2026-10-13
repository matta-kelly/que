import { test } from "node:test";
import assert from "node:assert/strict";
import { onDemand } from "../assemble/on-demand/index.js";
import { legibilityFor } from "./legibility.js";

test("an agent that names no legibility gets on-demand", () => {
  assert.equal(legibilityFor({ name: "chat" }), onDemand);
});
