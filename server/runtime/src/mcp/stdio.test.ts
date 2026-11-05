/**
 * que's MCP server over stdio, as a harness runs it: the SDK's client transport
 * spawns `src/mcp/stdio.ts` as a real subprocess, and the protocol is stdin and
 * stdout. Who the tools answer for comes from DEV_USER_EMAIL in dev, and a bad
 * identity setting stops the start.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ElicitRequestSchema,
  type ElicitRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { deploymentRoot } from "../../../tests/deployment-root.js";

/** How the runner starts the server, and how this test starts it too. */
const command = {
  command: join(import.meta.dirname, "../../../node_modules/.bin/tsx"),
  args: [
    "--import",
    join(import.meta.dirname, "../mount/supply.ts"),
    "src/mcp/stdio.ts",
  ],
  cwd: join(import.meta.dirname, "../.."),
};

/** The env a subprocess gets under `overrides`: the defaults, and no identity of this test's own. A value that is undefined is left out. */
const env = (overrides: Record<string, string | undefined>) => {
  const merged: Record<string, string> = {
    ...getDefaultEnvironment(),
    NODE_OPTIONS: "--conditions=@mku1tra/que-source",
  };
  for (const [key, value] of Object.entries(overrides))
    if (value !== undefined) merged[key] = value;
  return merged;
};

// The database and the deployment the tool-surface tests read, made as catalog.test.ts makes them: PGlite on a socket,
// and the fixture deployment "prompt" as a root of its own.
const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 10 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "prompt",
);
// This test owns the identity and the database: a subprocess gets them from `que` and its overrides alone.
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;
delete process.env.QUE_ACCESS_JWT;

const { grant } = await import("../../../tests/integration/grants.js");
const { users } = await import("../access/users.js");
const { access } = await import("../access/connections.js");
const { plugins } = await import("../mount/mounted.js");

// The prompt deployment's till, whose key the approval tests save as the user's own.
const till = plugins.find((p) => p.definition.plugin.name === "till");
if (!till) throw new Error("the prompt deployment mounts no till");

after(async () => {
  // A connection a subprocess opened may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

/** The database and deployment every session of the tool-surface tests reads. */
const que = () => ({
  DATABASE_URL: process.env.DATABASE_URL!,
  QUE_CREDENTIALS_KEY: process.env.QUE_CREDENTIALS_KEY!,
  QUE_DEPLOYMENT: process.env.QUE_DEPLOYMENT!,
});

/** The tools a session for `email` lists, on the deployment at `deployment`. */
async function listedTools(
  email: string,
  deployment: string = process.env.QUE_DEPLOYMENT!,
) {
  const { value } = await withServer(
    { ...que(), QUE_DEPLOYMENT: deployment, DEV_USER_EMAIL: email },
    async (client) => (await client.listTools()).tools,
  );
  return value;
}

/** A copy of the deployment at `from`, which a test may change without touching the fixtures. */
function copyDeployment(from: string): string {
  const to = join(mkdtempSync(join(tmpdir(), "que-mcp-deployment-")), "prompt");
  // Its plugins are installed as links, and copied as they are, so they point into the copy.
  cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  return to;
}

/** Adds an op to the copy's source plugin, so a new session sees a changed deployment. */
function addSourceList(folder: string): void {
  const file = join(
    folder,
    "plugins",
    "source",
    "io.github.matta-kelly.que",
    "index.ts",
  );
  const before = readFileSync(file, "utf8");
  const after = before.replace(
    "  ],\n});",
    `    {
      name: "source-list",
      type: "op",
      title: "List",
      description: "List every thing.",
      input: z.object({}),
      run: async () => ({}),
    },
  ],
});
`,
  );
  if (after === before) throw new Error(`could not add an op to ${file}`);
  writeFileSync(file, after);
}

/** An MCP client for a real server subprocess, and the watch on anything it writes that is not a protocol message. */
async function connect(overrides: Record<string, string | undefined>) {
  const transport = new StdioClientTransport({
    ...command,
    env: env(overrides),
    stderr: "pipe",
  });
  const noise: string[] = [];
  transport.stderr?.on("data", (chunk) => noise.push(String(chunk)));
  const client = new Client({ name: "que-mcp-test", version: "0.0.0" });
  // A line written to stdout that is not a message is dropped silently unless this records it.
  client.onerror = (error) => noise.push(`protocol: ${String(error)}`);
  await client.connect(transport);
  return { client, noise };
}

/** Runs `run` against a server subprocess with `overrides`, and gives its answer and stderr once the client is closed. */
async function withServer<T>(
  overrides: Record<string, string | undefined>,
  run: (client: Client) => Promise<T>,
): Promise<{ value: T; noise: string[] }> {
  const { client, noise } = await connect(overrides);
  try {
    return { value: await run(client), noise };
  } finally {
    await client.close();
  }
}

/**
 * Runs `run` against a server subprocess with `overrides`, as a client that
 * declares form elicitation: `asks` holds every elicitation request the server
 * made. An ask is declined, so a call that wrongly waits cannot hang.
 */
async function withElicitingServer<T>(
  overrides: Record<string, string | undefined>,
  run: (client: Client) => Promise<T>,
): Promise<{ value: T; asks: ElicitRequest["params"][]; noise: string[] }> {
  const transport = new StdioClientTransport({
    ...command,
    env: env(overrides),
    stderr: "pipe",
  });
  const noise: string[] = [];
  transport.stderr?.on("data", (chunk) => noise.push(String(chunk)));
  const client = new Client(
    { name: "que-mcp-test", version: "0.0.0" },
    { capabilities: { elicitation: { form: {} } } },
  );
  client.onerror = (error) => noise.push(`protocol: ${String(error)}`);
  const asks: ElicitRequest["params"][] = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asks.push(request.params);
    return { action: "decline" };
  });
  await client.connect(transport);
  try {
    return { value: await run(client), asks, noise };
  } finally {
    await client.close();
  }
}

