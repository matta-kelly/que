/**
 * The run's attachment tools, `list_attachments` and `read_attachment`. Each run is on a Harness of its own, on pi's
 * memory storage, with que's extension of an empty catalog and the run's thread and file store. pi-ai's scripted
 * provider (`faux`) makes the model's calls, so no model is called. A file's bytes come from the real file store on
 * PGlite, and a PDF or a workbook is built in the test: the tool's behavior is the subject, not the parser's.
 */

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels, type Message } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  ToolResultEntry,
  type EntryRecord,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { PGlite } from "@electric-sql/pglite";
// The run's attachment tools read the file store; the runtime's package allowlist has held @que/files since the
// file-routes cut.
import { storeOn, type FileStore } from "@que/files";
import type { Model } from "@mku1tra/que-harness";
import { fireworks, piModel } from "@que/chat-model";
import { door } from "../../assemble/door.js";
import { eager } from "../../assemble/eager/index.js";
import { extension } from "./extension.js";

const WINDOW = 50 * 1024;
const LIST = "list_attachments";
const READ = "read_attachment";

/** What the run's attachment tools read: its thread's files, and the data directory they are under. */
type Attachments = {
  files: FileStore;
  thread: string;
  dataDir: string;
};

/**
 * The extension has the run's files as its sixth argument, after the loop's result setting as its fifth: the test
 * calls it as the run does, so a change to that argument or to the order of its parameters fails to compile.
 */
const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 64_000 }],
});
const models = createModels();
models.setProvider(faux.provider);

type Args = Parameters<typeof fauxToolCall>[1];
type ModelCall = { name: string; args: Args; id: string };

/** The content of a tool result as the model got it: `text` the tool's output, `notes` the diagnostics' messages. */
type Got = {
  isError: boolean;
  text: string;
  notes: string;
  content: readonly {
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }[];
};

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
      notes: notes.map((note) => note.message).join("\n"),
      content: message.content,
    };
  }
  return undefined;
}

/** A temporary data directory, removed when the test ends. */
async function dataDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "que-attachments-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** A database and the file store on it, both closed or removed when the test ends. */
async function openStore(t: TestContext) {
  const dir = await dataDir(t);
  const db = new PGlite();
  // Ready before the store is used: a test that only makes the tools never queries it otherwise.
  await db.query("SELECT 1");
  t.after(() => db.close());
  return { dir, files: storeOn(db, dir) };
}

/** The extension with `files` for the run's `thread`. */
function queOn({ files, thread, dataDir }: Attachments) {
  return {
    ...extension(
      [],
      door(async () => undefined),
      "ana",
      eager,
      false,
      {
        files,
        thread,
        dataDir,
      },
    ),
    name: "que",
  };
}

/** One message on a new conversation: the model makes `calls` in one turn, then answers "Done.". */
async function ask(attachments: Attachments, calls: ModelCall[]) {
  const que = queOn(attachments);
  const registry = createRegistry();
  registry.install(que);
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models,
      registry,
      settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    },
    context,
  );
  try {
    faux.setResponses([
      fauxAssistantMessage(
        calls.map(({ name, args, id }) => fauxToolCall(name, args, { id })),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(fauxText("Done.")),
    ]);
    const conversation = await harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: "fireworks", modelId: "small-model" },
          extensions: [que],
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
    return {
      of: (id: string) => resultIn(entries, id),
      tools: (que.tools ?? []) as readonly ToolRegistration[],
    };
  } finally {
    await harness.close(context);
  }
}

/** The next byte offset a window's diagnostic names. */
const nextOffset = (got: Got | undefined) => {
  const named = got?.notes.match(/byte_offset\s+(\d+)/);
  return named ? Number(named[1]) : undefined;
};

/** Whether a window's diagnostic says the file, or the sheet, ends. */
const ends = (got: Got | undefined) => /\bend\b/i.test(got?.notes ?? "");

const put = (
  files: FileStore,
  thread: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
) => files.put(thread, { name, mimeType, bytes });

/**
 * Reads windows from `offset`, each at the offset the last named, until one says the text ends. A window that names
 * `next` must start where the last ended: at the offset plus the window's bytes.
 */
