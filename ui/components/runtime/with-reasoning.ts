// OpenAI-compatible providers (Fireworks/DeepSeek) put reasoning in
// additional_kwargs.reasoning_content; assistant-ui reads additional_kwargs.reasoning.
type Msg = { additional_kwargs?: Record<string, unknown> };
export const withReasoning = <T>(message: T): T => {
  const kw = (message as Msg)?.additional_kwargs;
  const text = kw?.reasoning_content;
  if (typeof text !== "string" || !text || kw?.reasoning) return message;
  return {
    ...message,
    additional_kwargs: {
      ...kw,
      reasoning: { type: "reasoning", reasoning: text },
    },
  };
};
export const mapMessages = (data: unknown) =>
  Array.isArray(data) ? data.map(withReasoning) : data;
