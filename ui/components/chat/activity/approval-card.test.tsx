// @vitest-environment jsdom
/**
 * The card at a waiting tool call: the default card for any op, and the slot a toolkit entry takes in its place. The
 * card shows the question's description and the call's args, with the decisions the op allows; an entry gets the args, the
 * description and a way to answer, and draws its own view. Either way the card sits outside the chain of thought.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  AuiConfig,
  AssistantRuntimeProvider,
  Tools,
  defineToolkit,
  useAui,
  useLocalRuntime,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { waitingOn } from "@/components/runtime/waiting";

// jsdom has no layout: the composer's size observer has nothing to observe.
class NoLayout implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayout;

const asked: ThreadMessageLike = {
  id: "u1",
  role: "user",
  content: [{ type: "text", text: "Void the hat." }],
};

/** A reply with one call that waits for a yes, and the interrupt that asks it. */
function waiting({
  id,
  item,
  prompt,
}: {
  id: string;
  item: string;
  prompt: string;
}) {
  const reply: ThreadMessageLike = {
    id: `a-${id}`,
    role: "assistant",
    content: [
      { type: "reasoning", text: "The till holds it, so void it." },
      { type: "text", text: "Voiding. " },
      {
        type: "tool-call",
        toolCallId: id,
        toolName: "till-void",
        args: { item },
        argsText: JSON.stringify({ item }),
      },
    ],
  };
  const interrupt = {
    id: `i-${id}`,
    reason: "tool_call",
    toolCallId: id,
    message: prompt,
    responseSchema: {
      oneOf: [
        { required: ["type"], properties: { type: { const: "approve" } } },
        { required: ["type"], properties: { type: { const: "edit" } } },
        { required: ["type"], properties: { type: { const: "reject" } } },
      ],
    },
    metadata: {
      plugin: "till",
      op: "till-void",
      input: { item },
      decisions: ["approve", "edit", "reject"],
    },
  };
  return waitingOn([asked, reply], [interrupt as never]);
}

/**
 * The chat, on a runtime that only holds the messages the test gives it. It returns the thread it renders, for a test
 * that needs to look at the calls' approvals.
 */
function renderChat({
  messages,
  toolkit,
}: {
  messages: readonly ThreadMessageLike[];
  toolkit?: ReturnType<typeof defineToolkit> | undefined;
}) {
  let aui: ReturnType<typeof useAui> | undefined;
  const Capture = () => {
    aui = useAui();
    return null;
  };
  function Chat() {
    const runtime = useLocalRuntime(
      { run: async () => ({ content: [] }) } as never,
      { initialMessages: messages },
    );
    return (
      <AssistantRuntimeProvider
        runtime={runtime}
        config={toolkit ? AuiConfig({ tools: Tools({ toolkit }) }) : undefined}
      >
        <Thread autoFocus={false} />
        <Capture />
      </AssistantRuntimeProvider>
    );
  }
  render(<Chat />);
  return () => {
    if (!aui) throw new Error("the chat did not render its runtime");
    return aui;
  };
}

afterEach(cleanup);

test("given a reply whose call waits for a yes, when it shows with the steps shut, then the card shows the description and the args, and the decisions the op allows", async () => {
  const prompt = "Void: run till-void with the hat?";
  renderChat({
    messages: waiting({ id: "c1", item: "hat", prompt }),
  });

  const description = await screen.findByText(prompt);
  const card = description.closest<HTMLElement>('[data-slot="tool-approval"]');
  assert.ok(card, "the description was not shown in a tool approval card");
  assert.ok(
    within(card).getByText(/"item": "hat"/),
    "the card did not show the args of the hat",
  );
  assert.ok(
    within(card).queryByRole("button", { name: "Approve" }),
    "the card offered no Approve",
  );
  assert.ok(
    within(card).queryByRole("button", { name: "Reject" }),
    "the card offered no Reject",
  );
  assert.ok(
    within(card).queryByRole("button", { name: "Edit" }),
    "the card offered no Edit",
  );
  assert.equal(
    within(card).queryByRole("button", { name: "Respond" }),
    null,
    "the card offered a Respond the op does not allow",
  );
  assert.equal(
    card.closest('[data-slot="aui_chain-of-thought"]'),
    null,
    "the card was shown inside the chain of thought",
  );
});

