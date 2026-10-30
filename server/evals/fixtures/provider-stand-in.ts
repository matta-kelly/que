/**
 * A local server that stands in for Fireworks, the provider of the judge's
 * model. It answers the chat completions path, and keeps what it was asked.
 *
 * Its answer is not taken from the live provider. Its shape is the streamed
 * chat completion of the OpenAI API (server-sent events of
 * `chat.completion.chunk`), which pi-ai's Chat Completions API reads. pi-ai
 * takes the key from `FIREWORKS_API_KEY`. Its base URL is Fireworks' own: a
 * command started with `--import` of ./to-stand-in.ts sends it here in its place.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const KEY = "fw-test";

type Asked = { model?: string; messages?: { content?: unknown }[] };

/** One streamed chat completion of the OpenAI API, the `n`th, that answers `text`: its events, in order. */
const completion = (
  n: number,
  model: string | undefined,
  text: string,
) => {
  const chunk = (delta: object, finish: string | null) => ({
    id: `chatcmpl-${n}`,
    object: "chat.completion.chunk",
    created: 1_791_878_400,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  return [
    ...[
      chunk({ role: "assistant", content: text }, null),
      chunk({}, "stop"),
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
};

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
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(completion(asked.length, model, reply(question)));
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
