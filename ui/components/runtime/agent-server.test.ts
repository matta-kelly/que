import { test } from "vitest";
import assert from "node:assert/strict";
import { agentGraph, agentServer } from "./agent-server.ts";

test("agentServer is que's own agent server when no setting names one, or the setting is blank", () => {
  assert.equal(agentServer(undefined), "http://localhost:2024");
  assert.equal(agentServer("  "), "http://localhost:2024");
});

test("agentServer is the server a setting names", () => {
  assert.equal(
    agentServer(" https://agents.example.com "),
    "https://agents.example.com",
  );
});

test("agentGraph is que's own graph when no setting names one, or the setting is blank", () => {
  assert.equal(agentGraph(undefined), "agent");
  assert.equal(agentGraph(""), "agent");
});

test("agentGraph is the graph a setting names", () => {
  assert.equal(agentGraph("other"), "other");
});