async function readFrom(
  attachments: Attachments,
  file: string,
  offset: number,
  sheet?: string,
) {
  const windows: { offset: number; text: string; got: Got }[] = [];
  let at = offset;
  for (let step = 0; step < 100; step++) {
    const id = `w${step}`;
    const args: Args = { file, byte_offset: at };
    if (sheet !== undefined) args.sheet = sheet;
    const { of } = await ask(attachments, [{ name: READ, args, id }]);
    const got = of(id);
    assert.ok(got, `the model got no result of read_attachment at ${at}`);
    assert.equal(got.isError, false, got.text || got.notes);
    assert.ok(
      Buffer.byteLength(got.text) <= WINDOW,
      `the window at ${at} is ${Buffer.byteLength(got.text)} bytes`,
    );
    windows.push({ offset: at, text: got.text, got });
    const next = nextOffset(got);
    if (next === undefined) {
      assert.equal(ends(got), true, got.notes);
      return windows;
    }
    assert.equal(
      next,
      at + Buffer.byteLength(got.text),
      `the window at ${at} names ${next}: it does not start where the last ended`,
    );
    at = next;
  }
  assert.fail(`the text from ${offset} did not end in 100 windows`);
}

/** A CSV of `count` padded rows, so a window at 50KB does not reach the end. */
function csv(count: number) {
  const rows = Array.from(
    { length: count },
    (_, i) =>
      `row-${i},SO-${i},customer-${i % 97},SKU-${i % 503},${i % 17},${"x".repeat(48)}`,
  );
  return Buffer.from(
    ["row,order,customer,sku,qty,note", ...rows].join("\n") + "\n",
  );
}

/** A text file whose rows are long enough that a deep row is in a later window. */
const textFile = (count: number) =>
  Buffer.from(
    Array.from({ length: count }, (_, i) => `line ${i} ${"y".repeat(80)}`).join(
      "\n",
    ) + "\n",
  );

// ---- A PDF, built here: a text layer, or a page with no text at all. ----

function pdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const add = (text: string) => objects.push(text);
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = pages.map((content) => {
    const stream = add(
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`,
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++)
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

/** A two-page PDF with a text layer. */
const textPdf = () =>
  pdf([
    "BT /F1 18 Tf 72 720 Td (Order SO-4999 for cust-52) Tj ET\nBT /F1 12 Tf 72 690 Td (SKU-472 quantity 1) Tj ET",
    "BT /F1 18 Tf 72 720 Td (Price list page two) Tj ET\nBT /F1 12 Tf 72 690 Td (SKU-01849 costs 91) Tj ET",
  ]);

/** A PDF with a page that draws, and no text layer. */
const imageOnlyPdf = () => pdf(["0.2 0.4 0.6 rg 100 100 300 400 re f"]);

// ---- An .xlsx, built here: the smallest workbook that read-excel-file reads. ----

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A table cell: text, a number, or an Excel serial date with the workbook's date format. */
type Cell = string | number | { date: number };
type Sheet = { name: string; rows: Cell[][] };

function zip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text, "utf8");
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const cellRef = (row: number, column: number) =>
  `${String.fromCharCode(65 + column)}${row + 1}`;

function cellXml(row: number, column: number, value: Cell): string {
  const ref = cellRef(row, column);
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === "object")
    return `<c r="${ref}" s="1"><v>${value.date}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((value, c) => cellXml(r, c, value)).join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function xlsx(sheets: Sheet[]): Buffer {
  const entries: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ],
    ...sheets.map(
      (s, i) =>
        [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)] as [
          string,
          string,
        ],
    ),
  ];
  return zip(entries);
}

/** The Orders sheet's rows: a header and 5,000 orders. */
const ordersRows = (): Cell[][] => [
  ["order", "customer", "sku", "qty"],
  ...Array.from({ length: 5000 }, (_, i) => [
    `SO${i + 1}`,
    `cust-${i % 97}`,
    `SKU-${i % 503}`,
    i % 17,
  ]),
];

/** The Orders sheet's text as read_attachment gives it: a row a line, a cell a tab-separated value. */
const ordersText = () =>
  ordersRows()
    .map((row) => row.map((value) => String(value)).join("\t"))
    .join("\n");

/** A workbook with a 5,000-row Orders sheet and a Prices sheet of text, escapes and a date. */
function workbook() {
  const prices: Cell[][] = [
    ["sku", "price"],
    ["SKU-1", 11],
    ["literal", String.raw`\t`],
    ["tab", "a\tb"],
    ["path", String.raw`C:\temp`],
    ["both", "a\tb\nc"],
    ["date", { date: 45292 }],
  ];
  return xlsx([
    { name: "Orders", rows: ordersRows() },
    { name: "Prices", rows: prices },
  ]);
}

