import type { ThreadMessageLike } from "@assistant-ui/react";
import type { AgUiInterrupt } from "@assistant-ui/react-ag-ui";

/**
 * The thread's messages, with its last reply marked as waiting on the interrupts its run waits on, as AG-UI's runtime
 * marks a reply whose run ended on them: its status asks for action, its metadata holds the interrupts, and each tool
 * call an interrupt names carries the approval it asks for. So a chat loaded while its run waits for a yes shows the
 * question, and its answer resumes the run. With no interrupts, the messages as they are.
 */
export function waitingOn(
  messages: readonly ThreadMessageLike[],
  interrupts: readonly AgUiInterrupt[],
): readonly ThreadMessageLike[] {
  const at = messages.findLastIndex((m) => m.role === "assistant");
  const reply = messages[at];
  if (!interrupts.length || !reply) return messages;
  const byCall = new Map(
    interrupts.flatMap((i) =>
      i.toolCallId ? [[i.toolCallId, i] as const] : [],
    ),
  );
  const content =
    typeof reply.content === "string"
      ? reply.content
      : reply.content.map((part) => {
          const interrupt =
            part.type === "tool-call" && part.toolCallId
              ? byCall.get(part.toolCallId)
              : undefined;
          return interrupt
            ? {
                ...part,
                approval: {
                  id: interrupt.id,
                  ...(interrupt.message !== undefined
                    ? { prompt: interrupt.message }
                    : {}),
                },
              }
            : part;
        });
  const custom = reply.metadata?.custom ?? {};
  return messages.with(at, {
    ...reply,
    content,
    status: { type: "requires-action", reason: "interrupt" },
    metadata: {
      ...reply.metadata,
      custom: {
        ...custom,
        agui: {
          ...(custom.agui as Record<string, unknown> | undefined),
          interrupts,
        },
      },
    },
  });
}
