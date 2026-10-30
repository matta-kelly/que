/**
 * A big result to a file, on pi (F6). Each run is on a Harness of its own, on pi's memory storage, with que's extension
 * of one catalog selected and `result` as a loop gives it; the run's environment is pi's NodeExecutionEnv rooted at the
 * conversation's cwd, a directory of the test's own. pi-ai's scripted provider (`faux`) makes the model's calls, so no
 * model is called. Each result is read as the model gets it: the tool result entry, its diagnostics apart.
 */

import { test } from "node:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Message } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import {
  createRegistry,
  defineExtension,
  Harness,
  MemoryStorage,
  ToolResultEntry,
  type EntryRecord,
  type Extension,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { createReadTool } from "@earendil-works/pi-durable/tools";
import * as z from "zod";
import { definePlugin } from "@mku1tra/que-plugin";
import type { ResolvedLoop } from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { door } from "../../assemble/door.js";
import { eager } from "../../assemble/eager/index.js";
import { extension } from "./extension.js";

/** pi's own read limit, `DEFAULT_MAX_BYTES` (`dist/truncate.js:12`): the most bytes one window holds. */
const WINDOW = 50 * 1024;

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => `row ${i} of the report`).join("\n");

const shop = definePlugin({
  name: "shop",
  type: "plugin",
  title: "Shop",
  description: "The shop's reports.",
  ops: [
    {
      name: "shop-report",
      type: "op",
      title: "Report",
      description: "The rows of the sales report.",
      input: z.object({ rows: z.number().describe("How many rows") }),
      run: async (_, { rows: count }) => rows(count),
    },
    {
      name: "shop-filler",
      type: "op",
      title: "Filler",
      description: "Filler text of about that many characters.",
      input: z.object({ chars: z.number().describe("How many characters") }),
      run: async (_, { chars }) => "lorem ipsum ".repeat(Math.ceil(chars / 12)),
    },
  ],
});
const catalog: Catalog = [{ plugin: { definition: shop, skills: [] } }];

/** The text the model gets of an op's result whole: the JSON text of what it gives back. */
const reportText = (count: number) => JSON.stringify(rows(count));

const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 1_000_000 }],
});
const models = createModels();
models.setProvider(faux.provider);

type Setting = ResolvedLoop["result"];
type Call = { name: string; args: Record<string, unknown>; id: string };
type Got = { isError: boolean; text: string; notes: string; whole: string };

/**
 * A tool result as the model got it: `text` the output, `notes` the diagnostics' messages, `whole` the content with
 * the rendered diagnostics, as one text.
 */
function resultIn(
  entries: readonly EntryRecord[],
  id: string,
): Got | undefined {
  for (const entry of entries) {
    if (!ToolResultEntry.is(entry)) continue;
    const message = entry.model?.[0];
    if (message?.role !== "toolResult" || message.toolCallId !== id) continue;
    const notes = entry.data.diagnostics;
    const texts = message.content.map((block) =>
      block.type === "text" ? block.text : "",
    );
    // The content ends with the rendered diagnostics when there are any (pi's ToolResultEntry).
    const output = notes.length ? texts.slice(0, -1) : texts;
    return {
      isError: message.isError,
      text: output.join(""),
      notes: notes.map((n) => n.message).join("\n"),
      whole: texts.join(""),
    };
  }
  return undefined;
}