/** Runs `run`, giving its value or the error it threw. */
const tried = async <T>(run: () => Promise<T>) =>
  run().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

/**
 * Asserts that a call of the flagged `till-void` was refused over MCP: it needs
 * approval, it cannot be approved over MCP, and the call did not run. The
 * refusal names no other place to approve, and the op did not run.
 */
function refused(result: Awaited<ReturnType<Client["callTool"]>>) {
  assert.equal(
    result.isError,
    true,
    `the call of till-void was not an error: ${text(result)}`,
  );
  const reason = text(result);
  assert.match(
    reason,
    /till-void/,
    `the refusal does not name till-void: ${reason}`,
  );
  assert.match(
    reason,
    /needs approval/i,
    `the refusal does not say the op needs approval: ${reason}`,
  );
  assert.match(
    reason,
    /cannot be approved over MCP/i,
    `the refusal does not say the op cannot be approved over MCP: ${reason}`,
  );
  assert.match(
    reason,
    /did not run/i,
    `the refusal does not say the call did not run: ${reason}`,
  );
  assert.doesNotMatch(
    reason,
    /web ui|\bchat\b|browser|dashboard/i,
    `the refusal names another place to approve: ${reason}`,
  );
  assert.doesNotMatch(
    reason,
    /voided/,
    `the op ran, and its result came back: ${reason}`,
  );
}

/** The single text content a tool result carries, read as JSON. */
function answer(result: Awaited<ReturnType<Client["callTool"]>>) {
  assert.notEqual(result.isError, true, `whoami failed: ${text(result)}`);
  const content = result.content as { type: string; text: string }[];
  assert.equal(content.length, 1);
  assert.equal(content[0]?.type, "text");
  return JSON.parse(content[0]!.text) as {
    id?: string;
    email: string;
    name: string;
  };
}

/** The text a tool result carries. */
function text(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as { type: string; text: string }[];
  return content.map((part) => part.text).join("\n");
}

/** Runs the server with `overrides`, and gives its exit code and stderr. */
function start(overrides: Record<string, string>) {
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: env(overrides),
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderr: string[] = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  return new Promise<{ code: number | null; stderr: string }>((done) => {
    child.on("close", (code) => done({ code, stderr: stderr.join("") }));
  });
}

test("given DEV_USER_EMAIL in the env, when an MCP client calls whoami over stdio, then it answers that que user, its database-less session lists that tool alone, and the server writes nothing to stderr", async () => {
  for (const email of ["ana.lima@example.com", "ben.lima@example.com"]) {
    const { value, noise } = await withServer(
      { DEV_USER_EMAIL: email },
      async (client) => ({
        who: answer(await client.callTool({ name: "whoami", arguments: {} })),
        tools: (await client.listTools()).tools,
      }),
    );
    assert.equal(value.who.email, email);
    assert.equal(value.who.name, email.split("@")[0]);
    assert.deepEqual(
      value.tools.map((tool) => tool.name),
      ["whoami"],
      `a database-less session lists more than whoami: ${value.tools.map((tool) => tool.name).join(", ")}`,
    );
    assert.deepEqual(
      noise,
      [],
      `the server wrote outside the protocol: ${noise.join("")}`,
    );
  }
});

