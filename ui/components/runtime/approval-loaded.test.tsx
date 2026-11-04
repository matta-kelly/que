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
  fireEvent,
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

/** The decisions a waiting call allows: the default three, or the ones the op names. */
const DEFAULT = ["approve", "edit", "reject"];

/**
 * The interrupt que's server sends for a waiting call: its call, the description, LangChain's schema with one branch
 * per allowed decision, and the metadata the card reads its decisions from.
 */
function waiting({
  id,
  item,
  prompt,
  decisions = DEFAULT,
}: {
  id: string;
  item: string;
  prompt: string;
  decisions?: string[];
}) {
  return {
    id: `i-${id}`,
    reason: "tool_call",
    toolCallId: id,
    message: prompt,
    responseSchema: {
      oneOf: decisions.map((type) => ({
        required: [
          "type",
          ...(type === "edit"
            ? ["edited_action"]
            : type === "respond"
              ? ["message"]
              : []),
        ],
        properties: {
          type: { const: type },
          ...(type === "edit"
            ? {
                edited_action: {
                  required: ["name", "args"],
                  properties: {
                    name: { const: "till-void" },
                    args: { type: "object" },
                  },
                },
              }
            : {}),
          ...(type === "respond" || type === "reject"
            ? { message: { type: "string" } }
            : {}),
        },
      })),
    },
    metadata: {
      plugin: "till",
      op: "till-void",
      input: { item },
      decisions,
    },
  };
}

/** A chat's card, by the item its call is about. */
const cardFor = (item: string) => {
  const found = cards().find((card) => card.textContent?.includes(item));
  assert.ok(found, `no card was shown for the ${item}`);
  return found;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("given a chat loaded while its run waits for a yes, then the card shows at the call with the question and the args", async () => {
  const interrupt = waiting({
    id: "c1",
    item: "hat",
    prompt: "Void: run till-void with the hat?",
  });
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
    screen.queryByRole("button", { name: "Approve" }),
    "the loaded card offered no Approve",
  );
  assert.ok(
    screen.queryByRole("button", { name: "Reject" }),
    "the loaded card offered no Reject",
  );
  assert.ok(
    screen.queryByRole("button", { name: "Edit" }),
    "the loaded card offered no Edit",
  );
  assert.equal(
    screen.queryByRole("button", { name: "Respond" }),
    null,
    "the loaded card offered a Respond the op does not allow",
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
    waiting({
      id: "c1",
      item: "hat",
      prompt: "Void: run till-void with the hat?",
    }),
    waiting({
      id: "c2",
      item: "coat",
      prompt: "Void: run till-void with the coat?",
    }),
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
    within(cardFor("hat")).getByRole("button", { name: "Approve" }).click();
  });
  await new Promise((waited) => setTimeout(waited, 300));
  assert.equal(
    server.posts().length,
    0,
    "answering one card sent a resume before the other was answered",
  );
  // The first card holds its answer, and the second still asks.
  assert.ok(
    within(cardFor("hat")).queryByText("Approved"),
    "the answered card did not hold its answer",
  );
  assert.ok(
    within(cardFor("coat")).queryByRole("button", { name: "Approve" }),
    "the unanswered card lost its answers",
  );

  await act(async () => {
    within(cardFor("coat")).getByRole("button", { name: "Reject" }).click();
  });
  fireEvent.change(
    within(cardFor("coat")).getByPlaceholderText("Why reject? (optional)"),
    { target: { value: "The coat stays." } },
  );
  await act(async () => {
    within(cardFor("coat"))
      .getByRole("button", { name: "Send reject" })
      .click();
  });
  await waitFor(() =>
    assert.equal(
      server.posts().length,
      1,
      "the batch sent no resume after both cards were answered",
    ),
  );
  const body = JSON.parse(server.posts()[0]!.body) as {
    resume?: { interruptId: string; status: string; payload?: unknown }[];
  };
  assert.deepEqual(body.resume, [
    {
      interruptId: "i-c1",
      status: "resolved",
      payload: { type: "approve" },
    },
    {
      interruptId: "i-c2",
      status: "resolved",
      payload: { type: "reject", message: "The coat stays." },
    },
  ]);
});

/** The user message a loaded card sits after. */
function userAsked(item: string) {
  return {
    id: "u1",
    role: "user",
    content: `Void the ${item}.`,
  };
}

const waitingCall = (item: string) => ({
  id: "a1",
  role: "assistant",
  content: [
    { type: "text", text: "Working. " },
    {
      type: "tool-call",
      toolCallId: "c1",
      toolName: "till-void",
      args: { item },
      argsText: JSON.stringify({ item }),
    },
  ],
});

