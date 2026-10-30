/**
 * The run's attachment tools: `list_attachments` names the files of the run's thread, and `read_attachment` reads one
 * of them by its id, never by a path. A text file or a CSV is read in windows of bytes from an offset; a PDF's text
 * and a workbook's sheets are extracted once and cached in the file's folder, then read in the same windows; a PNG or
 * a JPEG is given to the model as one image block.
 *
 * The store decides which files are the thread's, so an id from another thread is a failed call that names the id and
 * the thread, and no store path reaches the model. The readers follow result.ts: a window is at most 50KB, cut on a
 * character boundary, and names the byte offset of the next one, or says the text ends.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context } from "@earendil-works/chord/context";
import type { TSchema } from "@earendil-works/pi-ai";
import type {
  ToolExecutionApi,
  ToolExecutionResult,
  ToolRegistration,
} from "@earendil-works/pi-durable";
import readExcelFile from "read-excel-file/node";
import { extractText } from "unpdf";
import * as z from "zod";
import { OpFailed } from "@mku1tra/que-plugin";
import type { FileStore, FileWithBytes } from "@que/files";
import { answered, failed } from "./repeat.js";

export const LIST_ATTACHMENTS = "list_attachments";
export const READ_ATTACHMENT = "read_attachment";

/** The most bytes of one window: pi's own read limit (`DEFAULT_MAX_BYTES`, `dist/truncate.js`). */
const WINDOW = 50 * 1024;

/** The bytes a window leaves for its diagnostic, which pi appends to the model's text. */
const HEADROOM = 512;

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CORRUPT = "the workbook is corrupt or has no readable sheets";

/** A schema's input side as JSON Schema, which pi-ai takes as it is (no TypeBox kind). */
const schemaOf = (schema: z.core.$ZodType) =>
  z.toJSONSchema(schema, { io: "input" }) as unknown as TSchema;

/** What the run's attachment tools read: its thread's files, and the data directory they are under. */
export type Attachments = {
  files: FileStore;
  thread: string;
  dataDir: string;
};

/** The details of a tool result that a bug made, and not the call. */
const BUG = { que: "bug" } as const;

export const readAttachmentSchema = z.strictObject({
  file: z.string().describe("A file id from list_attachments"),
  sheet: z
    .string()
    .optional()
    .describe("A sheet's name, for an .xlsx: none names the workbook's sheets"),
  byte_offset: z
    .number()
    .int()
    .min(0)
    .describe(
      "The byte the window starts at: 0, or the one the last window named",
    ),
});

export const listAttachmentsSchema = z.strictObject({});

