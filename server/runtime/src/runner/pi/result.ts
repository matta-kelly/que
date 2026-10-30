/**
 * A big result to a file, on pi. An op's result over the loop's `result.max` is moved to one file under
 * `large_tool_results/` in the run's environment, a path relative to the conversation's cwd, and the model gets a
 * pointer in its place: the path, the result's head and its tail. The model reads the file back with `read_result`, in
 * windows of bytes from an offset, each one cut on a character boundary.
 *
 * The reader is que's, not pi's `read`: an op's result is JSON text, often of one line, and pi's `read` goes on only by
 * lines, so of such a line it shows the first 50KB and no more.
 */

import type { Context } from "@earendil-works/chord/context";
import type {
  ToolExecutionApi,
  ToolExecutionResult,
} from "@earendil-works/pi-durable";
import * as z from "zod";
import { OpFailed } from "@mku1tra/que-plugin";

export const READ_RESULT = "read_result";

/** The most bytes of one window: pi's own read limit (`DEFAULT_MAX_BYTES`, `dist/truncate.js`). */
export const WINDOW = 50 * 1024;

/** The bytes of the result's head, and of its tail, that the pointer shows. */
const PREVIEW = 500;

/** The characters of one token, as the LangGraph path counted them (deepagents' eviction). */
const CHARS_PER_TOKEN = 4;

/** The directory of the moved results, relative to the run's cwd. */
const DIR = "large_tool_results";

export const READ_RESULT_DESCRIPTION =
  "Read a result that was too big for the chat from its file, one window of at most 50KB at a time. Start at byte_offset 0; each window names the byte_offset of the next, and the last says the result ends.";

export const readResultSchema = z.strictObject({
  path: z.string().describe("The file's path, as the pointer names it"),
  byte_offset: z
    .number()
    .int()
    .min(0)
    .describe(
      "The byte the window starts at: 0, or the one the last window named",
    ),
});

/** A character's start at or before `at`: a UTF-8 continuation byte is never one. */
function charStart(bytes: Uint8Array, at: number) {
  while (at > 0 && ((bytes[at] ?? 0) & 0xc0) === 0x80) at--;
  return at;
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** The run's environment: harness.ts always gives one. */
function envOf(api: ToolExecutionApi) {
  if (!api.env) throw new Error("the run has no environment for its files");
  return api.env;
}

/**
 * `answer`, or, when its text is over `max` tokens, a pointer to a file that holds the text. The file is named by
 * the call's task, which is unique in the Harness, so a rerun after a restart writes the same one and a fork, which
 * keeps its parent's cwd, never writes over its parent's.
 */
export async function moved(
  answer: ToolExecutionResult,
  max: number,
  api: ToolExecutionApi,
  context: Context,
): Promise<ToolExecutionResult> {
  const [only] = answer.output ?? [];
  if (answer.isError || only?.type !== "text") return answer;
  if (only.text.length <= max * CHARS_PER_TOKEN) return answer;
  const path = `${DIR}/${api.taskId}.json`;
  const bytes = new TextEncoder().encode(only.text);
  const written = await envOf(api).writeFile(path, bytes, context);
  if (!written.ok) throw written.error;
  const head = decode(bytes.subarray(0, charStart(bytes, PREVIEW)));
  const tail = decode(
    bytes.subarray(charStart(bytes, Math.max(0, bytes.length - PREVIEW))),
  );
  const text = [
    `The result is too big for the chat (${bytes.length} bytes), so it is in the file ${path}`,
    `Read it with ${READ_RESULT}, from byte_offset 0, one window at a time.`,
    `Its first ${PREVIEW} bytes:`,
    head,
    `Its last ${PREVIEW} bytes:`,
    tail,
  ].join("\n");
  return { ...answer, output: [{ type: "text", text }] };
}

/**
 * The window of the file at `path` from `offset`: at most `WINDOW` bytes, cut on a character boundary. A diagnostic
 * names the next window's byte offset, or says the result ends. A file that cannot be read is a failed call.
 */
export async function windowAt(
  { path, byte_offset: offset }: z.infer<typeof readResultSchema>,
  api: ToolExecutionApi,
  context: Context,
) {
  const opened = await envOf(api).openBinaryReader(path, undefined, context);
  if (!opened.ok) throw new OpFailed(opened.error.message);
  const reader = opened.value;
  try {
    // One byte more than a window: the boundary at WINDOW is a character's start only when that byte is not inside one.
    const read = await reader.read(offset, WINDOW + 1, context);
    if (!read.ok) throw new OpFailed(read.error.message);
    const chunk = read.value;
    const goesOn = chunk.length > WINDOW;
    const end = goesOn ? charStart(chunk, WINDOW) : chunk.length;
    api.diagnostic({
      severity: "info",
      message: goesOn
        ? `The result goes on: read the next window at byte_offset ${offset + end}.`
        : "This is the end of the result: it has no more bytes.",
    });
    return decode(chunk.subarray(0, end));
  } finally {
    await reader.close(context);
  }
}
