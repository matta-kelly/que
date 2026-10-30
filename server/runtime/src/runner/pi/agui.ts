/**
 * pi to AG-UI: a run's agent events as AG-UI events, and a conversation's
 * entries as AG-UI messages, with the message id rule. Each id is kept in
 * pi's own storage, so it is as durable as the chat:
 * - a user message is placed as a `que.user` entry, whose data holds the
 *   client's id;
 * - an assistant message's id is made from its run's first submission id and
 *   its place in the run, so it is known while it streams. Once its entry is
 *   written, a `que.message-id` entry records it against that entry: a write
 *   of only kind and data, which the model never sees;
 * - a tool message's id is its call's id. A tool call shows whole once its
 *   assistant message ends, and its result once the tool's run does.
 */

import {
  EventType,
  type AGUIEvent,
  type Message as AgUiMessage,
} from "@ag-ui/core";
import type {
  AssistantMessage,
  Message,
  TextContent,
} from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  defineEntry,
  ToolResultEntry,
  type AgentEvent,
  type EntryRecord,
} from "@earendil-works/pi-durable";
import { isBug } from "./extension.js";

const UserMessageEntry = defineEntry<{ id: string }>("que.user");
const MessageIdEntry = defineEntry<{ entry: number; id: string }>(
  "que.message-id",
);

/** The entry a user message is placed as: one that holds the client's id. */
export const userEntry = (id: string) => ({
  kind: UserMessageEntry.kind,
  data: { id },
});

/** The write that records an assistant message's id against its entry. */
export const idEntry = (entry: number, id: string) => ({
  kind: MessageIdEntry.kind,
  data: { entry, id },
});

type Block = AssistantMessage["content"][number];

function textOf(message: Message | undefined) {
  const content = message?.content ?? "";
  if (typeof content === "string") return content;
  const parts: readonly { type: string }[] = content;
  return parts
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * One run's translation: `of` gives the AG-UI events of each agent event;
 * `kept` the id of the assistant message that ended last, if it is one of
 * the viewer's messages; and `error` the message of the run's last model
 * call, if it failed. pi writes each failed attempt as an entry of its own and
 * then retries, so only the last one says how the run ended. A tool that a
 * bug failed ends the run with an error too, which names only the tool.
 */
export function aguiRun() {
  let run = "";
  let place = 0;
  let id = "";
  // Per content block of the assistant message, how much of its text has been sent.
  let sent: number[] = [];
  let text = false;
  let reasoning: string | undefined;
  let error: string | undefined;
  let bug: string | undefined;
  let kept: string | undefined;

  const closeReasoning = (): AGUIEvent[] => {
    if (!reasoning) return [];
    const messageId = reasoning;
    reasoning = undefined;
    return [
      { type: EventType.REASONING_MESSAGE_END, messageId },
      { type: EventType.REASONING_END, messageId },
    ];
  };

  /** The events for `delta`, appended to block `index` of the assistant message. */
  const append = (
    index: number,
    kind: "text" | "thinking",
    delta: string,
  ): AGUIEvent[] => {
    if (!delta) return [];
    sent[index] = (sent[index] ?? 0) + delta.length;
    if (kind === "thinking") {
      const messageId = `${id}.${index}`;
      const start: AGUIEvent[] =
        reasoning === messageId
          ? []
          : [
              ...closeReasoning(),
              { type: EventType.REASONING_START, messageId },
              {
                type: EventType.REASONING_MESSAGE_START,
                messageId,
                role: "reasoning",
              },
            ];
      reasoning = messageId;
      return [
        ...start,
        { type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta },
      ];
    }
    const start: AGUIEvent[] = text
      ? []
      : [
          ...closeReasoning(),
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId: id,
            role: "assistant",
          },
        ];
    text = true;
    return [
      ...start,
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta },
    ];
  };

  /** The events for what of a whole block has not been sent. */
  const rest = (block: Block, index: number): AGUIEvent[] =>
    block.type === "text"
      ? append(index, "text", block.text.slice(sent[index] ?? 0))
      : block.type === "thinking"
        ? append(index, "thinking", block.thinking.slice(sent[index] ?? 0))
        : [];

  /** A tool call of the assistant message, whole: it shows once the message ends. */
  const toolCall = (block: Block): AGUIEvent[] =>
    block.type === "toolCall"
      ? [
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: block.id,
            toolCallName: block.name,
            parentMessageId: id,
          },
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: block.id,
            delta: JSON.stringify(block.arguments),
          },
          { type: EventType.TOOL_CALL_END, toolCallId: block.id },
        ]
      : [];

  const of = (event: AgentEvent): AGUIEvent[] => {
    switch (event.type) {
      case "run_start":
        run = String(event.inputs[0]);
        place = 0;
        return [];
      case "message_start":
        if (event.message.role !== "assistant") return [];
        id = `${run}.${++place}`;
        sent = [];
        text = false;
        return event.message.content.flatMap(rest);
      case "message_update":
        return event.changes.flatMap((change) =>
          change.type === "text_delta" || change.type === "thinking_delta"
            ? append(
                change.contentIndex,
                change.type === "text_delta" ? "text" : "thinking",
                change.delta,
              )
            : "block" in change
              ? rest(change.block, change.contentIndex)
              : [],
        );
      case "message_end": {
        if (!AssistantEntry.is(event.entry)) return [];
        const message = event.entry.model?.[0] as AssistantMessage | undefined;
        const out: AGUIEvent[] = [
          ...(message?.content ?? []).flatMap(rest),
          ...closeReasoning(),
          ...(text
            ? [{ type: EventType.TEXT_MESSAGE_END, messageId: id } as const]
            : []),
          ...(message?.content ?? []).flatMap(toolCall),
        ];
        const failed = message?.stopReason === "error";
        error = failed
          ? (message.errorMessage ?? "the model call failed")
          : undefined;
        // A failed attempt the viewer got no text of is not one of its messages.
        kept = failed && !text ? undefined : id;
        return out;
      }
      case "tool_execution_end": {
        // A tool message's id is its call's id.
        const result = ToolResultEntry.is(event.entry)
          ? event.entry.model?.[0]
          : undefined;
        if (result?.role === "toolResult" && isBug(result.details))
          bug ??= event.toolName;
        return result
          ? [
              {
                type: EventType.TOOL_CALL_RESULT,
                messageId: event.toolCallId,
                toolCallId: event.toolCallId,
                role: "tool",
                content: textOf(result),
              },
            ]
          : [];
      }
      default:
        return [];
    }
  };

  return {
    of,
    kept: () => kept,
    error: () => error ?? (bug && `the tool ${bug} failed, so the run stopped`),
  };
}

/** A conversation's user and assistant messages, as AG-UI messages with their ids. */
export function messagesOf(entries: readonly EntryRecord[]): AgUiMessage[] {
  const ids = new Map(
    entries.filter(MessageIdEntry.is).map((e) => [e.data.entry, e.data.id]),
  );
  return entries.flatMap((entry): AgUiMessage[] => {
    if (UserMessageEntry.is(entry))
      return [
        { id: entry.data.id, role: "user", content: textOf(entry.model?.[0]) },
      ];
    const id = ids.get(entry.id);
    // An answer is shown once its id is recorded, so no viewer gets it under another id.
    if (AssistantEntry.is(entry) && id)
      return [{ id, role: "assistant", content: textOf(entry.model?.[0]) }];
    return [];
  });
}