/** A character's start at or before `at`: a UTF-8 continuation byte is never one. */
function charStart(bytes: Uint8Array, at: number) {
  while (at > 0 && ((bytes[at] ?? 0) & 0xc0) === 0x80) at--;
  return at;
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** The file `id` of the run's thread, or a failed call that names the id and the thread. */
async function fileAt(
  { files, thread }: Attachments,
  id: string,
): Promise<FileWithBytes> {
  const file = await files.get(thread, id);
  if (!file)
    throw new OpFailed(
      `no file ${id} in thread ${thread}: it is not one of this thread's attachments`,
    );
  return file;
}

/** The file's folder under the data directory: the store's id alone names a path component. */
const folderOf = ({ dataDir, thread }: Attachments, { id }: FileWithBytes) =>
  join(dataDir, "files", thread, id);

/** One window of `text` from `offset`, at most WINDOW minus its diagnostic, cut on a character boundary. */
function windowOf(text: string, offset: number) {
  const bytes = new TextEncoder().encode(text);
  const size = WINDOW - HEADROOM;
  const chunk = bytes.subarray(offset, offset + size + 1);
  const goesOn = chunk.length > size;
  const end = goesOn ? charStart(chunk, size) : chunk.length;
  return {
    text: decode(chunk.subarray(0, end)),
    next: goesOn ? offset + end : undefined,
  };
}

/** Names the next window's byte offset, or says the text ends. */
function named(api: ToolExecutionApi, what: string, next: number | undefined) {
  api.diagnostic({
    severity: "info",
    message:
      next === undefined
        ? `This is the end of the ${what}: it has no more bytes.`
        : `The ${what} goes on: read the next window at byte_offset ${next}.`,
  });
}

/** The cached text at `path`, when it is there. */
const cached = (path: string) => readFile(path, "utf8").catch(() => undefined);

/** A PDF's text: the cache, or `extractText`'s text of every page, cached for the next read. */
async function pdfText(
  attachments: Attachments,
  file: FileWithBytes,
): Promise<string> {
  const path = join(folderOf(attachments, file), "text");
  const kept = await cached(path);
  if (kept !== undefined) return kept;
  const { text } = (await extractText(new Uint8Array(file.bytes), {
    mergePages: false,
  })) as {
    text: string[];
  };
  const whole = text.join("\n");
  if (whole.trim() === "")
    throw new OpFailed(
      "the PDF has no text: it has no text layer, so there is nothing to read",
    );
  await writeFile(path, whole, "utf8");
  return whole;
}

type Row = readonly unknown[];
type Sheet = { sheet: string; data: Row[] };

/** The workbook's sheets, or a failed call that never shows the library's own error text. */
async function workbookOf(file: FileWithBytes): Promise<Sheet[]> {
  let sheets: Sheet[];
  try {
    sheets = (await readExcelFile(Buffer.from(file.bytes), {
      trim: false,
    })) as Sheet[];
  } catch {
    throw new OpFailed(CORRUPT);
  }
  if (sheets.length === 0) throw new OpFailed(CORRUPT);
  return sheets;
}

/** A cell as text: a date as ISO 8601, and the characters that would add a column or a row written as escapes. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n");
}

/** A sheet as text: a row a line, a cell a tab-separated value, and no line after the last row. */
const sheetText = (rows: readonly Row[]) =>
  rows.map((row) => row.map(cellText).join("\t")).join("\n");

/** A sheet's cached text: the cache, or every sheet's text written on the first read of one. */
async function sheetAt(
  attachments: Attachments,
  file: FileWithBytes,
  name: string,
): Promise<string> {
  const folder = join(folderOf(attachments, file), "sheets");
  const sheets = await workbookOf(file);
  const index = sheets.findIndex((sheet) => sheet.sheet === name);
  if (index === -1)
    throw new OpFailed(
      `the workbook has no sheet named ${name}: its sheets are ${sheets
        .map((sheet) => sheet.sheet)
        .join(", ")}`,
    );
  const kept = await cached(join(folder, `${index}.text`));
  if (kept !== undefined) return kept;
  await mkdir(folder, { recursive: true });
  await Promise.all(
    sheets.map((sheet, at) =>
      writeFile(join(folder, `${at}.text`), sheetText(sheet.data), "utf8"),
    ),
  );
  return sheetText(sheets[index].data);
}

/** The image block for a PNG or a JPEG, with its bytes and its mime type. */
const imageOf = (file: FileWithBytes) => [
  {
    type: "image" as const,
    data: Buffer.from(file.bytes).toString("base64"),
    mimeType: file.mimeType,
  },
];

/**
 * A tool's run, the call of `name` with `args`, as its output: a failed call with an OpFailed's text. Any other throw
 * is a bug: the result holds none of its text, and ends the run with no other model request.
 */
async function outcome(
  name: string,
  args: unknown,
  run: () => Promise<ToolExecutionResult["output"]>,
  api: ToolExecutionApi,
  context: Context,
): Promise<ToolExecutionResult> {
  const call = `${name}(${JSON.stringify(args)})`;
  try {
    const output = await run();
    await answered(call, api, context);
    return { output };
  } catch (error) {
    if (error instanceof OpFailed)
      return failed(call, error.message, api, context);
    return {
      isError: true,
      output: [{ type: "text", text: "the tool failed" }],
      details: BUG,
      control: { terminate: true },
    };
  }
}

/** The text a read gives, with its window's diagnostic: the next offset, or that the text ends. */
function windowed(
  api: ToolExecutionApi,
  what: string,
  text: string,
  offset: number,
) {
  const { text: window, next } = windowOf(text, offset);
  named(api, what, next);
  return window;
}

function readAttachment({
  files,
  thread,
  dataDir,
}: Attachments): ToolRegistration {
  return {
    name: READ_ATTACHMENT,
    description:
      "Read one of this thread's attachments by its id, one window of at most 50KB at a time. Start at byte_offset 0; each window names the byte offset of the next, and the last says the text ends. An .xlsx with no sheet names its sheets and each one's row count. A PNG or a JPEG is given as an image.",
    parameters: schemaOf(readAttachmentSchema),
    outputLimits: { maxBytes: WINDOW, maxLines: Infinity },
    execute: (args, api, context) =>
      outcome(
        READ_ATTACHMENT,
        args,
        async () => {
          const {
            file: id,
            sheet,
            byte_offset,
          } = args as z.infer<typeof readAttachmentSchema>;
          const file = await fileAt({ files, thread, dataDir }, id);
          if (file.mimeType.startsWith("image/")) return imageOf(file);
          if (file.mimeType === "application/pdf")
            return [
              {
                type: "text",
                text: windowed(
                  api,
                  "PDF",
                  await pdfText({ files, thread, dataDir }, file),
                  byte_offset,
                ),
              },
            ];
          if (file.mimeType === XLSX) {
            const attachments = { files, thread, dataDir };
            if (sheet === undefined) {
              const sheets = await workbookOf(file);
              return [
                {
                  type: "text",
                  text: sheets
                    .map((s) => `${s.sheet}\t${s.data.length} rows`)
                    .join("\n"),
                },
              ];
            }
            return [
              {
                type: "text",
                text: windowed(
                  api,
                  `sheet ${sheet}`,
                  await sheetAt(attachments, file, sheet),
                  byte_offset,
                ),
              },
            ];
          }
          return [
            {
              type: "text",
              text: windowed(api, "file", decode(file.bytes), byte_offset),
            },
          ];
        },
        api,
        context,
      ),
  };
}

function listAttachments({ files, thread }: Attachments): ToolRegistration {
  return {
    name: LIST_ATTACHMENTS,
    description:
      "List the files attached to this thread: each one's id, name, mime type and size in bytes. Read one with read_attachment by its id.",
    parameters: schemaOf(listAttachmentsSchema),
    outputLimits: { maxBytes: Infinity, maxLines: Infinity },
    execute: (args, api, context) =>
      outcome(
        LIST_ATTACHMENTS,
        args,
        async () => {
          const held = await files.list(thread);
          return [
            {
              type: "text",
              text: held.length
                ? held
                    .map(
                      (file) =>
                        `${file.id}\t${file.name}\t${file.mimeType}\t${file.size}`,
                    )
                    .join("\n")
                : "This thread has no files.",
            },
          ];
        },
        api,
        context,
      ),
  };
}

/** The run's attachment tools, on its thread's files. */
export function attachmentTools(attachments: Attachments): ToolRegistration[] {
  return [listAttachments(attachments), readAttachment(attachments)];
}