// ---- The tools. ----

test("given the run's extension, when it is asked for its tools, then it offers list_attachments and read_attachment, and read_attachment takes a file id, an optional sheet and a byte offset, never a path", async (t) => {
  // given: the run's files
  const { dir, files } = await openStore(t);

  // when: the extension is built for the run's thread
  const que = queOn({ files, thread: "T", dataDir: dir });
  const tools = (que.tools ?? []) as readonly ToolRegistration[];
  const list = tools.find((tool) => tool.name === LIST);
  const read = tools.find((tool) => tool.name === READ);

  // then: both are offered
  assert.ok(
    list,
    `the extension offers ${tools.map((tool) => tool.name).join(", ")}`,
  );
  assert.ok(
    read,
    `the extension offers ${tools.map((tool) => tool.name).join(", ")}`,
  );
  const schema = read.parameters as unknown as {
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
  };
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "byte_offset",
    "file",
    "sheet",
  ]);
  assert.ok(schema.required.includes("file"));
  assert.ok(schema.required.includes("byte_offset"));
  assert.equal("path" in schema.properties, false);
});

test("given a thread with two files and another thread with one, when list_attachments runs, then it gives each of the thread's files by id, name, mime and size, and none of the other thread's", async (t) => {
  // given: a CSV and a PNG for T, and a workbook for U
  const { dir, files } = await openStore(t);
  const csvFile = await put(files, "T", "../order.csv", "text/csv", csv(3));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const photo = await put(files, "T", "photo.png", "image/png", png);
  const theirs = await put(
    files,
    "U",
    "theirs.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    workbook(),
  );

  // when: the run on T lists its attachments
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: LIST, args: {}, id: "list" },
  ]);
  const got = of("list");

  // then: each of T's files is named with its metadata, and U's is not
  assert.ok(got, "the model got no result of list_attachments");
  assert.equal(got.isError, false, got.text);
  for (const file of [csvFile, photo]) {
    assert.match(got.text, new RegExp(file.id));
    assert.ok(got.text.includes(file.name), got.text);
    assert.ok(got.text.includes(file.mimeType), got.text);
    assert.ok(got.text.includes(String(file.size)), got.text);
  }
  assert.equal(got.text.includes(theirs.id), false, got.text);
  assert.equal(got.text.includes("theirs.xlsx"), false, got.text);
});

test("given a CSV over 50KB, when read_attachment reads a window, then it gives at most 50KB, names the next offset, a later window holds a deep row, and a window at the end says the file ends", async (t) => {
  // given: a CSV of 1,200 rows, about 120KB
  const { dir, files } = await openStore(t);
  const bytes = csv(1200);
  assert.ok(bytes.length > 2 * WINDOW, `${bytes.length} bytes`);
  const file = await put(files, "T", "orders.csv", "text/csv", bytes);

  // when: the first window is read
  const first = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: 0 }, id: "one" },
  ]);
  const one = first.of("one");

  // then: it is at most 50KB, and its diagnostic names the next offset
  assert.ok(one, "the model got no result of read_attachment");
  assert.equal(one.isError, false, one.text);
  assert.ok(
    Buffer.byteLength(one.text) <= WINDOW,
    `${Buffer.byteLength(one.text)} bytes`,
  );
  const next = nextOffset(one);
  assert.ok(next !== undefined && next > 0, one.notes);

  // when: the next window is read
  const second = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: next }, id: "two" },
  ]);
  const two = second.of("two");

  // then: it holds a row deep in the file
  assert.ok(two, "the model got no result of the second window");
  assert.equal(two.isError, false, two.text);
  assert.ok(
    two.text.includes("row-800,"),
    `the second window has no deep row: ${two.text.slice(0, 200)}`,
  );

  // when: a window at the end is read
  const last = await ask({ files, thread: "T", dataDir: dir }, [
    {
      name: READ,
      args: { file: file.id, byte_offset: bytes.length - 10 },
      id: "last",
    },
  ]);

  // then: it says the file ends
  assert.ok(last.of("last"), "the model got no result of the last window");
  assert.equal(ends(last.of("last")), true, last.of("last")?.notes);
});

