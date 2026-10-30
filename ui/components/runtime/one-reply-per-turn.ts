// A turn as one reply, as the live stream joins it (`joinStrategy: "concat-content"`).

import type { ThreadMessageLike } from "@assistant-ui/react";

const partsOf = (content: ThreadMessageLike["content"]) =>
  typeof content === "string"
    ? [{ type: "text" as const, text: content }]
    : content;

/** Each assistant message after another, joined into it under the first one's id. */
export const oneReplyPerTurn = (messages: readonly ThreadMessageLike[]) =>
  messages.reduce<ThreadMessageLike[]>((turns, message) => {
    const last = turns.at(-1);
    if (last?.role !== "assistant" || message.role !== "assistant")
      return [...turns, message];
    const joined = {
      ...last,
      content: [...partsOf(last.content), ...partsOf(message.content)],
    };
    return [...turns.slice(0, -1), joined];
  }, []);
