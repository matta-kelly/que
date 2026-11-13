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
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { type CryptoKey, exportJWK, generateKeyPair, SignJWT } from "jose";
import { deploymentRoot } from "../../../tests/deployment-root.js";
import { grant } from "../../../tests/integration/grants.js";
import { SKILL_LINE } from "./skills.js";

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

/** The user's own till key, saved on the same connection route the UI uses. */
const saveKey = async (email: string) => {
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

/**
 * One MCP message to POST /mcp, with the headers given: as a harness that
 * signed in through Cloudflare Access posts one.
 */
const posted = (headers: Record<string, string>, message: unknown) =>
  app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(message),
  });

/** The capabilities of a 2026-07-28 client that can show a form: the envelope declares the form elicitation it can show. */
const FORM = { elicitation: { form: {} } };

/** The last line a flagged op's tool description carries: the model reads it and does not call the op. */
const APPROVAL_LINE =
  "Needs approval, and cannot be approved over MCP: do not call it.";

/**
 * One MCP message to POST /mcp as a 2026-07-28 client posts it: the per-request
 * envelope in `params._meta`, and the standard `MCP-Protocol-Version` and
 * `Mcp-Method` headers (with `Mcp-Name` on a call). No initialize: this era
 * carries its version on every request, so a stateless mouth can serve it.
 */
const modern = (
  email: string | null,
  id: number,
  method: string,
  params: Record<string, unknown> = {},
  capabilities: Record<string, unknown> = {},
) => {
  if (email === null) delete process.env.DEV_USER_EMAIL;
  else process.env.DEV_USER_EMAIL = email;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
  };
  if (typeof params.name === "string") headers["mcp-name"] = params.name;
  return app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "test", version: "0" },
          "io.modelcontextprotocol/clientCapabilities": capabilities,
        },
      },
    }),
  });
};

