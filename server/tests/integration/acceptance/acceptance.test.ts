/**
 * The issue's acceptance test: que's server, on a fixture deployment and a
 * faux model, carries a thread's four attachments from an upload through the
 * agent's reader and a domain op to the model's transcript and its reply;
 * keeps them from another signed-in user; and keeps them across a stopped
 * server and a started one on the same database and data directory.
 *
 * Each server is a process of its own (serve.child.ts), on a PGlite database
 * served on a local port, with pi-ai's scripted provider (`faux`) under
 * Fireworks' provider id on the deployment's image-capable model. No model is
 * called.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { Message } from "@earendil-works/pi-ai";
import { deploymentRoot } from "../../deployment-root.js";
import {
  CSV,
  csvOffsetAt,
  csvRows,
  ordersOffsetAt,
  ordersRows,
  PDF,
  PDF_TEXT,
  PNG,
  sheetText,
  XLSX,
} from "./fixtures.js";
import {
  makeThread,
  requestsOf,
  runOn,
  scripted,
  startAgain,
  stop,
  upload,
  type Running,
  type Step,
} from "./server.js";

const ANA = "ana@example.com";
const BO = "bo@example.com";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
const data = mkdtempSync(join(tmpdir(), "que-acceptance-"));

// A child runs node, not npm, so it is given the source condition npm would give it.
const nodeOptions = [
  process.env.NODE_OPTIONS,
  "--conditions=@mku1tra/que-source",
]
  .filter(Boolean)
  .join(" ");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres@${database.getServerConn()}/postgres`,
  QUE_CREDENTIALS_KEY: randomBytes(32).toString("base64"),
  QUE_DEPLOYMENT: deploymentRoot(
    join(import.meta.dirname, "fixtures"),
    "acceptance",
  ),
  QUE_DATA_DIR: data,
  NODE_OPTIONS: nodeOptions,
};

const children = new Set<ChildProcess>();

after(async () => {
  for (const proc of children) proc.kill("SIGKILL");
  // A killed server's socket closes a moment later, and the socket server then asks the database of its transaction.
  await new Promise((later) => setTimeout(later, 500));
  await database.stop();
  await db.close();
  rmSync(data, { recursive: true, force: true });
});

/** Every tool result of the call `id`, as the model got it: its blocks, and its text blocks joined. */
function resultOf(requests: Message[][], id: string) {
  for (const messages of requests) {
    for (const message of messages)
      if (message.role === "toolResult" && message.toolCallId === id) {
        const texts = message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text);
        return { isError: message.isError, texts, content: message.content };
      }
  }
  return undefined;
}

/** The text a tool result's own output holds: its first text block, not its diagnostics. */
function outputOf(requests: Message[][], id: string): string {
  const result = resultOf(requests, id);
  assert.ok(result, `the model got no result of the call ${id}`);
  assert.equal(result.isError, false, `the call ${id} failed: ${result.texts}`);
  return result.texts[0] ?? "";
}

/** The assistant text an AG-UI run's stream carried, from its deltas. */
function replyOf(stream: string): string {
  let reply = "";
  for (const line of stream.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const event = JSON.parse(line.slice("data:".length)) as {
      type?: string;
      delta?: string;
    };
    if (event.type === "TEXT_MESSAGE_CONTENT") reply += event.delta ?? "";
  }
  return reply;
}

/** Uploads the four files to the thread: a CSV, a workbook, a PDF and a PNG. */
async function attach(server: Running, thread: string) {
  return {
    csv: await upload(server, thread, "orders.csv", "text/csv", CSV()),
    xlsx: await upload(
      server,
      thread,
      "orders.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      XLSX(),
    ),
    pdf: await upload(
      server,
      thread,
      "price-list.pdf",
      "application/pdf",
      PDF(),
    ),
    png: await upload(server, thread, "photo.png", "image/png", PNG()),
  };
}

const csvDeepRow = csvRows()[1_500]!;
const ordersDeepRow = sheetText(ordersRows().slice(4_000, 4_001));
const pricesText = sheetText([
  ["sku", "price"],
  ["SKU-1", 11],
  ["SKU-2", 12],
]);
const CSV_OFFSET = csvOffsetAt(1_500);
const ORDERS_OFFSET = ordersOffsetAt(4_000);

