import { test } from "node:test";
import assert from "node:assert/strict";
import { onDemand } from "../assemble/on-demand/index.js";
import { loadingFor } from "./loading.js";

test("an agent that names no loading gets on-demand", () => {
  assert.equal(loadingFor({ name: "chat" }), onDemand);
});