/** A directory of the test's own, the run's cwd, removed after `body`. */
async function inCwd<T>(body: (cwd: string) => Promise<T>) {
  const cwd = await mkdtemp(join(tmpdir(), "que-result-"));
  try {
    return await body(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/**
 * One message on a new conversation in `cwd`, with que's extension of the catalog on `result` (and `more`, other
 * extensions to select): at each request the model makes the calls `next` gives it from the requests so far, one turn
 * of them, and answers "Done." when it gives none. The tools of each request, and each tool result by call id.
 */
async function chat(
  cwd: string,
  result: Setting,
  next: (requests: readonly Message[][]) => Call[],
  more: Extension[] = [],
) {
  const que = {
    ...extension(
      catalog,
      door(async () => undefined),
      "ana",
      eager,
      result,
    ),
    name: "que",
  };
  const registry = createRegistry();
  registry.install(que);
  for (const extra of more) registry.install(extra);
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models,
      registry,
      settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
      // As harness.ts builds it: pi's NodeExecutionEnv, rooted at the conversation's cwd.
      env: ({ cwd: at }) => new NodeExecutionEnv({ cwd: at ?? process.cwd() }),
    },
    context,
  );
  const tools: string[][] = [];
  const requests: Message[][] = [];
  faux.setResponses(
    Array.from({ length: 50 }, () => (request: { messages: Message[] }) => {
      tools.push(
        getCurrentTools(request.messages)
          .map((t) => t.name)
          .sort(),
      );
      requests.push([...request.messages]);
      const calls = next(requests);
      return calls.length
        ? fauxAssistantMessage(
            calls.map(({ name, args, id }) => fauxToolCall(name, args, { id })),
            { stopReason: "toolUse" },
          )
        : fauxAssistantMessage(fauxText("Done."));
    }),
  );
  try {
    const conversation = await harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: "fireworks", modelId: "small-model" },
          extensions: [que, ...more],
          cwd,
        },
      },
      context,
    );
    const submission = await conversation.submit(
      { type: "input", content: "Go." },
      context,
    );
    await submission.wait(context);
    const { entries } = await conversation.context(context);
    return { tools, of: (id: string) => resultIn(entries, id) };
  } finally {
    await harness.close(context);
  }
}

/** The model makes `calls` at its first request, and then answers. */
const once =
  (...calls: Call[]) =>
  (requests: readonly Message[][]) =>
    requests.length === 1 ? calls : [];

/** The files under `large_tool_results/` in `cwd`, by their relative paths. */
async function moved(cwd: string) {
  const dir = join(cwd, "large_tool_results");
  if (!existsSync(dir)) return [];
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  return names
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name).slice(cwd.length + 1));
}

