// @vitest-environment jsdom
/**
 * The card at a waiting tool call: the default card for any op, and the slot a toolkit entry takes in its place. The
 * card shows the question's description and the call's args, with Approve and Deny; an entry gets the args, the
 * description and a way to answer, and draws its own view.
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
  };
  return waitingOn([asked, reply], [interrupt as never]);
}

/** The chat, on a runtime that only holds the messages the test gives it. */
let captured: ReturnType<typeof useAui> | undefined;
function Capture() {
  captured = useAui();
  return null;
}

function Chat({
  messages,
  toolkit,
}: {
  messages: readonly ThreadMessageLike[];
  toolkit?: ReturnType<typeof defineToolkit> | undefined;
}) {
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

afterEach(cleanup);

test("given a reply whose call waits for a yes, when it shows with the steps shut, then the card shows the description and the args, and Approve and Deny", async () => {
  const cases = [
    { item: "hat", prompt: "Void: run till-void with the hat?" },
    { item: "coat", prompt: "Void: run till-void with the coat?" },
  ];
  for (const [n, one] of cases.entries()) {
    cleanup();
    render(<Chat messages={waiting({ id: `c${n}`, ...one })} />);

    await screen.findByText(one.prompt);
    assert.ok(
      screen.getByText(new RegExp(`"item": "${one.item}"`)),
      `the card did not show the args of ${one.item}`,
    );
    assert.ok(
      screen.getByRole("button", { name: "Approve" }),
      "the card offered no Approve",
    );
    assert.ok(
      screen.getByRole("button", { name: "Deny" }),
      "the card offered no Deny",
    );
    const steps = screen.queryByRole("button", { name: "Show steps" });
    if (steps)
      assert.equal(
        steps.getAttribute("aria-expanded"),
        "false",
        "the card was shown inside steps that were open",
      );
  }
});

test("given a toolkit entry for the tool, when its call waits for a yes, then the entry shows in the card's place, gets the args, the description and a way to answer, and the answer is recorded", async () => {
  const cases = [
    { item: "scarf", prompt: "Void: run till-void with the scarf?" },
    { item: "glove", prompt: "Void: run till-void with the glove?" },
  ];
  for (const [n, one] of cases.entries()) {
    cleanup();
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

    render(
      <Chat messages={waiting({ id: `c${n}`, ...one })} toolkit={toolkit} />,
    );

    const view = await screen.findByTestId("till-view");
    const last = seen.at(-1);
    assert.ok(last, "the toolkit entry was never given the call");
    assert.deepEqual(
      last.args,
      { item: one.item },
      "the toolkit entry got no args, or the wrong ones",
    );
    assert.equal(
      last.approval?.prompt,
      one.prompt,
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

    await act(async () => {
      within(view)
        .getByRole("button", { name: "Agree in the till view" })
        .click();
    });
    await waitFor(() => {
      const reply = captured?.thread
        .getState()
        .messages.findLast((message) => message.role === "assistant");
      const part = reply?.content.find(
        (content) => content.type === "tool-call",
      );
      assert.equal(
        part?.type === "tool-call" ? part.approval?.approved : undefined,
        true,
        "the entry's answer did not reach the call",
      );
    });
  }
});