/** A JSON-RPC message an MCP answer carries: the JSON body, or the last data line of an SSE stream. */
type Reply = {
  result?: {
    tools?: {
      name: string;
      description?: string;
      annotations?: { destructiveHint?: boolean };
    }[];
    isError?: boolean;
    content?: { type: string; text: string }[];
    resultType?: string;
    inputRequests?: Record<string, unknown>;
    requestState?: string;
  };
  error?: { code: number; message: string; data?: unknown };
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

/** The text a tool call's one content part carries, as it is. */
const textIn = (reply: Reply | undefined) => {
  const content = reply?.result?.content ?? [];
  assert.equal(
    content.length,
    1,
    `the call's answer is not one content part: ${JSON.stringify(reply)}`,
  );
  assert.equal(content[0]?.type, "text");
  return content[0]!.text;
};

/**
 * The refusal a call of the flagged `till-void` gets: it needs approval, it cannot be approved over MCP, and the call
 * did not run. The refusal names no other place to approve, and the op did not run.
 */
function refused(reply: Reply | undefined, replyText: string) {
  assert.equal(
    reply?.result?.isError,
    true,
    `the call of till-void was not an error: ${replyText}`,
  );
  assert.notEqual(
    reply?.result?.resultType,
    "input_required",
    `the call answered input_required, a result a client answers: ${replyText}`,
  );
  assert.equal(
    reply?.result?.inputRequests,
    undefined,
    `the call embedded an input request: ${replyText}`,
  );
  assert.equal(
    reply?.result?.requestState,
    undefined,
    `the call came with a requestState, so it waited for an answer: ${replyText}`,
  );
  const reason = textIn(reply);
  assert.match(
    reason,
    /till-void/,
    `the refusal does not name till-void: ${replyText}`,
  );
  assert.match(
    reason,
    /needs approval/i,
    `the refusal does not say the op needs approval: ${replyText}`,
  );
  assert.match(
    reason,
    /cannot be approved over MCP/i,
    `the refusal does not say the op cannot be approved over MCP: ${replyText}`,
  );
  assert.match(
    reason,
    /did not run/i,
    `the refusal does not say the call did not run: ${replyText}`,
  );
  assert.doesNotMatch(
    reason,
    /web ui|\bchat\b|browser|dashboard/i,
    `the refusal names another place to approve: ${replyText}`,
  );
  assert.doesNotMatch(
    reason,
    /voided/,
    `the op ran, and its result came back: ${replyText}`,
  );
}

/** The team's key pair, and another's, for the tokens the Access settings must tell apart. */
const team = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
const kid = "the-team-key";
const audience = "the-que-application";
const teamKeys = {
  ...(await exportJWK(team.publicKey)),
  kid,
  alg: "RS256",
  use: "sig",
};

/** A server for the team domain's key set, as Cloudflare Access serves it. */
async function teamKeyServer(keys: object[]) {
  const server: Server = createServer((request, response) => {
    if (request.url !== "/cdn-cgi/access/certs") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not the key set");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys }));
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((closed) => server.close(() => closed())),
  };
}

/** A token for `email` from `issuer`, as Cloudflare Access issues one. */
const tokenFor = (
  privateKey: CryptoKey,
  {
    issuer,
    aud = audience,
    email,
    kid: keyId = kid,
  }: { issuer: string; aud?: string; email: string; kid?: string },
) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

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
  await saveKey(email);

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
      .filter((name) => name.startsWith("till-") && name !== "till-ops")
      .sort((a, b) => a.localeCompare(b)),
    [
      "till-count",
      "till-jam",
      "till-note",
      "till-stall",
      "till-tally",
      "till-void",
      "till-wait",
    ],
    `tools/list does not name the deployment's plugin ops: ${names.join(", ")}`,
  );

  const call = await post(
    email,
    rpc(3, "tools/call", {
      name: "till-count",
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
    `the call of till-count failed: ${callText}`,
  );
  assert.deepEqual(
    answerOf(reply),
    { conn: "till:the-key", item: "apple" },
    `the call's answer is not the op's result: ${callText}`,
  );
});

test("given a signed-in user, when a 2025-era initialize is posted to /mcp, then the answer is a JSON body, not an SSE stream", async () => {
  const email = "hana.http@example.com";
  await grant(email, "Hana Http", "till-domain");

  // Two 2025-era revisions: the v1 SDK answered each with a JSON body, and the v2 mouth keeps that.
  for (const protocolVersion of ["2024-11-05", "2025-06-18"]) {
    const res = await post(
      email,
      rpc(1, "initialize", {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      }),
    );
    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "";

    assert.equal(
      res.status,
      200,
      `a ${protocolVersion} initialize answered ${res.status}: ${text}`,
    );
    assert.equal(
      contentType.split(";")[0]?.trim(),
      "application/json",
      `a ${protocolVersion} initialize answered ${contentType}, not a JSON body: ${text}`,
    );
    assert.doesNotMatch(
      contentType,
      /text\/event-stream/,
      `a ${protocolVersion} initialize answered an SSE stream: ${contentType}`,
    );
  }
});

test("given the same user, when two separate posts each list the tools, then each answers the same list, because nothing is held between requests", async () => {
  const email = "ben.http@example.com";
  await grant(email, "Ben Http", "till-domain");

  // The till declares a credential, so it is listed only once the user's own key is saved.
  await saveKey(email);

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
    firstNames.includes("till-count"),
    `the first tools/list names no till op: ${firstNames.join(", ")}`,
  );
  assert.deepEqual(
    secondNames,
    firstNames,
    `the second tools/list does not answer the same list: ${secondNames.join(", ")} then ${firstNames.join(", ")}`,
  );
});

test("given a user granted the domain with no till key saved, when a post lists the tools, then it names no till op, and when the key is saved and a second post lists, then it names till-count", async () => {
  const email = "cleo.http@example.com";
  await grant(email, "Cleo Http", "till-domain");

  // Nothing is held between requests, so the second post sees the state the first one did not.
  const before = await post(email, rpc(1, "tools/list"));
  const beforeText = await before.text();
  assert.equal(
    before.status,
    200,
    `the first tools/list answered ${before.status}: ${beforeText}`,
  );
  const beforeNames = toolsIn(
    answered(beforeText, before.headers.get("content-type")),
  );
  assert.deepEqual(
    beforeNames.filter((name) => name.startsWith("till-")),
    [],
    `a tools/list with no till key saved names a till op: ${beforeNames.join(", ")}`,
  );

  await saveKey(email);

  const after = await post(email, rpc(2, "tools/list"));
  const afterText = await after.text();
  assert.equal(
    after.status,
    200,
    `the second tools/list answered ${after.status}: ${afterText}`,
  );
  const afterNames = toolsIn(
    answered(afterText, after.headers.get("content-type")),
  );
  assert.ok(
    afterNames.includes("till-count"),
    `a tools/list after the till key was saved does not name till-count: ${afterNames.join(", ")}`,
  );
});