test("given a second reply whose call waits for a yes, when it shows, then its card shows its own description and args, and the decisions the op allows", async () => {
  const prompt = "Void: run till-void with the coat?";
  renderChat({
    messages: waiting({ id: "c2", item: "coat", prompt }),
  });

  const description = await screen.findByText(prompt);
  const card = description.closest<HTMLElement>('[data-slot="tool-approval"]');
  assert.ok(card, "the description was not shown in a tool approval card");
  assert.ok(
    within(card).getByText(/"item": "coat"/),
    "the card did not show the args of the coat",
  );
  assert.ok(
    within(card).queryByRole("button", { name: "Approve" }),
    "the card offered no Approve",
  );
  assert.ok(
    within(card).queryByRole("button", { name: "Reject" }),
    "the card offered no Reject",
  );
  assert.ok(
    within(card).queryByRole("button", { name: "Edit" }),
    "the card offered no Edit",
  );
  assert.equal(
    within(card).queryByRole("button", { name: "Respond" }),
    null,
    "the card offered a Respond the op does not allow",
  );
  assert.equal(
    card.closest('[data-slot="aui_chain-of-thought"]'),
    null,
    "the card was shown inside the chain of thought",
  );
});

test("given a toolkit entry for the tool, when its call waits for a yes, then the entry shows in the card's place, gets the args, the description and a way to answer, and the answer is recorded", async () => {
  const prompt = "Void: run till-void with the scarf?";
  const seen: ToolCallMessagePartProps[] = [];
  const View = (props: ToolCallMessagePartProps) => {
    seen.push(props);
    return (
      <div data-testid="till-view">
        <p>{props.approval?.prompt}</p>
        <p>{JSON.stringify(props.args)}</p>
        <button
          onClick={() => void props.respondToApproval({ approved: true })}
        >
          Agree in the till view
        </button>
      </div>
    );
  };
  const toolkit = defineToolkit({
    "till-void": { type: "backend", render: View },
  } as never);
  const aui = renderChat({
    messages: waiting({ id: "c3", item: "scarf", prompt }),
    toolkit,
  });

  const view = await screen.findByTestId("till-view");
  const last = seen.at(-1);
  assert.ok(last, "the toolkit entry was never given the call");
  assert.deepEqual(
    last.args,
    { item: "scarf" },
    "the toolkit entry got no args, or the wrong ones",
  );
  assert.equal(
    last.approval?.prompt,
    prompt,
    "the toolkit entry got no description, or the wrong one",
  );
  assert.equal(
    typeof last.respondToApproval,
    "function",
    "the toolkit entry got no way to answer",
  );
  assert.equal(
    screen.queryByRole("button", { name: "Approve" }),
    null,
    "the default card showed in the toolkit entry's place",
  );
  assert.equal(
    view.closest('[data-slot="aui_chain-of-thought"]'),
    null,
    "the toolkit entry was shown inside the chain of thought",
  );

  await act(async () => {
    within(view)
      .getByRole("button", { name: "Agree in the till view" })
      .click();
  });
  await waitFor(() => {
    const reply = aui()
      .thread.getState()
      .messages.findLast((message) => message.role === "assistant");
    const part = reply?.content.find((content) => content.type === "tool-call");
    assert.equal(
      part?.type === "tool-call" ? part.approval?.approved : undefined,
      true,
      "the entry's answer did not reach the call",
    );
  });
});

test("given a second toolkit entry for the tool, when its call waits for a yes, then the entry gets that call's args", async () => {
  const prompt = "Void: run till-void with the glove?";
  const seen: ToolCallMessagePartProps[] = [];
  const View = (props: ToolCallMessagePartProps) => {
    seen.push(props);
    return <div data-testid="till-view" />;
  };
  const toolkit = defineToolkit({
    "till-void": { type: "backend", render: View },
  } as never);
  renderChat({
    messages: waiting({ id: "c4", item: "glove", prompt }),
    toolkit,
  });

  await screen.findByTestId("till-view");
  const last = seen.at(-1);
  assert.ok(last, "the toolkit entry was never given the call");
  assert.deepEqual(
    last.args,
    { item: "glove" },
    "the toolkit entry got no args, or the wrong ones",
  );
  assert.equal(
    last.approval?.prompt,
    prompt,
    "the toolkit entry got no description, or the wrong one",
  );
});
