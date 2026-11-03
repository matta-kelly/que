/**
 * que's MCP server over stdio, as a harness runs it: the SDK's client transport
 * spawns `src/mcp/stdio.ts` as a real subprocess, and the protocol is stdin and
 * stdout. Who the tools answer for comes from DEV_USER_EMAIL in dev, and a bad
 * identity setting stops the start.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

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

/** The env a subprocess gets under `overrides`: the defaults, and no identity of this test's own. */
const env = (overrides: Record<string, string>) => ({
  ...getDefaultEnvironment(),
  NODE_OPTIONS: "--conditions=@mku1tra/que-source",
  ...overrides,
});

/** An MCP client for a real server subprocess, and the watch on anything it writes that is not a protocol message. */
async function connect(overrides: Record<string, string>) {
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
  overrides: Record<string, string>,
  run: (client: Client) => Promise<T>,
): Promise<{ value: T; noise: string[] }> {
  const { client, noise } = await connect(overrides);
  try {
    return { value: await run(client), noise };
  } finally {
    await client.close();
  }
}

/** The single text content a tool result carries, read as JSON. */
function answer(result: Awaited<ReturnType<Client["callTool"]>>) {
  assert.notEqual(result.isError, true, `whoami failed: ${text(result)}`);
  const content = result.content as { type: string; text: string }[];
  assert.equal(content.length, 1);
  assert.equal(content[0]?.type, "text");
  return JSON.parse(content[0]!.text) as { email: string; name: string };
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

test("given DEV_USER_EMAIL in the env, when an MCP client calls whoami over stdio, then it answers that que user, and the server writes nothing to stderr", async () => {
  for (const email of ["ana.lima@example.com", "ben.lima@example.com"]) {
    const { value: who, noise } = await withServer(
      { DEV_USER_EMAIL: email },
      async (client) =>
        answer(await client.callTool({ name: "whoami", arguments: {} })),
    );
    assert.equal(who.email, email);
    assert.equal(who.name, email.split("@")[0]);
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