test("given the Access settings and the team's key set, when a post carries a token the team signed for a user, then initialize answers 200 and tools/list answers that user's tools, and when the token is for another audience or signed by another key, then the answer is 401", async () => {
  const email = "dora.http@example.com";
  await grant(email, "Dora Http", "till-domain");
  await saveKey(email);

  const keySet = await teamKeyServer([teamKeys]);
  process.env.QUE_ACCESS_TEAM_DOMAIN = keySet.url;
  process.env.QUE_ACCESS_AUDIENCE = audience;
  try {
    // A plain email header beside the token: the verified claim decides, never the header.
    const access = {
      "cf-access-jwt-assertion": await tokenFor(team.privateKey, {
        issuer: keySet.url,
        email,
      }),
      "cf-access-authenticated-user-email": "mallory@example.com",
    };

    const init = await posted(access, initialize);
    const initText = await init.text();
    assert.equal(
      init.status,
      200,
      `an initialize on a token the team signed answered ${init.status}: ${initText}`,
    );
    assert.ok(
      answered(initText, init.headers.get("content-type"))?.result,
      `an initialize on a token the team signed answered no result: ${initText}`,
    );

    const list = await posted(access, rpc(2, "tools/list"));
    const listText = await list.text();
    assert.equal(
      list.status,
      200,
      `a tools/list on a token the team signed answered ${list.status}: ${listText}`,
    );
    const names = toolsIn(answered(listText, list.headers.get("content-type")));
    assert.ok(
      names.includes("till-count"),
      `a tools/list on the token does not name the token user's till op: ${names.join(", ")}`,
    );

    const wrongAudience = await posted(
      {
        "cf-access-jwt-assertion": await tokenFor(team.privateKey, {
          issuer: keySet.url,
          aud: "another-app",
          email,
        }),
      },
      initialize,
    );
    assert.equal(
      wrongAudience.status,
      401,
      `a token for another audience answered ${wrongAudience.status}: ${await wrongAudience.text()}`,
    );

    const wrongKey = await posted(
      {
        "cf-access-jwt-assertion": await tokenFor(other.privateKey, {
          issuer: keySet.url,
          email,
        }),
      },
      initialize,
    );
    assert.equal(
      wrongKey.status,
      401,
      `a token signed by another key answered ${wrongKey.status}: ${await wrongKey.text()}`,
    );
  } finally {
    delete process.env.QUE_ACCESS_TEAM_DOMAIN;
    delete process.env.QUE_ACCESS_AUDIENCE;
    delete process.env.DEV_USER_EMAIL;
    await keySet.close();
  }
});

test("given a user on protocol 2026-07-28, when the session posts tools/list and then calls a tool to /mcp with no initialize, then it lists that user's tools and the call answers the op's result", async () => {
  const email = "gwen.http@example.com";
  await grant(email, "Gwen Http", "till-domain");

  // The till declares a credential, so it is listed only once the user's own key is saved.
  await saveKey(email);

  const list = await modern(email, 1, "tools/list");
  const listText = await list.text();
  assert.equal(
    list.status,
    200,
    `a 2026-07-28 tools/list answered ${list.status}: ${listText}`,
  );
  const names = toolsIn(answered(listText, list.headers.get("content-type")));
  assert.deepEqual(
    names
      .filter((name) => name.startsWith("till-") && name !== "till-ops")
      .sort((a, b) => a.localeCompare(b)),
    [
      "till-count",
      "till-jam",
      "till-note",
      "till-stall",
      "till-tally",
      "till-void",
      "till-wait",
    ],
    `a 2026-07-28 tools/list does not name the deployment's plugin ops: ${names.join(", ")}`,
  );

  const call = await modern(email, 2, "tools/call", {
    name: "till-count",
    arguments: { item: "apple" },
  });
  const callText = await call.text();
  assert.equal(
    call.status,
    200,
    `a 2026-07-28 tools/call answered ${call.status}: ${callText}`,
  );
  const reply = answered(callText, call.headers.get("content-type"));
  assert.notEqual(
    reply?.result?.isError,
    true,
    `the call of till-count failed: ${callText}`,
  );
  assert.deepEqual(
    answerOf(reply),
    { conn: "till:the-key", item: "apple" },
    `the call's answer is not the op's result: ${callText}`,
  );
});