test("given a text file over 50KB, when read_attachment reads two windows, then each is at most 50KB, the next offset is named, and a deep line is in the second", async (t) => {
  // given: a text file of 1,200 lines
  const { dir, files } = await openStore(t);
  const bytes = textFile(1200);
  const file = await put(files, "T", "notes.txt", "text/plain", bytes);

  // when: the first window is read
  const opening = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: 0 }, id: "one" },
  ]);
  const one = opening.of("one");
  assert.ok(one, "the model got no result of read_attachment");
  assert.equal(one.isError, false, one.text);
  assert.ok(Buffer.byteLength(one.text) <= WINDOW);
  const next = nextOffset(one);
  assert.ok(next !== undefined, one.notes);

  // when: the next window is read
  const deeper = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: next }, id: "two" },
  ]);
  const two = deeper.of("two");

  // then: it holds a line deep in the file
  assert.ok(two, "the model got no result of the second window");
  assert.equal(two.isError, false, two.text);
  assert.ok(two.text.includes("line 800 "), two.text.slice(0, 200));
});

test("given a PDF with a text layer, when read_attachment reads it, then it gives the extracted text of every page", async (t) => {
  // given: a two-page PDF
  const { dir, files } = await openStore(t);
  const file = await put(
    files,
    "T",
    "prices.pdf",
    "application/pdf",
    textPdf(),
  );

  // when: it is read at offset 0
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: 0 }, id: "pdf" },
  ]);
  const got = of("pdf");

  // then: the text of each page is in the window
  assert.ok(got, "the model got no result of read_attachment");
  assert.equal(got.isError, false, got.text);
  assert.ok(got.text.includes("Order SO-4999 for cust-52"), got.text);
  assert.ok(got.text.includes("SKU-472 quantity 1"), got.text);
  assert.ok(got.text.includes("Price list page two"), got.text);
  assert.ok(got.text.includes("SKU-01849 costs 91"), got.text);
  assert.ok(Buffer.byteLength(got.text) <= WINDOW);
});

test("given a PDF with no text layer, when read_attachment reads it, then it fails with a message that says the PDF has no text, not a bug", async (t) => {
  // given: a PDF whose page draws and has no text
  const { dir, files } = await openStore(t);
  const file = await put(
    files,
    "T",
    "scan.pdf",
    "application/pdf",
    imageOnlyPdf(),
  );

  // when: it is read
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: 0 }, id: "pdf" },
  ]);
  const got = of("pdf");

  // then: the call fails, says it has no text, and shows no library or bug text
  assert.ok(got, "the model got no result of read_attachment");
  assert.equal(got.isError, true, got.text);
  assert.match(got.text, /\bno text\b/i);
  assert.doesNotMatch(got.text, /\bbug\b|TypeError|Error:|Cannot read/i);
});

test("given a workbook, when read_attachment is called with no sheet, then it gives each sheet's name and row count", async (t) => {
  // given: an Orders sheet of 5,001 rows and a Prices sheet of 7
  const { dir, files } = await openStore(t);
  const file = await put(
    files,
    "T",
    "book.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    workbook(),
  );

  // when: it is read with no sheet
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: 0 }, id: "book" },
  ]);
  const got = of("book");

  // then: each sheet is named with its row count
  assert.ok(got, "the model got no result of read_attachment");
  assert.equal(got.isError, false, got.text);
  assert.match(got.text, /Orders/);
  assert.match(got.text, /Prices/);
  assert.match(got.text, /\b5001\b/);
  assert.match(got.text, /\b7\b/);
});

test("given a named sheet, when read_attachment reads a window, then rows are one per line, cells are tab-separated text, dates are ISO 8601, and the next offset and the end are named", async (t) => {
  // given: a workbook whose Prices sheet has a few rows and a date
  const { dir, files } = await openStore(t);
  const bytes = workbook();
  const file = await put(
    files,
    "T",
    "book.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes,
  );

  // when: the named sheet is read
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    {
      name: READ,
      args: { file: file.id, sheet: "Prices", byte_offset: 0 },
      id: "prices",
    },
  ]);
  const got = of("prices");

  // then: each row is one line, and each cell is one tab-separated value
  assert.ok(got, "the model got no result of read_attachment");
  assert.equal(got.isError, false, got.text || got.notes);
  const lines = got.text.split("\n");
  assert.deepEqual(lines.slice(0, 3), [
    "sku\tprice",
    "SKU-1\t11",
    "literal\t\\\\t",
  ]);
  assert.deepEqual(lines.slice(3, 5), ["tab\ta\\tb", "path\tC:\\\\temp"]);
  assert.equal(lines.length, 7, got.text);
  assert.ok(
    lines.every((line) => line.split("\t").length === 2),
    got.text,
  );
  assert.match(lines[5] ?? "", /^both\ta\\tb\\nc$/);
  assert.match(lines[6] ?? "", /^date\t2024-01-01/);
  assert.ok(ends(got) || nextOffset(got) !== undefined, got.notes);
});

