import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";
import { toAgUiMessages, type AgUiMessage } from "@assistant-ui/react-ag-ui";
import {
  queAttachments,
  type ChatThread,
} from "@/components/chat/attachment/attachment-adapter";
import { threadListAdapter } from "@/components/runtime/thread-list-adapter";

// What an attachment says in the message: its text parts, as one text.
const textOf = (attachment: CompleteAttachment): string =>
  attachment.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

// What a run's message carries: its content, read as the text a server reads.
const contentText = (content: string | readonly { type: string }[]): string =>
  typeof content === "string"
    ? content
    : content
        .flatMap((part) => ("text" in part ? [String(part.text)] : []))
        .join("\n");

// The attachment the adapter added, from an adapter that adds it in one step.
async function add(
  adapter: AttachmentAdapter,
  file: File,
): Promise<PendingAttachment> {
  const pending = await adapter.add({ file });
  if (Symbol.asyncIterator in pending) {
    throw new Error("add gave a stream of states, not the attachment");
  }
  return pending;
}

// The body the adapter gave fetch, read as the bytes que's server receives.
async function bodyBytes(init: RequestInit | undefined): Promise<Uint8Array> {
  const body = init?.body ?? null;
  return new Uint8Array(await new Response(body).arrayBuffer());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("a chosen file is uploaded when the message is sent, and the message names it and its id", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(
      { id: "f1", name: "order.csv", mimeType: "text/csv", size: 21 },
      { status: 201 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const thread: ChatThread = {
    remoteId: () => "T1",
    initialize: async () => ({ remoteId: "T1" }),
  };
  const adapter = queAttachments(thread);

  const chosen = await add(
    adapter,
    new File(["region,amount\nwest,42\n"], "order.csv", { type: "text/csv" }),
  );
  assert.equal(fetch.mock.calls.length, 0);

  const sent = await adapter.send(chosen);

  const [url, init] = fetch.mock.calls[0] ?? [];
  assert.equal(String(url), "/api/threads/T1/files");
  assert.equal(init?.method, "POST");
  assert.match(
    new Headers(init?.headers).get("content-type") ?? "",
    /^multipart\/form-data; boundary=.+/,
  );
  const body = new TextDecoder().decode(await bodyBytes(init));
  assert.ok(body.includes("order.csv"));
  assert.ok(body.includes("region,amount\nwest,42\n"));
  assert.equal(sent.id, "f1");
  assert.ok(textOf(sent).includes("order.csv"));
  assert.ok(textOf(sent).includes("f1"));
});

test("a message with an attached file gives the run the file's name and id as its text", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(
      { id: "f2", name: "prices.pdf", mimeType: "application/pdf", size: 4 },
      { status: 201 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const thread: ChatThread = {
    remoteId: () => "T1",
    initialize: async () => ({ remoteId: "T1" }),
  };
  const adapter = queAttachments(thread);

  const chosen = await add(
    adapter,
    new File(["%PDF"], "prices.pdf", { type: "application/pdf" }),
  );
  const sent = await adapter.send(chosen);

  const [runMessage] = toAgUiMessages([
    {
      id: "m1",
      role: "user",
      content: [{ type: "text", text: "what is in this price list?" }],
      attachments: [sent],
    },
  ]);

  const body = runMessage as Extract<AgUiMessage, { role: "user" }>;
  assert.ok(contentText(body.content).includes("what is in this price list?"));
  assert.ok(contentText(body.content).includes("prices.pdf"));
  assert.ok(contentText(body.content).includes("f2"));
});

test("a new chat makes its thread before the upload, and the file goes to that thread", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    if (String(input) === "/api/threads") {
      return Response.json(
        {
          id: "T9",
          createdAt: "2026-10-30T00:00:00.000Z",
          stopped: false,
          title: null,
          archived: false,
          agent: null,
          model: null,
        },
        { status: 201 },
      );
    }
    return Response.json(
      { id: "f3", name: "prices.pdf", mimeType: "application/pdf", size: 4 },
      { status: 201 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const thread: ChatThread = {
    remoteId: () => undefined,
    initialize: () => threadListAdapter.initialize("local-1"),
  };
  const adapter = queAttachments(thread);

  const chosen = await add(
    adapter,
    new File(["%PDF"], "prices.pdf", { type: "application/pdf" }),
  );
  await adapter.send(chosen);

  assert.deepEqual(
    fetch.mock.calls.map(([input, init]) => `${init?.method} ${String(input)}`),
    ["POST /api/threads", "POST /api/threads/T9/files"],
  );
});