test("given a signed-in user, when a GET is sent to /mcp, then the answer is 405, it allows POST, and it is not an SSE stream", async () => {
  const res = await as("erin.http@example.com", "/mcp", { method: "GET" });
  const text = await res.text();

  assert.equal(
    res.status,
    405,
    `a GET to /mcp answered ${res.status}: ${text}`,
  );
  assert.equal(
    res.headers.get("allow"),
    "POST",
    `a GET to /mcp answered allow ${res.headers.get("allow")}: ${text}`,
  );
  assert.doesNotMatch(
    res.headers.get("content-type") ?? "",
    /text\/event-stream/,
    `a GET to /mcp answered an SSE stream: ${res.headers.get("content-type")}`,
  );
});

test("given a signed-in user, when a DELETE is sent to /mcp, then the answer is 405, because a stateless session has nothing to end", async () => {
  const res = await as("finn.http@example.com", "/mcp", { method: "DELETE" });
  const text = await res.text();

  assert.equal(
    res.status,
    405,
    `a DELETE to /mcp answered ${res.status}: ${text}`,
  );
});

test("given a 2026-07-28 client that declares form elicitation, when it calls the flagged till-void, then the op does not run, the result is an error that says it needs approval, that it cannot be approved over MCP, and that the call did not run, and no ask is made", async () => {
  const email = "ivy.http@example.com";
  await grant(email, "Ivy Http", "till-domain");
  await saveKey(email);

  // A client that could show a form is refused as any other: there is no ask to answer.
  const res = await modern(
    email,
    1,
    "tools/call",
    { name: "till-void", arguments: { item: "apple" } },
    FORM,
  );
  const replyText = await res.text();

  refused(answered(replyText, res.headers.get("content-type")), replyText);
});

test("given a 2026-07-28 client that declares no elicitation, when it calls till-void, then the op does not run, and the result is the same refusal", async () => {
  const email = "pia.http@example.com";
  await grant(email, "Pia Http", "till-domain");
  await saveKey(email);

  const res = await modern(email, 1, "tools/call", {
    name: "till-void",
    arguments: { item: "apple" },
  });
  const replyText = await res.text();

  refused(answered(replyText, res.headers.get("content-type")), replyText);
});

test("given a 2025-era client over HTTP, when it calls till-void, then the op does not run, and the result is the same refusal", async () => {
  const email = "quinn.http@example.com";
  await grant(email, "Quinn Http", "till-domain");
  await saveKey(email);

  const init = await post(email, initialize);
  assert.equal(
    init.status,
    200,
    `the 2025-era initialize answered ${init.status}: ${await init.text()}`,
  );

  const call = await post(
    email,
    rpc(2, "tools/call", {
      name: "till-void",
      arguments: { item: "apple" },
    }),
  );
  const replyText = await call.text();

  refused(answered(replyText, call.headers.get("content-type")), replyText);
});

test("given a 2026-07-28 client, when it retries till-void with an accept and a requestState, or with a requestState alone, then the op does not run, and each call is refused as any other", async () => {
  const email = "mo.http@example.com";
  await grant(email, "Mo Http", "till-domain");
  await saveKey(email);

  // There is no ask a client can answer, so an answer it brings is refused with the call.
  const accepted = await modern(
    email,
    1,
    "tools/call",
    {
      name: "till-void",
      arguments: { item: "apple" },
      requestState: "a-state-for-the-call",
      inputResponses: { confirm: { action: "accept", content: {} } },
    },
    FORM,
  );
  const acceptedText = await accepted.text();
  refused(
    answered(acceptedText, accepted.headers.get("content-type")),
    acceptedText,
  );

  const stateOnly = await modern(
    email,
    2,
    "tools/call",
    {
      name: "till-void",
      arguments: { item: "apple" },
      requestState: "a-state-for-the-call",
    },
    FORM,
  );
  const stateOnlyText = await stateOnly.text();
  refused(
    answered(stateOnlyText, stateOnly.headers.get("content-type")),
    stateOnlyText,
  );
});

