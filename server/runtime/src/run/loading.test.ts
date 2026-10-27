import { test } from "node:test";
import assert from "node:assert/strict";
import { eager } from "../assemble/eager/index.js";
import { onDemand } from "../assemble/on-demand/index.js";
import { loadingFor } from "./loading.js";

test("an agent that names no loading gets on-demand", () => {
  assert.equal(
    loadingFor({
      name: "chat",
      plugins: [],
      model: "small",
      loop: "long-chat",
    }),
    onDemand,
  );
});

test("an agent that names eager gets eager", () => {
  assert.equal(
    loadingFor({
      name: "chat",
      plugins: [],
      model: "small",
      loop: "long-chat",
      loading: "eager",
    }),
    eager,
  );
});
