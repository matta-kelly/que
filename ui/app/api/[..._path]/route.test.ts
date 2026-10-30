import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route.ts";

// The URL the proxy forwards a request for /api/info to.
async function forwardedTo(): Promise<string> {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  await GET(new NextRequest("http://localhost:3000/api/info"));
  return String(fetch.mock.calls[0]?.[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("the proxy forwards to que's own server when no QUE_URL is set", async () => {
  vi.stubEnv("QUE_URL", undefined);
  vi.stubEnv("LANGGRAPH_API_URL", undefined);
  assert.equal(await forwardedTo(), "http://localhost:2024/info");
});

test("the proxy forwards to the server QUE_URL names", async () => {
  vi.stubEnv("QUE_URL", "https://que.example.com");
  assert.equal(await forwardedTo(), "https://que.example.com/info");
  vi.stubEnv("QUE_URL", " https://other.example.com ");
  assert.equal(await forwardedTo(), "https://other.example.com/info");
});

test("the proxy reads no LANGGRAPH_API_URL: with no QUE_URL, it is que's own server", async () => {
  vi.stubEnv("QUE_URL", undefined);
  vi.stubEnv("LANGGRAPH_API_URL", "https://agents.example.com");
  assert.equal(await forwardedTo(), "http://localhost:2024/info");
});