test("given a sheet over 50KB, when read_attachment reads windows, then each is at most 50KB, a later window holds a row deep in the sheet, and a window at the end says the sheet ends", async (t) => {
  // given: a workbook whose Orders sheet is over two windows
  const { dir, files } = await openStore(t);
  const bytes = workbook();
  assert.ok(bytes.length > 2 * WINDOW, `${bytes.length} bytes`);
  const file = await put(
    files,
    "T",
    "book.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes,
  );

  // when: the sheet is read from offset 0 and each window's named offset is followed to the end
  const windows = await readFrom(
    { files, thread: "T", dataDir: dir },
    file.id,
    0,
    "Orders",
  );
  const whole = windows.map(({ text }) => text).join("");

  // then: each window is at most 50KB, a later one holds a row deep in the sheet, and the last says the sheet ends
  assert.ok(windows.length > 1, `${windows.length} window`);
  assert.ok(whole.includes("SO3000"), whole.slice(0, 200));
  const last = windows.at(-1);
  assert.ok(last, "no window was read");
  assert.equal(ends(last.got), true, last.got.notes);
});

test("given a CSV and a named sheet over 50KB, when read_attachment reads each from offset 0 and follows each window's next offset to the end, then window N+1 starts where window N ended and the windows join into the whole text with no gap or overlap", async (t) => {
  // given: a CSV of 1,200 rows, and a workbook whose Orders sheet is over two windows
  const { dir, files } = await openStore(t);
  const csvBytes = csv(1200);
  const csvFile = await put(files, "T", "orders.csv", "text/csv", csvBytes);
  const book = await put(
    files,
    "T",
    "book.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    workbook(),
  );

  // when: each is read from offset 0, following each window's next offset to the end
  const attachments = { files, thread: "T", dataDir: dir };
  const ofCsv = await readFrom(attachments, csvFile.id, 0);
  const ofSheet = await readFrom(attachments, book.id, 0, "Orders");

  // then: each window starts where the last ended (readFrom holds it), and the windows join with no gap or overlap
  assert.ok(ofCsv.length > 2, `${ofCsv.length} CSV windows`);
  assert.ok(ofSheet.length > 1, `${ofSheet.length} sheet windows`);
  assert.deepEqual(
    ofCsv.map(({ text }) => text).join(""),
    csvBytes.toString("utf8"),
  );
  assert.deepEqual(ofSheet.map(({ text }) => text).join(""), ordersText());
});

test("given a sheet name the workbook does not have, when read_attachment is called with it, then it fails and lists the names it does have", async (t) => {
  // given: a workbook with Orders and Prices
  const { dir, files } = await openStore(t);
  const file = await put(
    files,
    "T",
    "book.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    workbook(),
  );

  // when: it is read with a sheet name that is not one of them
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    {
      name: READ,
      args: { file: file.id, sheet: "Nope", byte_offset: 0 },
      id: "bad",
    },
  ]);
  const got = of("bad");

  // then: the call fails, and the names it has are there
  assert.ok(got, "the model got no result of read_attachment");
  assert.equal(got.isError, true, got.text);
  assert.match(got.text, /\bOrders\b/);
  assert.match(got.text, /\bPrices\b/);
});