/** The relative path to `large_tool_results/` a pointer names. */
const pathIn = (pointer: string) =>
  pointer.match(/(?<![\w/.])large_tool_results\/[^\s"'`)\]<>,]+/)?.[0];

const big = (rowCount: number): Call => ({
  name: "shop-report",
  args: { rows: rowCount },
  id: "big",
});

test("given result.max of 100, when an op's result is over it, then it is one file under large_tool_results/ in the run's cwd, the model gets its head, its tail and the path, and it is offered read_result and no other tool of files", async () => {
  await inCwd(async (cwd) => {
    const { tools, of } = await chat(cwd, { max: 100 }, once(big(200)));
    assert.deepEqual(tools[0], ["read_result", "shop-filler", "shop-report"]);

    const files = await moved(cwd);
    assert.equal(files.length, 1, `files moved: ${files.join(", ")}`);
    const [file] = files as [string];
    assert.equal(await readFile(join(cwd, file), "utf8"), reportText(200));

    const pointer = of("big");
    assert.ok(pointer && !pointer.isError, JSON.stringify(pointer));
    assert.ok(
      pointer.whole.length < reportText(200).length / 2,
      `the pointer is ${pointer.whole.length} characters`,
    );
    assert.match(pointer.whole, /row 0 of the report/);
    assert.match(pointer.whole, /row 199 of the report/);
    assert.doesNotMatch(pointer.whole, /row 100 of the report/);
    // The path is relative, so the env roots it at the run's cwd: it is not the host's, at its root or at its cwd.
    assert.equal(pathIn(pointer.whole), file);
    assert.ok(!existsSync(join("/", file)));
    assert.ok(!existsSync(join(process.cwd(), file)));
  });

  // Two big results in one turn: one file each.
  await inCwd(async (cwd) => {
    const { of } = await chat(
      cwd,
      { max: 100 },
      once(
        { name: "shop-report", args: { rows: 300 }, id: "a" },
        { name: "shop-report", args: { rows: 400 }, id: "b" },
      ),
    );
    const files = await moved(cwd);
    assert.equal(files.length, 2, `files moved: ${files.join(", ")}`);
    const paths = [pathIn(of("a")?.whole ?? ""), pathIn(of("b")?.whole ?? "")];
    assert.deepEqual([...paths].sort(), [...files].sort());
    assert.equal(await readFile(join(cwd, paths[0]!), "utf8"), reportText(300));
    assert.equal(await readFile(join(cwd, paths[1]!), "utf8"), reportText(400));
  });
});

/** The next byte offset a diagnostic names, if it names one. */
const nextOffset = (notes: string) => {
  const found = notes.match(/byte_offset\D{0,3}(\d+)/);
  return found ? Number(found[1]) : undefined;
};

/** One read_result call in `cwd`, at `byte_offset`, as the model gets its result. */
async function readAt(cwd: string, path: string, byteOffset: number) {
  const { of } = await chat(
    cwd,
    { max: 20_000 },
    once({
      name: "read_result",
      args: { path, byte_offset: byteOffset },
      id: "r",
    }),
  );
  const got = of("r");
  assert.ok(got, `no result of read_result at ${byteOffset}`);
  return got;
}

/** A file's text, read back by read_result from byte 0, following each named offset to the end. */
async function readBack(cwd: string, path: string, size: number) {
  const windows: Buffer[] = [];
  let offset = 0;
  for (let calls = 0; calls < 20; calls++) {
    const got = await readAt(cwd, path, offset);
    assert.ok(!got.isError, `read_result at ${offset} failed: ${got.whole}`);
    const bytes = Buffer.from(got.text, "utf8");
    assert.ok(
      bytes.length <= WINDOW,
      `the window at ${offset} is ${bytes.length} bytes`,
    );
    assert.ok(
      !got.text.includes("�"),
      `the window at ${offset} has a broken character`,
    );
    windows.push(bytes);
    const next = nextOffset(got.notes);
    if (offset + bytes.length >= size) {
      // The last window says the file ends, and names no next offset.
      assert.equal(
        next,
        undefined,
        `the last window names ${next}: ${got.notes}`,
      );
      assert.match(got.notes, /\bend/i);
      return Buffer.concat(windows);
    }
    assert.equal(
      next,
      offset + bytes.length,
      `the window at ${offset} names the next byte_offset: ${got.notes}`,
    );
    offset = next!;
  }
  assert.fail("read_result did not reach the end in 20 calls");
}

/**
 * 200KB of text with no newline: ASCII and characters of two, three and four bytes, with a three-byte character
 * across byte 50KB, so the first window's end falls inside it.
 */
const oneLine = () => {
  const head = "a".repeat(WINDOW - 1) + "€";
  let text = head;
  for (let i = 0; text.length < 200 * 1024; i++)
    text += ["b", "é", "€", "😀"][i % 4];
  return text;
};

/** Writes `text` as a moved result under `large_tool_results/` in `cwd`; its relative path. */
async function place(cwd: string, name: string, text: string) {
  await mkdir(join(cwd, "large_tool_results"), { recursive: true });
  await writeFile(join(cwd, "large_tool_results", name), text);
  return `large_tool_results/${name}`;
}

test("given a result file of 200KB with no newline, when read_result reads it from byte 0 to the end, then each window is at most 50KB and whole characters, and the windows are the file's bytes exactly", async () => {
  await inCwd(async (cwd) => {
    const text = oneLine();
    const bytes = Buffer.from(text, "utf8");
    assert.ok(bytes.length > 4 * WINDOW, "the file is over four windows");
    const path = await place(cwd, "one-line", text);
    assert.deepEqual(await readBack(cwd, path, bytes.length), bytes);
  });

  // A file of many short lines: a window holds far more than pi's 2000 lines, and still comes back whole.
  await inCwd(async (cwd) => {
    const text = rows(9000);
    const bytes = Buffer.from(text, "utf8");
    const path = await place(cwd, "lines", text);
    assert.deepEqual(await readBack(cwd, path, bytes.length), bytes);
  });

  // A file under one window: one read, which ends it.
  await inCwd(async (cwd) => {
    const text = "lorem ipsum é€😀";
    const path = await place(cwd, "small", text);
    assert.deepEqual(
      await readBack(cwd, path, Buffer.byteLength(text)),
      Buffer.from(text, "utf8"),
    );
  });
});

test("given a result file, when read_result reads at its end or past it, then the window is empty and the diagnostic says the file is ended, naming no next byte_offset", async () => {
  await inCwd(async (cwd) => {
    const text = oneLine();
    const size = Buffer.byteLength(text);
    const path = await place(cwd, "one-line", text);
    for (const at of [size, size + 100]) {
      const got = await readAt(cwd, path, at);
      assert.equal(got.text, "", `the window at ${at} is not empty`);
      assert.match(got.notes, /\bend/i, `at ${at}: ${got.notes}`);
      assert.equal(nextOffset(got.notes), undefined, `at ${at}: ${got.notes}`);
    }
  });
});

test("given the same one-line file, when pi's read tool reads it, then it shows only its first 50KB and its diagnostic offers a bash command, never offset, and offset 2 is past the end: why the reader is que's", async () => {
  await inCwd(async (cwd) => {
    const text = oneLine();
    const bytes = Buffer.from(text, "utf8");
    const path = await place(cwd, "one-line", text);
    const piRead = defineExtension({
      name: "pi-read",
      tools: [createReadTool()],
    });
    const { of } = await chat(
      cwd,
      false,
      once(
        { name: "read", args: { path }, id: "first" },
        { name: "read", args: { path, offset: 2 }, id: "second" },
      ),
      [piRead],
    );
    const first = of("first");
    assert.ok(first, "no result of pi's read");
    const shown = Buffer.from(first.text, "utf8");
    assert.ok(shown.length <= WINDOW && shown.length > WINDOW - 4);
    assert.deepEqual(shown, bytes.subarray(0, shown.length));
    assert.match(first.notes, /bash: sed/);
    assert.doesNotMatch(first.notes, /offset=/);
    const second = of("second");
    assert.ok(second?.isError, JSON.stringify(second));
    assert.match(second.whole, /beyond end of file/);
  });
});

test("given result on or off, when an op's result is under result.max, or result is off, then the chat has it whole, no file is written, and with result off no read_result is offered", async () => {
  // Under result.max: a small one, and one over pi's own 50KB bound of a tool's output, under que's default of 20,000 tokens.
  await inCwd(async (cwd) => {
    const { of } = await chat(
      cwd,
      { max: 100 },
      once({ name: "shop-report", args: { rows: 5 }, id: "small" }),
    );
    assert.equal(of("small")?.whole, reportText(5));
    assert.deepEqual(await moved(cwd), []);
  });
  await inCwd(async (cwd) => {
    const { of } = await chat(
      cwd,
      { max: 20_000 },
      once({ name: "shop-filler", args: { chars: 54_000 }, id: "under" }),
    );
    const whole = JSON.stringify("lorem ipsum ".repeat(4500));
    assert.ok(Buffer.byteLength(whole) > WINDOW);
    assert.equal(of("under")?.whole.length, whole.length);
    assert.equal(of("under")?.whole, whole);
    assert.deepEqual(await moved(cwd), []);
  });

  // Result off: a result of about 130KB, whole, and the model is offered the op alone.
  await inCwd(async (cwd) => {
    const { tools, of } = await chat(cwd, false, once(big(5000)));
    assert.deepEqual(tools[0], ["shop-filler", "shop-report"]);
    assert.equal(of("big")?.whole.length, reportText(5000).length);
    assert.equal(of("big")?.whole, reportText(5000));
    assert.deepEqual(await moved(cwd), []);
  });
});

test("given a result moved to its file, when the model reads the pointer's path with read_result, then it gets the result back, from the run's cwd on pi's NodeExecutionEnv", async () => {
  await inCwd(async (cwd) => {
    const { of } = await chat(cwd, { max: 100 }, (requests) => {
      if (requests.length === 1) return [big(200)];
      if (requests.length !== 2) return [];
      // The model reads the path from the pointer it got.
      const pointer = requests[1]!.flatMap((m) =>
        m.role === "toolResult" && m.toolCallId === "big" ? m.content : [],
      );
      const path = pathIn(
        pointer.map((b) => (b.type === "text" ? b.text : "")).join(""),
      );
      return path
        ? [{ name: "read_result", args: { path, byte_offset: 0 }, id: "back" }]
        : [];
    });
    const back = of("back");
    assert.ok(back, "the model got no path to read");
    assert.ok(!back.isError, back.whole);
    assert.equal(back.text, reportText(200));
    assert.match(back.notes, /\bend/i);
  });
});
