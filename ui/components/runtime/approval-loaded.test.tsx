// @vitest-environment jsdom
/**
 * A chat loaded while its run waits for a yes: its interrupts come from que's server, and the cards show at their
 * calls as they do live. With two waiting calls, answering one card sends nothing until the other is answered, and
 * then one resume carries both answers.
 */
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

const thread = (id: string) => ({
  id,
  createdAt: "2026-10-30T00:00:00.000Z",
  stopped: false,
  title: null,
  archived: false,
  agent: null,
  model: null,
});

type Call = { method: string; url: string; body: string };

/** que's server, stubbed: the thread, its messages and waiting interrupts, and the run its resume posts. */
function queServer({
  messages,
  interrupts,
}: {
  messages: unknown[];
  interrupts: unknown[];
}) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url,
      body: typeof init?.body === "string" ? init.body : "",
    });
    if (url === "/api/que/deployment")
      return Response.json({
        agents: [{ name: "zoe", model: "big" }],
        models: [{ name: "big", window: 1000, maxTokens: 100 }],
      });
    if (url === "/api/threads" && method === "GET")
      return Response.json([thread("T1")]);
    if (url === "/api/threads/T1" && method === "GET")
      return Response.json({
        ...thread("T1"),
        messages,
        running: false,
        interrupts,
      });
    if (url === "/api/threads/T1/files") return Response.json([]);
    if (url === "/api/threads/T1/runs")
      return new Response(
        [
          `data: ${JSON.stringify({ type: "RUN_STARTED", threadId: "T1", runId: "r1" })}`,
          "",
          `data: ${JSON.stringify({ type: "RUN_FINISHED", threadId: "T1", runId: "r1" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    return Response.json(
      { error: `${method} ${url} has no stub` },
      { status: 404 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  return {
    calls,
    posts: () =>
      calls.filter(
        ({ method, url }) => method === "POST" && /\/runs$/.test(url),
      ),
  };
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

/** The app is loaded on the waiting thread. */
async function loadThread(aui: () => ReturnType<typeof useAui>) {
  await screen.findByRole("textbox", { name: "Message input" });
  await act(async () => aui().threads().switchToThread("T1"));
  await waitFor(() =>
    assert.equal(aui().threadListItem().getState().remoteId, "T1"),
  );
}

const cards = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="tool-approval"]'),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("given a chat loaded while its run waits for a yes, then the card shows at the call with the question and the args", async () => {
  const interrupt = {
    id: "i1",
    reason: "tool_call",
    toolCallId: "c1",
    message: "Void: run till-void with the hat?",
  };
  const server = queServer({
    messages: [
      { id: "u1", role: "user", content: "Void the hat." },
      {
        id: "a1",
        role: "assistant",
        content: [
          { type: "text", text: "Voiding. " },
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "till-void",
            args: { item: "hat" },
            argsText: '{"item":"hat"}',
          },
        ],
      },
    ],
    interrupts: [interrupt],
  });
  const aui = renderApp();
  await loadThread(aui);

  await screen.findByText(interrupt.message);
  assert.ok(
    screen.getByText(/"item": "hat"/),
    "the loaded card did not show the call's args",
  );
  assert.ok(
    screen.getByRole("button", { name: "Approve" }),
    "the loaded card offered no Approve",
  );
  assert.ok(
    screen.getByRole("button", { name: "Deny" }),
    "the loaded card offered no Deny",
  );
  assert.ok(
    server.calls.some(
      ({ method, url }) => method === "GET" && url === "/api/threads/T1",
    ),
    "the card did not come from the loaded thread",
  );
});

test("given two calls waiting in one loaded reply, when one is answered, then nothing is sent until the other is answered, and one resume carries both answers", async () => {
  const interrupts = [
    {
      id: "i1",
      reason: "tool_call",
      toolCallId: "c1",
      message: "Void: run till-void with the hat?",
    },
    {
      id: "i2",
      reason: "tool_call",
      toolCallId: "c2",
      message: "Void: run till-void with the coat?",
    },
  ];
  const server = queServer({
    messages: [
      { id: "u1", role: "user", content: "Void the hat and the coat." },
      {
        id: "a1",
        role: "assistant",
        content: [
          { type: "text", text: "Voiding both. " },
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "till-void",
            args: { item: "hat" },
            argsText: '{"item":"hat"}',
          },
          {
            type: "tool-call",
            toolCallId: "c2",
            toolName: "till-void",
            args: { item: "coat" },
            argsText: '{"item":"coat"}',
          },
        ],
      },
    ],
    interrupts,
  });
  const aui = renderApp();
  await loadThread(aui);

  await waitFor(() =>
    assert.equal(
      cards().length,
      2,
      "the loaded reply did not show a card for each waiting call",
    ),
  );

  await act(async () => {
    within(cards()[0]!).getByRole("button", { name: "Approve" }).click();
  });
  await new Promise((waited) => setTimeout(waited, 300));
  assert.equal(
    server.posts().length,
    0,
    "answering one card sent a resume before the other was answered",
  );

  const unanswered = () =>
    cards().find((card) =>
      within(card).queryByRole("button", { name: "Approve" }),
    );
  await act(async () => {
    within(unanswered()!).getByRole("button", { name: "Approve" }).click();
  });
  await waitFor(() =>
    assert.equal(
      server.posts().length,
      1,
      "the batch sent no resume after both cards were answered",
    ),
  );
  const body = JSON.parse(server.posts()[0]!.body) as { resume?: unknown[] };
  assert.equal(body.resume?.length, 2, "the resume did not carry both answers");
});