test("given something that is not a workbook and a workbook with no sheets, when read_attachment reads them, then each is a failed call that says the workbook is corrupt or has no readable sheets, and the library's text is not shown", async (t) => {
  // given: bytes that are not a zip, and a workbook with no sheets
  const { dir, files } = await openStore(t);
  const notZip = await put(
    files,
    "T",
    "broken.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    Buffer.from("not a zip"),
  );
  const empty = await put(
    files,
    "T",
    "empty.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsx([]),
  );

  // when: each is read
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: notZip.id, byte_offset: 0 }, id: "broken" },
    { name: READ, args: { file: empty.id, byte_offset: 0 }, id: "empty" },
  ]);

  // then: each fails with the tool's own message, and not the library's
  for (const id of ["broken", "empty"]) {
    const got = of(id);
    assert.ok(got, `the model got no result of ${id}`);
    assert.equal(got.isError, true, got.text);
    assert.match(got.text, /corrupt|no readable sheets/i);
    assert.doesNotMatch(
      got.text,
      /Doesn't look like|readFiles|central directory/i,
    );
  }
});

test("given a PNG and a JPEG, when read_attachment reads each, then it gives one image block with the same bytes and mime type", async (t) => {
  // given: a PNG and a JPEG with their mime types
  const { dir, files } = await openStore(t);
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
  ]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const picture = await put(files, "T", "photo.png", "image/png", png);
  const photo = await put(files, "T", "photo.jpg", "image/jpeg", jpeg);

  // when: each is read
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: picture.id, byte_offset: 0 }, id: "png" },
    { name: READ, args: { file: photo.id, byte_offset: 0 }, id: "jpeg" },
  ]);

  // then: each result is one image block with that file's bytes and mime type
  for (const [id, bytes, mimeType] of [
    ["png", png, "image/png"],
    ["jpeg", jpeg, "image/jpeg"],
  ] as const) {
    const got = of(id);
    assert.ok(got, `the model got no result of ${id}`);
    assert.equal(got.isError, false, got.text);
    assert.equal(got.content.length, 1, JSON.stringify(got.content));
    assert.deepEqual(got.content[0], {
      type: "image",
      data: bytes.toString("base64"),
      mimeType,
    });
  }
});

test("given a text-only model, when its next request holds the image block read_attachment gave it, then pi sends the placeholder for a tool image", async (t) => {
  // The provider is made with a key, and calls the global fetch.
  process.env.FIREWORKS_API_KEY ??= "none";
  // given: a PNG that read_attachment gives as an image block
  const { dir, files } = await openStore(t);
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x03,
  ]);
  const file = await put(files, "T", "photo.png", "image/png", png);
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: file.id, byte_offset: 0 }, id: "png" },
  ]);
  const got = of("png");
  assert.ok(got, "the model got no result of read_attachment");
  assert.equal(got.isError, false, got.text || got.notes);

  // when: the tool result goes to a model whose catalog entry is text alone
  const config: Model = {
    name: "small",
    type: "model",
    description: "A text-only model of a test.",
    id: "fireworks:small-model",
    window: 64_000,
    maxTokens: 8_000,
  };
  const piConfig = piModel(config);
  const modelSet = createModels();
  modelSet.setProvider(fireworks([config]));
  const sent: Record<string, unknown>[] = [];
  const send = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      'data: {"choices":[{"delta":{"content":"seen"}}]}\n\ndata: [DONE]\n\n',
      {
        headers: { "content-type": "text/event-stream" },
      },
    );
  };
  try {
    const messages: Message[] = [
      { role: "user", content: "What is in the file?", timestamp: 1 },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "png",
            name: READ,
            arguments: { file: file.id, byte_offset: 0 },
          },
        ],
        api: piConfig.api,
        provider: piConfig.provider,
        model: piConfig.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "toolUse",
        timestamp: 1,
      },
      {
        role: "toolResult",
        toolCallId: "png",
        toolName: READ,
        content: got.content.map((block) =>
          block.type === "image"
            ? {
                type: "image" as const,
                data: block.data ?? "",
                mimeType: block.mimeType ?? "",
              }
            : { type: "text" as const, text: block.text ?? "" },
        ),
        isError: false,
        timestamp: 1,
      },
    ];
    await modelSet.completeSimple(piConfig, { messages });
  } finally {
    globalThis.fetch = send;
  }

  // then: the text-only request has pi's placeholder, and no image
  const tool = (
    (sent[0]?.messages as { role: string; content: unknown }[]) ?? []
  ).find((message) => message.role === "tool");
  assert.equal(
    tool?.content,
    "(tool image omitted: model does not support images)",
  );
});

