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

test("the proxy forwards to que's own agent server when no LANGGRAPH_API_URL is set", async () => {
  vi.stubEnv("LANGGRAPH_API_URL", undefined);
  assert.equal(await forwardedTo(), "http://localhost:2024/info");
});

test("the proxy forwards to the server LANGGRAPH_API_URL names", async () => {
  vi.stubEnv("LANGGRAPH_API_URL", "https://agents.example.com");
  assert.equal(await forwardedTo(), "https://agents.example.com/info");
});