test("given an op whose object approval's when answers false for the args, when a 2026-07-28 client calls till-note for a free item, then the op runs, and when it calls it for another item, then the call is refused", async () => {
  const email = "nina.http@example.com";
  await grant(email, "Nina Http", "till-domain");
  await saveKey(email);

  // till-note's when skips the ask for a free item, so the door runs it even on a mouth that cannot ask.
  const free = await modern(
    email,
    1,
    "tools/call",
    { name: "till-note", arguments: { item: "free" } },
    FORM,
  );
  const freeText = await free.text();
  const freeReply = answered(freeText, free.headers.get("content-type"));
  assert.notEqual(
    freeReply?.result?.isError,
    true,
    `a call the when answers false for failed: ${freeText}`,
  );
  assert.deepEqual(
    answerOf(freeReply),
    { conn: "till:the-key", item: "free", noted: true },
    `the call did not run over MCP: ${freeText}`,
  );

  // The control: when answers true for another item, the same tool is refused.
  const noted = await modern(
    email,
    2,
    "tools/call",
    { name: "till-note", arguments: { item: "scarf" } },
    FORM,
  );
  const notedText = await noted.text();
  const notedReply = answered(notedText, noted.headers.get("content-type"));
  assert.equal(
    notedReply?.result?.isError,
    true,
    `a call the when answers true for was not refused: ${notedText}`,
  );
  assert.match(
    textIn(notedReply),
    /needs approval/i,
    `the refusal does not say the op needs approval: ${notedText}`,
  );
});

test("given a 2026-07-28 client, when it lists the tools, then the flagged till-void's tool says destructiveHint and ends its description with the line that it needs approval and cannot be approved over MCP, and the unflagged till-count's does neither", async () => {
  const email = "rae.http@example.com";
  await grant(email, "Rae Http", "till-domain");
  await saveKey(email);

  const res = await modern(email, 1, "tools/list");
  const replyText = await res.text();
  const reply = answered(replyText, res.headers.get("content-type"));
  const voided = reply?.result?.tools?.find(
    (tool) => tool.name === "till-void",
  );
  const counted = reply?.result?.tools?.find(
    (tool) => tool.name === "till-count",
  );

  assert.ok(voided, `tools/list names no till-void: ${replyText}`);
  assert.ok(counted, `tools/list names no till-count: ${replyText}`);
  assert.equal(
    voided.annotations?.destructiveHint,
    true,
    `the flagged op's tool does not say destructiveHint: ${replyText}`,
  );
  assert.notEqual(
    counted.annotations?.destructiveHint,
    true,
    `the unflagged op's tool says destructiveHint: ${replyText}`,
  );
  assert.equal(
    voided.description?.split("\n").at(-1),
    APPROVAL_LINE,
    `the flagged op's tool description does not end with the approval line: ${replyText}`,
  );
  assert.ok(
    voided.description?.startsWith("Voids an item's sale"),
    `the flagged op's tool description lost the op's own text: ${replyText}`,
  );
  assert.equal(
    counted.description,
    "How many of an item the till holds.",
    `the unflagged op's tool description carries more than the op's own text: ${replyText}`,
  );
});

/** An answer's JSON-RPC message, read loosely: the skills tests read fields Reply does not name. */
const loose = async (response: Response) =>
  answered(await response.text(), response.headers.get("content-type")) as
    | {
        result?: Record<string, unknown> & {
          capabilities?: {
            extensions?: Record<string, unknown>;
            resources?: unknown;
          };
          instructions?: string;
          skills?: {
            uri: string;
            frontmatter: Record<string, unknown>;
            resources: { uri: string; digest: string; size: number }[];
          }[];
          resources?: { uri: string; mimeType?: string }[];
          contents?: { uri: string; text?: string }[];
        };
        error?: { code: number; message: string };
      }
    | undefined;

/** The till's skill, as its file is: what MCP serves at its URI. */
const tillSkill = {
  uri: "skill://till/till-ops/SKILL.md",
  file: readFileSync(
    join(
      import.meta.dirname,
      "../../../tests/integration/mount/fixtures/plugins/till/skills/till-ops/SKILL.md",
    ),
  ),
};

test("given a user whose catalog holds the till, when the session initializes, then the server declares the skills extension, and its instructions say to call a skill first and name the till's skill", async () => {
  const email = "sky.http@example.com";
  await grant(email, "Sky Http", "till-domain");
  await saveKey(email);
  const reply = await loose(await post(email, initialize));
  assert.ok(
    reply?.result?.capabilities?.extensions?.["io.modelcontextprotocol/skills"],
    `initialize declares no skills extension: ${JSON.stringify(reply)}`,
  );
  assert.ok(reply?.result?.capabilities?.resources, "no resources capability");
  const instructions = reply?.result?.instructions ?? "";
  assert.match(
    instructions,
    /Before any task, call the skill tool that covers it/,
  );
  assert.match(
    instructions,
    /Numbers come from the ops: never add up rows yourself/,
  );
  assert.ok(
    instructions.includes("- till-ops: How to use the till's ops."),
    `the instructions do not list the till's skill: ${instructions}`,
  );
});

