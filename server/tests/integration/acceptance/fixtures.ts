/**
 * The acceptance test's four files, built in the test: a deep CSV, a workbook
 * of two named sheets, a PDF with a text layer, and a PNG. The bytes are the
 * test's, so each expected row and each expected PDF text is exact.
 */

import { crc32, deflateRawSync } from "node:zlib";

/** A CSV's rows: a header and 2,000 orders, each padded so a deep row is past the first 50KB window. */
export function csvRows(): string[] {
  return [
    "row,order,customer,sku,qty,note",
    ...Array.from(
      { length: 2_000 },
      (_, i) =>
        `row-${i},SO-${i},customer-${i % 97},SKU-${i % 503},${i % 17},${"x".repeat(48)}`,
    ),
  ];
}

/** The byte offset of the CSV's row `at`, where a read window starts on that row. */
export function csvOffsetAt(at: number): number {
  return Buffer.byteLength(csvRows().slice(0, at).join("\n") + "\n");
}

export const CSV = () => Buffer.from(csvRows().join("\n") + "\n");

// ---- A PDF with a text layer, built here. ----

export function pdf(pages: string[]): Buffer {
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

/** The acceptance PDF's two pages, a page's two lines of text. */
export const PDF = () =>
  pdf([
    "BT /F1 18 Tf 72 720 Td (Order SO-4999 for cust-52) Tj ET\nBT /F1 12 Tf 72 690 Td (SKU-472 quantity 1) Tj ET",
    "BT /F1 18 Tf 72 720 Td (Price list page two) Tj ET\nBT /F1 12 Tf 72 690 Td (SKU-01849 costs 91) Tj ET",
  ]);

/** The PDF's text as its extractor gives it: each page's lines, the pages one after another. */
export const PDF_TEXT =
  "Order SO-4999 for cust-52\nSKU-472 quantity 1\nPrice list page two\nSKU-01849 costs 91";

// ---- An .xlsx, built here: the smallest workbook that read-excel-file reads. ----

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type Cell = string | number;

/** A table cell: text or a number. */
export type Sheet = { name: string; rows: Cell[][] };

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

const cellXml = (row: number, column: number, value: Cell) =>
  typeof value === "number"
    ? `<c r="${cellRef(row, column)}"><v>${value}</v></c>`
    : `<c r="${cellRef(row, column)}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;

const sheetXml = (rows: Cell[][]) => {
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((value, c) => cellXml(r, c, value)).join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
};

function xlsx(sheets: Sheet[]): Buffer {
  const entries: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
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
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
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
export const ordersRows = (): Cell[][] => [
  ["order", "customer", "sku", "qty"],
  ...Array.from({ length: 5_000 }, (_, i) => [
    `SO${i + 1}`,
    `cust-${i % 97}`,
    `SKU-${i % 503}`,
    i % 17,
  ]),
];

/** A sheet's rows as read_attachment gives them: a row a line, a cell a tab-separated value. */
export const sheetText = (rows: Cell[][]) =>
  rows.map((row) => row.map((value) => String(value)).join("\t")).join("\n");

/** The byte offset of the Orders sheet's row `at`, where a read window starts on that row. */
export function ordersOffsetAt(at: number): number {
  return Buffer.byteLength(sheetText(ordersRows().slice(0, at)) + "\n");
}

/** The acceptance workbook: a deep Orders sheet and a short Prices sheet. */
export const XLSX = () =>
  xlsx([
    { name: "Orders", rows: ordersRows() },
    {
      name: "Prices",
      rows: [
        ["sku", "price"],
        ["SKU-1", 11],
        ["SKU-2", 12],
      ],
    },
  ]);

/** A PNG: its signature and a few bytes, given as one image block with these bytes. */
export const PNG = () =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
