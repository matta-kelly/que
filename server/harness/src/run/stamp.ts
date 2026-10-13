/**
 * The stamp: each reply of the model says which model config gave it, in
 * `response_metadata.que.model`. A chat can change model part way, and what
 * reads the chat after (the UI, a cost) needs the model of each reply. On for
 * every run, on both engines.
 */

import { AIMessage, createMiddleware } from "langchain";

export const stamp = (model: string) =>
  createMiddleware({
    name: "Stamp",
    wrapModelCall: async (request, handler) => {
      const reply = await handler(request);
      if (AIMessage.isInstance(reply))
        reply.response_metadata = {
          ...reply.response_metadata,
          que: { model },
        };
      return reply;
    },
  });
