/**
 * A local server in the place of the provider of the test deployment's
 * models. It answers the chat completions path as a stream: one fixed reply,
 * with fixed token counts. A message from the user that starts with `ASK`
 * gets a call of the fixture operation in place of the reply. It keeps what
 * it was asked.
 *
 * Its answer is not taken from the live provider. Its shape is the chat
 * completion chunk of the OpenAI API, which `@langchain/fireworks` 0.2.13
 * reads through `@langchain/openai`. The provider package takes the URL from
 * `FIREWORKS_BASE_URL`, and the key from `FIREWORKS_API_KEY`.
 *
 * Run as a file, it listens where `FIREWORKS_BASE_URL` says and prints one
 * line for each request it answers: `just test` starts it this way.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const PATH = "/inference/v1";

export const KEY = "fw-test";
export const REPLY = "Hello from the stand-in.";
/** In the provider's own names. */
export const USAGE = {
  prompt_tokens: 1200,
  completion_tokens: 40,
  total_tokens: 1240,
};
/** A message that starts with this asks for the call. */
export const ASK = "shelf:";
/** The call of the fixture operation (packages/shelf). */
export const CALL = { name: "shelf_findBooks", args: { title: "the" } };

type Asked = {
  model?: string;
  messages?: { role?: string; content?: unknown }[];
};

/** The text of a message: its content, or the text parts of it, joined. */
const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((part: { text?: unknown }) =>
            typeof part.text === "string" ? part.text : "",
          )
          .join("")
      : "";

/** `heard` gets one line for each request answered. */
export async function provider(
  port = 0,
  heard: (line: string) => void = () => {},
) {
  const asked: { model: string; answer: "reply" | "call" }[] = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const refuse = (status: number, message: string) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message } }));
      };
      if (request.headers.authorization !== `Bearer ${KEY}`)
        return refuse(401, "Invalid API key");
      if (
        request.method !== "POST" ||
        request.url !== `${PATH}/chat/completions`
      )
        return refuse(404, "Not Found");
      const { model = "", messages = [] } = JSON.parse(raw) as Asked;
      const last = messages.at(-1);
      const call =
        last?.role === "user" && textOf(last.content).startsWith(ASK);
      asked.push({ model, answer: call ? "call" : "reply" });
      heard(
        `model request ${asked.length}: ${model}, ${call ? "call" : "reply"}`,
      );
      const id = `chatcmpl-${asked.length}`;
      const chunk = (delta: unknown, rest: object = {}) =>
        response.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created: 1_791_878_400,
            model,
            choices: [{ index: 0, delta, finish_reason: null, ...rest }],
          })}\n\n`,
        );
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (call)
        chunk({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              index: 0,
              id: `call-${asked.length}`,
              type: "function",
              function: {
                name: CALL.name,
                arguments: JSON.stringify(CALL.args),
              },
            },
          ],
        });
      else chunk({ role: "assistant", content: REPLY });
      chunk({}, { finish_reason: call ? "tool_calls" : "stop" });
      // The counts come last, in a chunk with no choice.
      response.write(
        `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1_791_878_400, model, choices: [], usage: USAGE })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}${PATH}`,
    /** Each request it answered, in the order they came. */
    asked,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.main) {
  const { port } = new URL(process.env.FIREWORKS_BASE_URL ?? "");
  const { url } = await provider(Number(port), console.log);
  console.log(`the stand-in of the provider is up at ${url}`);
}