test("given a missing id, a malformed id and another thread's file id, when read_attachment reads each, then each fails with a message that names the id and the thread, and no store path or file system error", async (t) => {
  // given: a file of another thread
  const { dir, files } = await openStore(t);
  const theirs = await put(files, "U", "theirs.csv", "text/csv", csv(2));

  // when: read_attachment is given an id that is not there, one that looks like a path, and another thread's id
  const { of } = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: "missing-id", byte_offset: 0 }, id: "missing" },
    {
      name: READ,
      args: { file: "../../etc/passwd", byte_offset: 0 },
      id: "path",
    },
    { name: READ, args: { file: theirs.id, byte_offset: 0 }, id: "other" },
  ]);

  // then: each fails, names its id and the thread, and shows no path or file system error
  for (const [id, named] of [
    ["missing", "missing-id"],
    ["path", "../../etc/passwd"],
    ["other", theirs.id],
  ] as const) {
    const got = of(id);
    assert.ok(got, `the model got no result of ${id}`);
    assert.equal(got.isError, true, got.text);
    assert.ok(got.text.includes(named), got.text);
    assert.match(got.text, /\bT\b/);
    assert.doesNotMatch(
      got.text,
      /ENOENT|EACCES|files\/|theirs\.csv|\.\.\/\.\.\/etc\/passwd"/,
    );
  }
});

test("given a PDF and a workbook, when read_attachment reads them, then their text is cached under the file's folder by sheet position, a second read uses the cache, and remove deletes it", async (t) => {
  // given: a PDF and a workbook for T
  const { dir, files } = await openStore(t);
  const thePdf = await put(
    files,
    "T",
    "prices.pdf",
    "application/pdf",
    textPdf(),
  );
  const book = await put(
    files,
    "T",
    "book.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    workbook(),
  );
  const folder = join(dir, "files", "T", thePdf.id);

  // when: the PDF is read twice
  await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: thePdf.id, byte_offset: 0 }, id: "one" },
  ]);
  const cached = await readFile(join(folder, "text"), "utf8").catch(
    () => undefined,
  );
  assert.ok(
    cached !== undefined,
    "read_attachment wrote no text cache for the PDF",
  );
  assert.match(cached, /Order SO-4999/);
  await writeFile(join(folder, "text"), "CACHED PDF TEXT");
  const again = await ask({ files, thread: "T", dataDir: dir }, [
    { name: READ, args: { file: thePdf.id, byte_offset: 0 }, id: "two" },
  ]);

  // then: the second read is the cache, and still names that the PDF ends
  assert.equal(again.of("two")?.text, "CACHED PDF TEXT");
  assert.equal(
    ends(again.of("two")),
    true,
    `the cached PDF read names no end:\n${again.of("two")?.notes}`,
  );

  // when: two sheets of the workbook are read
  await ask({ files, thread: "T", dataDir: dir }, [
    {
      name: READ,
      args: { file: book.id, sheet: "Orders", byte_offset: 0 },
      id: "orders",
    },
    {
      name: READ,
      args: { file: book.id, sheet: "Prices", byte_offset: 0 },
      id: "prices",
    },
  ]);

  // then: the sheets are in the file's folder by position, not by name
  const sheets = join(dir, "files", "T", book.id, "sheets");
  const names = await readdir(sheets).catch(() => []);
  assert.deepEqual(names.sort(), ["0.text", "1.text"]);
  assert.match(await readFile(join(sheets, "0.text"), "utf8"), /SO1/);
  assert.match(await readFile(join(sheets, "1.text"), "utf8"), /SKU-1/);
  await writeFile(join(sheets, "0.text"), "CACHED SHEET TEXT");
  const cachedSheet = await ask({ files, thread: "T", dataDir: dir }, [
    {
      name: READ,
      args: { file: book.id, sheet: "Orders", byte_offset: 0 },
      id: "again",
    },
  ]);
  assert.equal(cachedSheet.of("again")?.text, "CACHED SHEET TEXT");
  assert.equal(
    ends(cachedSheet.of("again")),
    true,
    `the cached sheet read names no end:\n${cachedSheet.of("again")?.notes}`,
  );

  // when: the files are removed
  await files.remove("T", thePdf.id);
  await files.remove("T", book.id);

  // then: their folders, caches and all, are gone
  await assert.rejects(readdir(folder), { code: "ENOENT" });
  await assert.rejects(readdir(join(dir, "files", "T", book.id)), {
    code: "ENOENT",
  });
});
