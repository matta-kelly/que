/**
 * The compact policy: past a size, the model is sent a placeholder in place of
 * an old operation result. The call stays, with its arguments, so the model
 * can make it again. The chat itself keeps every result.
 */

import {
  ClearToolUsesEdit,
  contextEditingMiddleware,
  createMiddleware,
} from "langchain";
import type { Policy } from "./policy.js";

/** The size of a chat, in tokens, where old results stop going out. */
const LIMIT = 100_000;
/** The newest tool results, which always go out in full. */
const NEWEST = 3;

export const compact: Policy = {
  name: "compact",
  middleware: (base) => {
    const clear = contextEditingMiddleware({
      edits: [
        new ClearToolUsesEdit({
          trigger: { tokens: LIMIT },
          keep: { messages: NEWEST },
          excludeTools: base,
        }),
      ],
    });
    return [
      createMiddleware({
        name: "CompactResults",
        // The edit writes into the list it is handed, and that list is the
        // chat's own: it gets a copy, so the chat keeps what it holds.
        wrapModelCall: (request, handler) =>
          clear.wrapModelCall!(
            { ...request, messages: [...request.messages] },
            handler,
          ),
      }),
    ];
  },
};
