import { test } from "node:test";
import assert from "node:assert/strict";
import { links } from "./report.js";

test("the links have each agent with the link to its run in Langfuse", () => {
  assert.equal(
    links(
      [
        {
          agent: "chat",
          run: "chat@abc1234 2026-10-13T07:47:11Z",
          url: "https://langfuse.example.com/project/p1/datasets/d1/runs/r1",
        },
        {
          agent: "lean",
          run: "lean@abc1234 2026-10-13T07:47:11Z",
          url: "https://langfuse.example.com/project/p1/datasets/d1/runs/r2",
        },
      ],
      "https://langfuse.example.com",
    ),
    `Langfuse
  [chat]  https://langfuse.example.com/project/p1/datasets/d1/runs/r1
  [lean]  https://langfuse.example.com/project/p1/datasets/d1/runs/r2`,
  );
});

test("a run Langfuse gave no link to is shown with its name, and where Langfuse is", () => {
  assert.equal(
    links(
      [{ agent: "chat", run: "chat@abc1234 2026-10-13T07:47:11Z" }],
      "https://langfuse.example.com",
    ),
    `Langfuse
  [chat]  chat@abc1234 2026-10-13T07:47:11Z, under Experiments at https://langfuse.example.com`,
  );
});