/** The reply the run's faux model gives: it names every file's row, its text and the count. */
const REPLY = `The CSV has ${csvRows().length - 1} rows, and row 1500 is ${csvDeepRow}. The Prices sheet is ${pricesText.replace(/\n/g, " / ")}. Orders row 4000 is ${ordersDeepRow}. The PDF says ${PDF_TEXT.replace(/\n/g, " / ")}. The image is a PNG.`;

/** The steps of a run that reads all four files and counts the CSV's rows: each call's result is checked later. */
function readEveryFile(files: Awaited<ReturnType<typeof attach>>): Step[] {
  return [
    {
      tool: {
        name: "list_attachments",
        arguments: {},
        id: "list",
      },
    },
    {
      tool: {
        name: "read_attachment",
        arguments: { file: files.csv.id, byte_offset: CSV_OFFSET },
        id: "csv",
      },
    },
    {
      tool: {
        name: "read_attachment",
        arguments: {
          file: files.xlsx.id,
          sheet: "Prices",
          byte_offset: 0,
        },
        id: "prices",
      },
    },
    {
      tool: {
        name: "read_attachment",
        arguments: {
          file: files.xlsx.id,
          sheet: "Orders",
          byte_offset: ORDERS_OFFSET,
        },
        id: "orders",
      },
    },
    {
      tool: {
        name: "read_attachment",
        arguments: { file: files.pdf.id, byte_offset: 0 },
        id: "pdf",
      },
    },
    {
      tool: {
        name: "read_attachment",
        arguments: { file: files.png.id, byte_offset: 0 },
        id: "image",
      },
    },
    {
      tool: {
        name: "rows-count",
        arguments: { file: files.csv.id },
        id: "rows",
      },
    },
    { text: REPLY },
  ];
}

