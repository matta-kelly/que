import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "./route.ts";

// The URL the proxy forwards a request for /api/info to.
async function forwardedTo(): Promise<string> {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  await GET(new NextRequest("http://localhost:3000/api/info"));
  return String(fetch.mock.calls[0]?.[0]);
}

// The bytes the proxy gave fetch, read as a body it may be: a string, a stream, or a form.
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

test("the proxy forwards a multipart body with the boundary and the bytes it was given", async () => {
  const boundary = "----que7f3a1c";
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="shot.png"\r\nContent-Type: image/png\r\n\r\n`,
  );
  // A PNG's own bytes, including the ones no text decoding keeps.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x80]);
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, png, tail]);
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("uploaded", { status: 201 }),
  );
  vi.stubGlobal("fetch", fetch);

  const res = await POST(
    new NextRequest("http://localhost:3000/api/threads/T1/files", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    }),
  );

  const [url, init] = fetch.mock.calls[0] ?? [];
  assert.equal(String(url), "http://localhost:2024/threads/T1/files");
  assert.equal(
    new Headers(init?.headers).get("content-type"),
    `multipart/form-data; boundary=${boundary}`,
  );
  assert.deepEqual(await forwardedBytes(init), new Uint8Array(body));
  assert.equal(res.status, 201);
});

test("the proxy forwards a JSON body as it came", async () => {
  const body = JSON.stringify({ title: "an order", archived: false });
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);

  await POST(
    new NextRequest("http://localhost:3000/api/threads/T1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );

  const [, init] = fetch.mock.calls[0] ?? [];
  assert.equal(
    new Headers(init?.headers).get("content-type"),
    "application/json",
  );
  assert.equal(new TextDecoder().decode(await forwardedBytes(init)), body);
});

test("the proxy gives a run's SSE response as it came", async () => {
  const frames = [
    'event: RUN_STARTED\ndata: {"type":"RUN_STARTED","threadId":"T1","runId":"r1"}\n\n',
    'event: RUN_FINISHED\ndata: {"type":"RUN_FINISHED","threadId":"T1","runId":"r1"}\n\n',
  ].join("");
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(frames, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  );
  vi.stubGlobal("fetch", fetch);

  const res = await POST(
    new NextRequest("http://localhost:3000/api/threads/T1/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: "{}",
    }),
  );

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.equal(await res.text(), frames);
});
