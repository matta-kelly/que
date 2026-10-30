// @vitest-environment jsdom
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import {
  queAttachments,
  type ChatThread,
} from "@/components/chat/attachment/attachment-adapter";

// jsdom has no layout: the composer's size observer has nothing to observe.
class NoLayout implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayout;

// A chat whose thread exists on que's server: its attachments go to that thread.
const thread: ChatThread = {
  remoteId: () => "T1",
  initialize: async () => ({ remoteId: "T1" }),
};

// The composer of a chat, on a runtime that takes attachments and never runs a model.
const renderComposer = (): (() => AssistantRuntime) => {
  let runtime: AssistantRuntime | undefined;
  const Chat = () => {
    const created = useLocalRuntime(
      { async *run() {} },
      { adapters: { attachments: queAttachments(thread) } },
    );
    runtime = created;
    return (
      <AssistantRuntimeProvider runtime={created}>
        <Thread autoFocus={false} />
      </AssistantRuntimeProvider>
    );
  };
  render(<Chat />);
  return () => {
    if (!runtime) throw new Error("the chat did not make a runtime");
    return runtime;
  };
};

afterEach(cleanup);

test("the composer offers an attachment control", () => {
  renderComposer();
  assert.ok(screen.getByRole("button", { name: /attach/i }));
});

test("a chosen file waits in the composer as an attachment", async () => {
  const runtime = renderComposer();
  await act(async () => {
    await runtime().thread.composer.addAttachment(
      new File(["region,amount\nwest,42\n"], "order.csv", { type: "text/csv" }),
    );
  });
  assert.ok(await screen.findByText("order.csv"));
});
