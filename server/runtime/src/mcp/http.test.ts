/**
 * The MCP mouth: a harness anywhere speaks the protocol to the deployment's own
 * server at POST /mcp, on the same identity gate as every other route but /ok.
 *
 * On a database of its own (PGlite, served on a local port), with the runtime's
 * own control plane (access/control.ts) to grant a domain, as a fixture test
 * does, before the posts. The fixture deployment "tools" holds the till, which
 * the domain "till-domain" reaches.
 *
 * Stateless: each post stands alone, so who is asking is the request's identity
 * and nothing is held between requests.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../tests/deployment-root.js";
import { grant } from "../../../tests/integration/grants.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 50 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "tools",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;

const { app } = await import("../serve.js");

after(async () => {
  // A connection the runtime opened at load may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

/** A request as the user with this email. */
const as = (email: string, path: string, init?: RequestInit) => {
  process.env.DEV_USER_EMAIL = email;
  return app.request(path, init);
};

/** A JSON-RPC request, as a harness writes one. */
const rpc = (id: number, method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

/** The initialize a harness posts first: the protocol version, and the client's name. */
const initialize = rpc(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "test", version: "0" },
});

/** One MCP message to POST /mcp: JSON, with both content types accepted, as the SDK requires. */
const post = (email: string | null, message: unknown) => {
  if (email === null) delete process.env.DEV_USER_EMAIL;
  else process.env.DEV_USER_EMAIL = email;
  return app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(message),
  });
};

/** A JSON-RPC message an MCP answer carries: the JSON body, or the last data line of an SSE stream. */
type Reply = {
  result?: {
    tools?: { name: string }[];
    isError?: boolean;
    content?: { type: string; text: string }[];
  };
};

/** The JSON-RPC message an MCP answer carries, or nothing when the answer has no MCP body. */
function answered(text: string, contentType: string | null): Reply | undefined {
  const data = contentType?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .pop()
        ?.slice("data:".length)
        .trim()
    : text;
  if (!data) return undefined;
  try {
    return JSON.parse(data) as Reply;
  } catch {
    return undefined;
  }
}

/** The tool names an answer's tools/list gives. */
const toolsIn = (reply: Reply | undefined) =>
  (reply?.result?.tools ?? []).map((tool) => tool.name);

/** The text a tool call's one content part carries, read as JSON. */
const answerOf = (reply: Reply | undefined) => {
  const content = reply?.result?.content ?? [];
  assert.equal(
    content.length,
    1,
    `the call's answer is not one content part: ${JSON.stringify(reply)}`,
  );
  assert.equal(content[0]?.type, "text");
  return JSON.parse(content[0]!.text) as unknown;
};

test("given a session with no identity, when it posts an initialize to /mcp, then the answer is 401, and no MCP body comes back", async () => {
  const res = await post(null, initialize);
  const text = await res.text();

  assert.equal(
    res.status,
    401,
    `an initialize with no identity answered ${res.status}: ${text}`,
  );
  assert.doesNotMatch(
    text,
    /"jsonrpc"/,
    `an initialize with no identity answered an MCP body: ${text}`,
  );
});

test("given a user granted the deployment's domain, when the session posts initialize, then tools/list, then calls a tool, then it lists that deployment's plugin ops and the call answers the op's result", async () => {
  const email = "ana.http@example.com";
  await grant(email, "Ana Http", "till-domain");

  // The op needs the user's own key, saved on the same connection route the UI uses.
  const saved = await as(email, "/que/connections/till", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { key: "the-key" } }),
  });
  assert.equal(
    saved.status,
    200,
    `the till's key was not saved: ${await saved.text()}`,
  );

  const init = await post(email, initialize);
  const initText = await init.text();
  assert.equal(
    init.status,
    200,
    `initialize answered ${init.status}: ${initText}`,
  );
  assert.ok(
    answered(initText, init.headers.get("content-type"))?.result,
    `initialize answered no result: ${initText}`,
  );

  const ready = await post(email, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  assert.equal(
    ready.status,
    202,
    `notifications/initialized answered ${ready.status}: ${await ready.text()}`,
  );

  const list = await post(email, rpc(2, "tools/list"));
  const listText = await list.text();
  assert.equal(
    list.status,
    200,
    `tools/list answered ${list.status}: ${listText}`,
  );
  const names = toolsIn(answered(listText, list.headers.get("content-type")));
  assert.deepEqual(
    names
      .filter((name) => name.startsWith("till."))
      .sort((a, b) => a.localeCompare(b)),
    [
      "till.till-count",
      "till.till-jam",
      "till.till-stall",
      "till.till-tally",
      "till.till-wait",
    ],
    `tools/list does not name the deployment's plugin ops: ${names.join(", ")}`,
  );

  const call = await post(
    email,
    rpc(3, "tools/call", {
      name: "till.till-count",
      arguments: { item: "apple" },
    }),
  );
  const callText = await call.text();
  assert.equal(
    call.status,
    200,
    `tools/call answered ${call.status}: ${callText}`,
  );
  const reply = answered(callText, call.headers.get("content-type"));
  assert.notEqual(
    reply?.result?.isError,
    true,
    `the call of till.till-count failed: ${callText}`,
  );
  assert.deepEqual(
    answerOf(reply),
    { conn: "till:the-key", item: "apple" },
    `the call's answer is not the op's result: ${callText}`,
  );
});

test("given the same user, when two separate posts each list the tools, then each answers the same list, because nothing is held between requests", async () => {
  const email = "ben.http@example.com";
  await grant(email, "Ben Http", "till-domain");

  // The till declares a credential, so it is listed only once the user's own key is saved.
  const saved = await as(email, "/que/connections/till", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { key: "the-key" } }),
  });
  assert.equal(
    saved.status,
    200,
    `the till's key was not saved: ${await saved.text()}`,
  );

  const first = await post(email, rpc(1, "tools/list"));
  const firstText = await first.text();
  const second = await post(email, rpc(2, "tools/list"));
  const secondText = await second.text();

  assert.equal(
    first.status,
    200,
    `the first tools/list answered ${first.status}: ${firstText}`,
  );
  assert.equal(
    second.status,
    200,
    `the second tools/list answered ${second.status}: ${secondText}`,
  );
  assert.equal(
    first.headers.get("mcp-session-id"),
    null,
    "the first tools/list opened a session",
  );
  assert.equal(
    second.headers.get("mcp-session-id"),
    null,
    "the second tools/list opened a session",
  );

  const firstNames = toolsIn(
    answered(firstText, first.headers.get("content-type")),
  );
  const secondNames = toolsIn(
    answered(secondText, second.headers.get("content-type")),
  );
  assert.ok(
    firstNames.includes("till.till-count"),
    `the first tools/list names no till op: ${firstNames.join(", ")}`,
  );
  assert.deepEqual(
    secondNames,
    firstNames,
    `the second tools/list does not answer the same list: ${secondNames.join(", ")} then ${firstNames.join(", ")}`,
  );
});