test(
  "given a thread with a CSV, an .xlsx, a PDF and an image, when its owner's run reads each and counts the CSV's rows, then the transcript holds each exact row, the PDF's text and the image's bytes, and the reply names them; when another user asks for the files, then every route is a 404 and their run's read fails with no bytes; when the server is stopped and started again, then the thread still lists the files and a new run reads the deep rows again",
  { timeout: 300_000 },
  async () => {
    // given: Ana's server, and a thread with the four files uploaded to it
    const first = await startAgain(env, ANA, children);
    const thread = await makeThread(first);
    const files = await attach(first, thread);

    // when: Ana's run lists and reads each file, and counts the CSV's rows
    await scripted(first, readEveryFile(files));
    const stream = await runOn(
      first,
      thread,
      "Read my files and count the CSV.",
    );
    assert.match(stream, /RUN_FINISHED/);
    const requests = await requestsOf(first);

    // then: list_attachments names each of the thread's four files
    const listed = outputOf(requests, "list").split("\n").sort();
    assert.deepEqual(
      listed,
      [
        `${files.csv.id}\torders.csv\ttext/csv\t${CSV().length}`,
        `${files.xlsx.id}\torders.xlsx\tapplication/vnd.openxmlformats-officedocument.spreadsheetml.sheet\t${XLSX().length}`,
        `${files.pdf.id}\tprice-list.pdf\tapplication/pdf\t${PDF().length}`,
        `${files.png.id}\tphoto.png\timage/png\t${PNG().length}`,
      ].sort(),
    );

    // and: the CSV's deep row is the window's first line
    assert.equal(
      outputOf(requests, "csv").split("\n")[0],
      csvDeepRow,
      "the CSV's deep row is the one at the offset asked for",
    );

    // and: the Prices sheet is read whole, and the Orders sheet's deep row is the window's first line
    assert.equal(outputOf(requests, "prices"), pricesText);
    assert.equal(
      outputOf(requests, "orders").split("\n")[0],
      ordersDeepRow,
      "the Orders sheet's deep row is the one at the offset asked for",
    );

    // and: the PDF's text is read whole, exactly
    assert.equal(outputOf(requests, "pdf"), PDF_TEXT);

    // and: the image is one block with the PNG's bytes and mime type
    const image = resultOf(requests, "image");
    assert.ok(image, "the model got no result of the image's read");
    assert.equal(image.isError, false, image.texts.join("\n"));
    const blocks = image.content.filter((block) => block.type === "image");
    assert.equal(blocks.length, 1, "the image's read is one image block");
    assert.deepEqual(
      { data: blocks[0]!.data, mimeType: blocks[0]!.mimeType },
      { data: PNG().toString("base64"), mimeType: "image/png" },
    );

    // and: the domain op counted the CSV's rows from its bytes
    assert.deepEqual(JSON.parse(outputOf(requests, "rows")), {
      file: "orders.csv",
      rows: csvRows().length - 1,
    });

    // and: the run's reply names every one of them
    assert.equal(replyOf(stream), REPLY);

    // when: the server is stopped, and Bo's server starts on the same database and data directory
    await stop(first);
    const second = await startAgain(env, BO, children);

    // then: every file route for Ana's thread is a 404, and no bytes are in the answer
    const form = new FormData();
    form.set(
      "file",
      new File([CSV() as BlobPart], "orders.csv", { type: "text/csv" }),
    );
    const routes = [
      await fetch(`${second.base}/threads/${thread}/files`, {
        method: "POST",
        body: form,
      }),
      await fetch(`${second.base}/threads/${thread}/files`),
      await fetch(`${second.base}/threads/${thread}/files/${files.csv.id}`),
      await fetch(`${second.base}/threads/${thread}/files/${files.csv.id}`, {
        method: "DELETE",
      }),
    ];
    for (const route of routes) {
      assert.equal(route.status, 404, `${route.url} is not Bo's`);
      const body = await route.text();
      assert.equal(
        body.includes(csvDeepRow) || body.includes(PDF_TEXT),
        false,
        `no bytes reached Bo: ${body}`,
      );
    }

    // and: Bo's own run cannot read Ana's file, and its failure names the file and Bo's thread, with no bytes
    const bosThread = await makeThread(second);
    await scripted(second, [
      {
        tool: {
          name: "read_attachment",
          arguments: { file: files.csv.id, byte_offset: CSV_OFFSET },
          id: "foreign",
        },
      },
      { text: "I cannot read that file." },
    ]);
    const bosStream = await runOn(second, bosThread, "Read my file.");
    assert.match(bosStream, /RUN_FINISHED/);
    const bosRequests = await requestsOf(second);
    const foreign = resultOf(bosRequests, "foreign");
    assert.ok(foreign, "Bo's model got no result of the read");
    assert.equal(
      foreign.isError,
      true,
      "another thread's file is a failed read",
    );
    const foreignText = foreign.texts.join("\n");
    assert.ok(
      foreignText.includes(files.csv.id),
      `the failure names the file, got "${foreignText}"`,
    );
    assert.ok(
      foreignText.includes(bosThread),
      `the failure names the thread, got "${foreignText}"`,
    );
    assert.equal(
      foreignText.includes(csvDeepRow) || foreignText.includes(PDF_TEXT),
      false,
      `no bytes reached Bo: ${foreignText}`,
    );

    // when: the server is stopped, and Ana's server starts again on the same database and data directory
    await stop(second);
    const third = await startAgain(env, ANA, children);

    // then: the thread still lists the files
    const list = await fetch(`${third.base}/threads/${thread}/files`);
    assert.equal(list.status, 200, await list.clone().text());
    assert.deepEqual(
      ((await list.json()) as { id: string }[]).map((file) => file.id).sort(),
      [files.csv.id, files.xlsx.id, files.pdf.id, files.png.id].sort(),
    );

    // and: a new run reads the CSV's deep row and the spreadsheet's named sheet again
    await scripted(third, [
      {
        tool: {
          name: "read_attachment",
          arguments: { file: files.csv.id, byte_offset: CSV_OFFSET },
          id: "csv-again",
        },
      },
      {
        tool: {
          name: "read_attachment",
          arguments: {
            file: files.xlsx.id,
            sheet: "Orders",
            byte_offset: ORDERS_OFFSET,
          },
          id: "orders-again",
        },
      },
      { text: "The files are still here." },
    ]);
    const againStream = await runOn(third, thread, "Read them again.");
    assert.match(againStream, /RUN_FINISHED/);
    const again = await requestsOf(third);
    assert.equal(outputOf(again, "csv-again").split("\n")[0], csvDeepRow);
    assert.equal(outputOf(again, "orders-again").split("\n")[0], ordersDeepRow);

    await stop(third);
  },
);
