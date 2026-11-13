import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route.ts";

// The URL the proxy forwards a request for /api/info to.
async function forwardedTo(): Promise<string> {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  await GET(new NextRequest("http://localhost:3000/api/info"));
  return String(fetch.mock.calls[0]?.[0]);
}

// The bytes the proxy gave fetch, read as a body it may be: a string, a buffer, or a stream.
async function forwardedBytes(
  init: RequestInit | undefined,
): Promise<Uint8Array> {
  const body = init?.body ?? null;
  return new Uint8Array(await new Response(body).arrayBuffer());
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

test("the proxy forwards a JSON body as it came", async () => {
  const body = JSON.stringify({ name: "Ada", avatarUrl: null });
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);

  await PATCH(
    new NextRequest("http://localhost:3000/api/que/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    }),
  );

  const [url, init] = fetch.mock.calls[0] ?? [];
  assert.equal(String(url), "http://localhost:2024/que/me");
  assert.equal(
    new Headers(init?.headers).get("content-type"),
    "application/json",
  );
  assert.equal(new TextDecoder().decode(await forwardedBytes(init)), body);
});
