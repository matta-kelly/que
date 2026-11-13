import { test } from "vitest";
import assert from "node:assert/strict";
import { queServer } from "./que-server.ts";

test("queServer is que's own server when no setting names one, or the setting is blank", () => {
  assert.equal(queServer(undefined), "http://localhost:2024");
  assert.equal(queServer("  "), "http://localhost:2024");
});

test("queServer is the server a setting names", () => {
  assert.equal(
    queServer(" https://que.example.com "),
    "https://que.example.com",
  );
});
