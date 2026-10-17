/**
 * The chat model of Beam, Reflection's model, on its OpenAI-compatible Chat
 * Completions endpoint. Beam thinks before it answers and gives the thinking
 * in `reasoning_content`, which the framework's OpenAI model keeps on the
 * message (`additional_kwargs.reasoning_content`) but does not send back.
 * Beam refuses a request with an assistant message that has no
 * `reasoning_content`, or an empty one (400 missing_required_parameter), on a
 * tool-call turn and on a plain one. So each assistant message goes back with
 * its own, or with a space when it has none (a turn of another model, a
 * summary): Beam takes a space.
 */

import {
  ChatOpenAICompletions,
  type ChatOpenAICompletionsCallOptions,
  type OpenAIClient,
} from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";

// The framework builds the request from the messages and drops the thinking,
// and each way it calls the model builds its params from the call options:
// the thinking of each assistant message rides there, as a key JSON leaves out.
const THINKING = Symbol("the reasoning_content of each assistant message");
type BeamCallOptions = ChatOpenAICompletionsCallOptions & {
  [THINKING]?: string[];
};
type Params = { messages?: { role: string }[]; [THINKING]?: string[] };

const NO_THINKING = " ";

function thinkingOf(messages: BaseMessage[]): string[] {
  return messages
    .filter((message) => message.type === "ai")
    .map((message) => {
      // A turn streamed as events keeps its thinking in reasoning blocks of its content.
      const blocks = Array.isArray(message.content)
        ? message.content
            .map((block) =>
              block.type === "reasoning" && typeof block.reasoning === "string"
                ? block.reasoning
                : "",
            )
            .join("")
        : "";
      const thinking = message.additional_kwargs.reasoning_content || blocks;
      return typeof thinking === "string" && thinking.trim()
        ? thinking
        : NO_THINKING;
    });
}

export class ChatBeam extends ChatOpenAICompletions<BeamCallOptions> {
  constructor(fields: {
    /** The provider's own name for the model: `Beam-1.0-501B-A23B`. */
    model: string;
    /** Left out: `BEAM_API_KEY`. */
    apiKey?: string;
    maxTokens?: number;
    /** Sent as `reasoning_effort`: low, medium, high, xhigh or max. Left out, Beam thinks at its own default. */
    effort?: string;
    /** The `fetch` the client calls Beam with. A test hands in its own. */
    fetch?: typeof globalThis.fetch;
  }) {
    const apiKey = fields.apiKey ?? process.env.BEAM_API_KEY;
    if (!apiKey) throw new Error("BEAM_API_KEY is not set");
    super({
      model: fields.model,
      apiKey,
      maxTokens: fields.maxTokens,
      ...(fields.effort && {
        modelKwargs: { reasoning_effort: fields.effort },
      }),
      configuration: {
        baseURL: "https://api.reflection.ai/openai/v1",
        fetch: fields.fetch,
      },
    });
  }

  _llmType() {
    return "beam";
  }

  _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ) {
    return super._generate(
      messages,
      { ...options, [THINKING]: thinkingOf(messages) },
      runManager,
    );
  }

  _streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ) {
    return super._streamResponseChunks(
      messages,
      { ...options, [THINKING]: thinkingOf(messages) },
      runManager,
    );
  }

  _streamChatModelEvents(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ) {
    return super._streamChatModelEvents(
      messages,
      { ...options, [THINKING]: thinkingOf(messages) },
      runManager,
    );
  }

  invocationParams(
    options?: this["ParsedCallOptions"],
    extra?: { streaming?: boolean },
  ) {
    const params = super.invocationParams(options, extra);
    return options?.[THINKING]
      ? { ...params, [THINKING]: options[THINKING] }
      : params;
  }

  completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsStreaming,
    options?: OpenAIClient.RequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>>;
  completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming,
    options?: OpenAIClient.RequestOptions,
  ): Promise<OpenAIClient.Chat.Completions.ChatCompletion>;
  completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParams,
    options?: OpenAIClient.RequestOptions,
  ): Promise<unknown> {
    const { [THINKING]: thinking = [], messages = [] } = request as Params;
    let turn = 0;
    const sent = {
      ...request,
      messages: messages.map((message) =>
        message.role === "assistant"
          ? {
              ...message,
              reasoning_content: thinking[turn++] ?? NO_THINKING,
            }
          : message,
      ),
    };
    // One request of either kind: the parent sends it as it is.
    return super.completionWithRetry(
      sent as OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming,
      options,
    );
  }
}