test("given a user whose catalog holds the till, when the session lists tools and calls the skill's tool, then the skill comes before the ops and the call gives its SKILL.md", async () => {
  const email = "sky.http@example.com";
  const listed = await loose(await post(email, rpc(2, "tools/list")));
  const tools = (listed?.result?.tools ?? []) as {
    name: string;
    description?: string;
    annotations?: { readOnlyHint?: boolean };
  }[];
  const names = tools.map(({ name }) => name);
  assert.ok(
    names.indexOf("till-ops") > 0 &&
      names.indexOf("till-ops") < names.indexOf("till-count"),
    `the skill is not listed before the ops: ${names.join(", ")}`,
  );
  const skill = tools.find(({ name }) => name === "till-ops");
  assert.equal(skill?.description?.split("\n").at(-1), SKILL_LINE);
  assert.equal(skill?.annotations?.readOnlyHint, true);
  const called = await loose(
    await post(
      email,
      rpc(3, "tools/call", { name: "till-ops", arguments: {} }),
    ),
  );
  const content = called?.result?.content as { text?: string }[] | undefined;
  assert.equal(content?.[0]?.text, tillSkill.file.toString("utf8"));
});

test("given a user whose catalog holds the till, when the session lists and gets skills, then the till's skill comes back with its frontmatter as written and the digest and size of its file", async () => {
  const email = "sky.http@example.com";
  const listed = await loose(await post(email, rpc(2, "skills/list")));
  const skills = listed?.result?.skills ?? [];
  const digest = `sha256:${createHash("sha256").update(tillSkill.file).digest("hex")}`;
  const expected = {
    uri: tillSkill.uri,
    frontmatter: {
      name: "till-ops",
      description: "How to use the till's ops.",
      "allowed-tools":
        "till-count till-tally till-wait till-stall till-void till-note till-jam",
    },
    resources: [
      { uri: tillSkill.uri, digest, size: tillSkill.file.byteLength },
    ],
  };
  assert.deepEqual(
    skills.map(({ uri, frontmatter, resources }) => ({
      uri,
      frontmatter,
      resources,
    })),
    [expected],
  );
  const got = await loose(
    await post(email, rpc(3, "skills/get", { uri: tillSkill.uri })),
  );
  const { uri, frontmatter, resources } = (got?.result?.skill ?? {}) as {
    uri?: string;
    frontmatter?: unknown;
    resources?: unknown;
  };
  assert.deepEqual({ uri, frontmatter, resources }, expected);
});

test("given a user whose catalog holds the till, when a client without the extension lists and reads resources, then the till's SKILL.md is listed and reads as its file", async () => {
  const email = "sky.http@example.com";
  const listed = await loose(await post(email, rpc(2, "resources/list")));
  assert.deepEqual(
    (listed?.result?.resources ?? []).map(({ uri, mimeType }) => [
      uri,
      mimeType,
    ]),
    [[tillSkill.uri, "text/markdown"]],
  );
  const read = await loose(
    await post(email, rpc(3, "resources/read", { uri: tillSkill.uri })),
  );
  assert.equal(
    read?.result?.contents?.[0]?.text,
    tillSkill.file.toString("utf8"),
  );
});

test("given a 2026-07-28 client whose user's catalog holds the till, when it lists skills with no initialize, then the till's skill comes back", async () => {
  const listed = await loose(
    await modern("sky.http@example.com", 1, "skills/list"),
  );
  assert.deepEqual(
    (listed?.result?.skills ?? []).map(({ uri }) => uri),
    [tillSkill.uri],
  );
});

test("given a signed-in user with no grant, when the session initializes and lists skills, then the extension is declared, there are no instructions and no skills, and reading the till's skill is an error", async () => {
  const email = "nobody.http@example.com";
  const init = await loose(await post(email, initialize));
  assert.ok(
    init?.result?.capabilities?.extensions?.["io.modelcontextprotocol/skills"],
  );
  assert.equal(init?.result?.instructions, undefined);
  const listed = await loose(await post(email, rpc(2, "skills/list")));
  assert.deepEqual(listed?.result?.skills, []);
  const read = await loose(
    await post(email, rpc(3, "resources/read", { uri: tillSkill.uri })),
  );
  assert.ok(read?.error, `the read did not fail: ${JSON.stringify(read)}`);
});