test("given Access settings and DEV_USER_EMAIL both set, when the server starts, then it exits non-zero, and its message names the setting", async () => {
  const cases: { env: Record<string, string>; names: string }[] = [
    {
      env: {
        QUE_ACCESS_TEAM_DOMAIN: "https://team.example.com",
        QUE_ACCESS_AUDIENCE: "the-que-application",
        DEV_USER_EMAIL: "ana.lima@example.com",
      },
      names: "DEV_USER_EMAIL",
    },
    {
      env: {
        QUE_ACCESS_TEAM_DOMAIN: "https://team.example.com",
        DEV_USER_EMAIL: "ana.lima@example.com",
      },
      names: "QUE_ACCESS_AUDIENCE",
    },
  ];
  for (const { env: overrides, names } of cases) {
    const started = await start(overrides);
    assert.notEqual(
      started.code,
      0,
      `the server started with ${names} and the Access setting in conflict, and exited 0`,
    );
    assert.match(
      started.stderr,
      new RegExp(names),
      `the server's message does not name ${names}: ${started.stderr}`,
    );
  }
});

test("given the same email, when an MCP client calls whoami, then the id it answers is the id of the users row users.ensure gives for the same identity, so a call decides permissions on the same row the web UI does", async () => {
  const email = "ben.tools@example.com";
  const name = "Ben Tools";
  await grant(email, name, "source-domain");

  const { value: who } = await withServer(
    { ...que(), DEV_USER_EMAIL: email, DEV_USER_NAME: name },
    async (client) =>
      answer(await client.callTool({ name: "whoami", arguments: {} })),
  );
  const row = await users.ensure({ email, name });

  assert.equal(
    who.id,
    row.id,
    `whoami answered ${JSON.stringify(who)}, and the users row for ${email} is ${row.id}`,
  );
});

test("given the fixture deployment and a user granted its domain, when an MCP client lists tools, then it lists that deployment's plugin ops as tools, a plugin the user cannot reach is not listed, and a call to such a tool answers the op's result as JSON text with no error", async () => {
  const email = "ana.tools@example.com";
  await grant(email, "Ana Tools", "source-domain", "till-domain");
  const codes = ["A-1", "B-2"];

  const { value } = await withServer(
    { ...que(), DEV_USER_EMAIL: email },
    async (client) => {
      const tools = (await client.listTools()).tools;
      const calls: Awaited<ReturnType<Client["callTool"]>>[] = [];
      for (const code of codes)
        calls.push(
          await client.callTool({
            name: "source.source-find",
            arguments: { code },
          }),
        );
      return { tools, calls };
    },
  );

  const find = value.tools.find((tool) => tool.name === "source.source-find");
  assert.ok(
    find,
    `source.source-find is not listed: ${value.tools.map((tool) => tool.name).join(", ")}`,
  );
  assert.equal(
    find.description,
    "Find a thing by its code.",
    "the tool does not carry its op's description",
  );
  assert.equal(
    value.tools.some((tool) => tool.name.startsWith("till.")),
    false,
    `a plugin the user cannot reach is listed: ${value.tools.map((tool) => tool.name).join(", ")}`,
  );

  const input = find.inputSchema as {
    type?: string;
    properties?: Record<string, { type?: string }>;
  };
  assert.equal(
    input.type,
    "object",
    `the tool's input is not an object: ${JSON.stringify(input)}`,
  );
  assert.equal(
    input.properties?.code?.type,
    "string",
    `the tool's input does not show code as a string: ${JSON.stringify(input)}`,
  );

  for (const [i, call] of value.calls.entries()) {
    const code = codes[i];
    assert.notEqual(
      call.isError,
      true,
      `source.source-find with { code: ${JSON.stringify(code)} } failed: ${text(call)}`,
    );
    const content = call.content as { type: string; text: string }[];
    assert.equal(
      content.length,
      1,
      `the answer is not one content part: ${JSON.stringify(content)}`,
    );
    assert.equal(content[0]?.type, "text");
    assert.deepEqual(
      JSON.parse(content[0]!.text),
      {},
      `the answer is not the op's result: ${content[0]!.text}`,
    );
  }
});