test("given a loaded card whose op allows respond, when Respond gets a message, then one resume carries it as a respond and the op does not run", async () => {
  const interrupt = waiting({
    id: "c1",
    item: "hat",
    prompt: "Note: what should the till hold about the hat?",
    decisions: ["approve", "reject", "respond"],
  });
  const server = queServer({
    messages: [userAsked("hat"), waitingCall("hat")],
    interrupts: [interrupt],
  });
  const aui = renderApp();
  await loadThread(aui);
  await screen.findByText(interrupt.message);

  const card = cardFor("hat");
  assert.equal(
    within(card).queryByRole("button", { name: "Edit" }),
    null,
    "the card offered an Edit the op does not allow",
  );
  assert.ok(
    within(card).queryByRole("button", { name: "Respond" }),
    "the card did not offer the Respond its op allows",
  );
  await act(async () => {
    within(card).getByRole("button", { name: "Respond" }).click();
  });
  assert.ok(
    within(card).queryByPlaceholderText("Your response"),
    "Respond did not ask for a message",
  );
  fireEvent.change(within(card).getByPlaceholderText("Your response"), {
    target: { value: "The sale is cancelled." },
  });
  assert.ok(
    within(card).queryByRole("button", { name: "Send response" }),
    "Respond had no way to send its message",
  );
  await act(async () => {
    within(card).getByRole("button", { name: "Send response" }).click();
  });
  await waitFor(() =>
    assert.equal(
      server.posts().length,
      1,
      "Respond sent no resume after its message",
    ),
  );
  const body = JSON.parse(server.posts()[0]!.body) as { resume?: unknown[] };
  assert.deepEqual(body.resume, [
    {
      interruptId: "i-c1",
      status: "resolved",
      payload: { type: "respond", message: "The sale is cancelled." },
    },
  ]);
});

test("given a loaded card, when Edit gets JSON that does not parse, then it sends nothing, and when the JSON parses, then it sends the edited action", async () => {
  const interrupt = waiting({
    id: "c1",
    item: "hat",
    prompt: "Void: run till-void with the hat?",
  });
  const server = queServer({
    messages: [userAsked("hat"), waitingCall("hat")],
    interrupts: [interrupt],
  });
  const aui = renderApp();
  await loadThread(aui);
  await screen.findByText(interrupt.message);

  const card = cardFor("hat");
  assert.ok(
    within(card).queryByRole("button", { name: "Edit" }),
    "the card did not offer the Edit its op allows",
  );
  await act(async () => {
    within(card).getByRole("button", { name: "Edit" }).click();
  });
  assert.ok(
    within(card).queryByPlaceholderText("The args as JSON"),
    "Edit did not show the call's args to change",
  );
  const editor = within(card).getByPlaceholderText("The args as JSON");
  assert.match(
    (editor as HTMLTextAreaElement).value,
    /"item":\s*"hat"/,
    "the edit did not start from the call's args",
  );

  assert.ok(
    within(card).queryByRole("button", { name: "Send edit" }),
    "Edit had no way to send the args",
  );
  fireEvent.change(editor, { target: { value: "{" } });
  await act(async () => {
    within(card).getByRole("button", { name: "Send edit" }).click();
  });
  await new Promise((waited) => setTimeout(waited, 300));
  assert.equal(
    server.posts().length,
    0,
    "an edit whose JSON does not parse sent a resume",
  );

  fireEvent.change(editor, { target: { value: '{"item":"coat"}' } });
  await act(async () => {
    within(card).getByRole("button", { name: "Send edit" }).click();
  });
  await waitFor(() =>
    assert.equal(
      server.posts().length,
      1,
      "an edit whose JSON parses sent no resume",
    ),
  );
  const body = JSON.parse(server.posts()[0]!.body) as { resume?: unknown[] };
  assert.deepEqual(body.resume, [
    {
      interruptId: "i-c1",
      status: "resolved",
      payload: {
        type: "edit",
        edited_action: { name: "till-void", args: { item: "coat" } },
      },
    },
  ]);
});

test("given a loaded card, when Reject is sent with no message, then its payload is a reject alone", async () => {
  const interrupt = waiting({
    id: "c1",
    item: "hat",
    prompt: "Void: run till-void with the hat?",
  });
  const server = queServer({
    messages: [userAsked("hat"), waitingCall("hat")],
    interrupts: [interrupt],
  });
  const aui = renderApp();
  await loadThread(aui);
  await screen.findByText(interrupt.message);

  const card = cardFor("hat");
  assert.ok(
    within(card).queryByRole("button", { name: "Reject" }),
    "the card did not offer the Reject its op allows",
  );
  await act(async () => {
    within(card).getByRole("button", { name: "Reject" }).click();
  });
  assert.ok(
    within(card).queryByRole("button", { name: "Send reject" }),
    "Reject had no way to send without a message",
  );
  await act(async () => {
    within(card).getByRole("button", { name: "Send reject" }).click();
  });
  await waitFor(() =>
    assert.equal(
      server.posts().length,
      1,
      "a reject with no message sent no resume",
    ),
  );
  const body = JSON.parse(server.posts()[0]!.body) as { resume?: unknown[] };
  assert.deepEqual(body.resume, [
    { interruptId: "i-c1", status: "resolved", payload: { type: "reject" } },
  ]);
});
