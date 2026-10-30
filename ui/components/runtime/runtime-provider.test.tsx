// @vitest-environment jsdom
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useAui } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { RuntimeProvider } from "@/components/runtime/runtime-provider";

// jsdom has no layout: the composer's size observer has nothing to observe.
class NoLayout implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayout;

// jsdom's File has no stream a multipart Response can read: the body it builds
// never ends. Read the file's bytes as the web stream the platform expects.
Object.defineProperty(File.prototype, "stream", {
  configurable: true,
  value(this: File) {
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        controller.enqueue(new Uint8Array(await this.arrayBuffer()));
        controller.close();
      },
    });
  },
});

/** A thread of que's server, as its API gives one. */
const thread = (id: string) => ({
  id,
  createdAt: "2026-10-30T00:00:00.000Z",
  stopped: false,
  title: null,
  archived: false,
  agent: null,
  model: null,
});

/** A file of que's server, as an upload answers and a list gives one. */
const file = (id: string, name: string) => ({
  id,
  name,
  mimeType: "text/csv",
  size: 21,
});

/** A run of a thread that starts and ends at once, as que's server streams one. */
const runStream = (threadId: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ type: "RUN_STARTED", threadId, runId: "r1" })}`,
      "",
      `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId, runId: "r1" })}`,
      "",
    ].join("\n"),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

type Call = { method: string; url: string; init?: RequestInit };

/**
 * que's server, stubbed: the deployment, the threads it lists, the files it
 * holds, and the run a sent message starts. Every request is kept, so a test
 * sees the one the app made.
 */
function queServer({
  threads,
  files = {},
}: {
  threads: ReturnType<typeof thread>[];
  files?: Record<string, ReturnType<typeof file>[]>;
}) {
  const calls: Call[] = [];
  const uploads: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, init });

    if (url === "/api/que/deployment") {
      return Response.json({
        agents: [{ name: "zoe", model: "big" }],
        models: [{ name: "big", window: 1000, maxTokens: 100 }],
      });
    }
    if (url === "/api/threads" && method === "GET") {
      return Response.json(threads);
    }
    if (url === "/api/threads" && method === "POST") {
      return Response.json(thread("T9"), { status: 201 });
    }
    const filesOf = url.match(/^\/api\/threads\/([^/]+)\/files$/);
    if (filesOf) {
      const id = decodeURIComponent(filesOf[1]!);
      if (method === "POST") {
        uploads.push({ url, init: init! });
        return Response.json(file("f1", "order.csv"), { status: 201 });
      }
      return Response.json(files[id] ?? []);
    }
    const runsOf = url.match(/^\/api\/threads\/([^/]+)\/runs$/);
    if (runsOf) return runStream(decodeURIComponent(runsOf[1]!));
    const one = url.match(/^\/api\/threads\/([^/]+)$/);
    if (one && method === "GET") {
      return Response.json({
        ...thread(decodeURIComponent(one[1]!)),
        messages: [],
        running: false,
      });
    }
    return Response.json(
      { error: `${method} ${url} has no stub` },
      { status: 404 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  return { calls, uploads };
}

/** The app's chat runtime, as the app makes it: the provider, and the thread it holds. */
function renderApp() {
  let aui: ReturnType<typeof useAui> | undefined;
  const Capture = () => {
    aui = useAui();
    return null;
  };
  render(
    <RuntimeProvider>
      <Thread autoFocus={false} />
      <Capture />
    </RuntimeProvider>,
  );
  return () => {
    if (!aui) throw new Error("the app did not render its runtime");
    return aui;
  };
}

/** The app is up: its composer is on the page. */
async function appReady() {
  await screen.findByRole("textbox", { name: "Message input" });
}

const fileOf = (name: string, text: string, type: string) =>
  new File([text], name, { type });

/** The body the app's composer sent the upload, read as the bytes que's server receives. */
async function bodyOf(init: RequestInit): Promise<string> {
  return new Response(init.body).text();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the app's thread shows its own files, and a file added in its composer uploads to it when the message is sent", async () => {
  // A new chat has no thread on que's server, so it has no files to show.
  queServer({ threads: [] });
  renderApp();
  await appReady();
  assert.equal(
    screen.queryByRole("list", { name: "Files in this thread" }),
    null,
    "a new chat, with no thread on que's server, showed a file list",
  );
  cleanup();

  const server = queServer({
    threads: [thread("T1")],
    files: { T1: [file("f2", "prices.pdf")] },
  });
  const aui = renderApp();
  await appReady();
  await act(async () => aui().threads().switchToThread("T1"));
  await waitFor(() =>
    assert.equal(aui().threadListItem().getState().remoteId, "T1"),
  );
  await waitFor(() =>
    assert.ok(
      screen.queryByRole("list", { name: "Files in this thread" }),
      "the thread with a remote id showed no file list",
    ),
  );
  const list = screen.getByRole("list", { name: "Files in this thread" });
  assert.ok(within(list).getByText("prices.pdf"));
  assert.deepEqual(
    server.calls
      .filter(({ url }) => url.endsWith("/files"))
      .map(({ method, url }) => `${method} ${url}`),
    ["GET /api/threads/T1/files"],
  );

  let refused: unknown;
  await act(async () => {
    try {
      await aui()
        .thread()
        .composer()
        .addAttachment(
          fileOf("order.csv", "region,amount\nwest,42\n", "text/csv"),
        );
      aui().thread().composer().send();
    } catch (error) {
      refused = error;
    }
  });
  await waitFor(() =>
    assert.equal(
      server.uploads.length,
      1,
      `the app's composer uploaded no file: ${String(refused)}`,
    ),
  );

  const [upload] = server.uploads;
  assert.equal(upload?.url, "/api/threads/T1/files");
  assert.equal(upload?.init.method, "POST");
  assert.match(
    new Headers(upload?.init.headers).get("content-type") ?? "",
    /^multipart\/form-data; boundary=.+/,
  );
  const body = await bodyOf(upload!.init);
  assert.ok(body.includes("order.csv"), `the upload carries no name: ${body}`);
  assert.ok(
    body.includes("region,amount\nwest,42\n"),
    `the upload carries no bytes: ${body}`,
  );
});

test("a file added in a new chat uploads to the thread the send makes", async () => {
  const server = queServer({ threads: [] });
  const aui = renderApp();
  await appReady();
  assert.equal(aui().threadListItem().getState().remoteId, undefined);

  let refused: unknown;
  await act(async () => {
    try {
      await aui()
        .thread()
        .composer()
        .addAttachment(
          fileOf("prices.csv", "item,price\nbook,9\n", "text/csv"),
        );
      aui().thread().composer().send();
    } catch (error) {
      refused = error;
    }
  });
  await waitFor(() =>
    assert.equal(
      server.uploads.length,
      1,
      `the app's composer uploaded no file: ${String(refused)}`,
    ),
  );

  assert.deepEqual(
    server.calls
      .filter(
        ({ method, url }) =>
          method === "POST" &&
          (url === "/api/threads" || url.endsWith("/files")),
      )
      .map(({ method, url }) => `${method} ${url}`),
    ["POST /api/threads", "POST /api/threads/T9/files"],
  );
  const body = await bodyOf(server.uploads[0]!.init);
  assert.ok(body.includes("prices.csv"), `the upload carries no name: ${body}`);
});