test("given a 2025-era client over stdio that declares form elicitation, when it calls the flagged till-void, then no elicitation is asked, the op does not run, and the result is an error that says it needs approval, that it cannot be approved over MCP, and that the call did not run", async () => {
  const email = "sam.stdio@example.com";
  const id = await grant(email, "Sam Stdio", "till-domain");
  await access.setCredential(till.definition.plugin, id, { key: "the-key" });

  const { value, asks } = await withElicitingServer(
    { ...que(), DEV_USER_EMAIL: email },
    (client) =>
      client.callTool({ name: "till.till-void", arguments: { item: "apple" } }),
  );

  assert.deepEqual(
    asks,
    [],
    `the server asked the client to answer: ${JSON.stringify(asks)}`,
  );
  refused(value);
});

test("given a 2025-era client over stdio that declares no elicitation, when it calls till-void, then the op does not run, and the result is the same refusal", async () => {
  const email = "tess.stdio@example.com";
  const id = await grant(email, "Tess Stdio", "till-domain");
  await access.setCredential(till.definition.plugin, id, { key: "the-key" });

  const { value } = await withServer(
    { ...que(), DEV_USER_EMAIL: email },
    (client) =>
      client.callTool({ name: "till.till-void", arguments: { item: "apple" } }),
  );

  refused(value);
});

test("given a session with no QUE_CREDENTIALS_KEY, when an MCP client lists the tools and calls one, then it lists the user's tools and the call answers the op's result", async () => {
  const email = "uma.tools@example.com";
  await grant(email, "Uma Tools", "source-domain");

  // The mouth needs no key of its own: only the credential store does, and this plugin has no credential.
  const { value } = await withServer(
    { ...que(), DEV_USER_EMAIL: email, QUE_CREDENTIALS_KEY: undefined },
    async (client) => ({
      listed: await tried(() => client.listTools()),
      called: await tried(() =>
        client.callTool({
          name: "source.source-find",
          arguments: { code: "A-1" },
        }),
      ),
    }),
  );

  assert.ok(
    value.listed.value,
    `a session with no QUE_CREDENTIALS_KEY did not list its tools: ${String(value.listed.error)}`,
  );
  assert.ok(
    value.listed.value.tools.some((tool) => tool.name === "source.source-find"),
    `the list does not name source.source-find: ${value.listed.value.tools.map((tool) => tool.name).join(", ")}`,
  );
  assert.ok(
    value.called.value,
    `a session with no QUE_CREDENTIALS_KEY did not answer the call: ${String(value.called.error)}`,
  );
  assert.notEqual(
    value.called.value.isError,
    true,
    `the call failed: ${text(value.called.value)}`,
  );
  const content = value.called.value.content as {
    type: string;
    text: string;
  }[];
  assert.deepEqual(
    JSON.parse(content[0]!.text),
    {},
    `the call's answer is not the op's result: ${content[0]!.text}`,
  );
});

test("given a deployment folder, when one session starts, then the deployment's ops are changed on disk, then a second session starts, then the second session lists the changed tools", async () => {
  const email = "cy.tools@example.com";
  await grant(email, "Cy Tools", "source-domain");
  const folder = copyDeployment(process.env.QUE_DEPLOYMENT!);
  try {
    const before = await listedTools(email, folder);
    assert.equal(
      before.some((tool) => tool.name === "source.source-find"),
      true,
      `the first session does not list the source op: ${before.map((tool) => tool.name).join(", ")}`,
    );
    assert.equal(
      before.some((tool) => tool.name === "source.source-list"),
      false,
      `the first session lists an op the deployment does not hold yet: ${before.map((tool) => tool.name).join(", ")}`,
    );

    addSourceList(folder);

    const after = await listedTools(email, folder);
    assert.equal(
      after.some((tool) => tool.name === "source.source-list"),
      true,
      `the second session does not list the changed deployment's op: ${after.map((tool) => tool.name).join(", ")}`,
    );
    assert.equal(
      after.some((tool) => tool.name === "source.source-find"),
      true,
      `the second session lost an op the deployment still holds: ${after.map((tool) => tool.name).join(", ")}`,
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
