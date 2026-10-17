/**
 * A local server that stands in for the provider of the judge's model. It
 * answers the chat completions path, and keeps what it was asked.
 *
 * Its answer is not taken from the live provider. Its shape is the chat
 * completion of the OpenAI API, which `@langchain/fireworks` 0.2.13 reads
 * through `@langchain/openai`. The provider package takes the URL from
 * `FIREWORKS_BASE_URL`, and the key from `FIREWORKS_API_KEY`.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const KEY = "fw-test";

type Asked = { model?: string; messages?: { content?: unknown }[] };

/** One chat completion of the OpenAI API, the `n`th, that answers `text`. */
export const completion = (
  n: number,
  model: string | undefined,
  text: string,
) => ({
  id: `chatcmpl-${n}`,
  object: "chat.completion",
  created: 1_791_878_400,
  model,
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: text },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

/** `reply` gives the text the model answers with, from the text it was sent. */
export async function provider(reply: (question: string) => string) {
  const asked: string[] = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const send = (status: number, answer: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(answer));
      };
      if (request.headers.authorization !== `Bearer ${KEY}`)
        return send(401, { error: { message: "Invalid API key" } });
      if (
        request.method !== "POST" ||
        request.url !== "/inference/v1/chat/completions"
      )
        return send(404, { error: { message: "Not Found" } });
      const { model, messages = [] } = JSON.parse(raw) as Asked;
      const question = messages
        .map(({ content }) =>
          typeof content === "string" ? content : JSON.stringify(content),
        )
        .join("\n");
      asked.push(question);
      return send(200, completion(asked.length, model, reply(question)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/inference/v1`,
    /** The text of each request, in the order they came. */
    asked,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
