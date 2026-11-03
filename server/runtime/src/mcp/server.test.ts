/**
 * que's MCP server over an in-memory transport, with no subprocess: who the
 * tools answer for comes from `@que/identity`, through the same Access JWT the
 * web UI uses. The token reaches the stdio server as `QUE_ACCESS_JWT`, and the
 * server carries it to `identify` as `cf-access-jwt-assertion`.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type CryptoKey, exportJWK, generateKeyPair, SignJWT } from "jose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "./server.js";

/** The env this test owns, and gives back as it found it. */
const managed = [
  "QUE_ACCESS_TEAM_DOMAIN",
  "QUE_ACCESS_AUDIENCE",
  "QUE_ACCESS_JWT",
  "DEV_USER_EMAIL",
  "DEV_USER_NAME",
] as const;

/** Runs `run` with the env exactly as given, and puts back what was there. */
async function withEnv(
  values: Partial<Record<(typeof managed)[number], string>>,
  run: () => Promise<void>,
): Promise<void> {
  const before = new Map(managed.map((name) => [name, process.env[name]]));
  for (const name of managed) delete process.env[name];
  Object.assign(process.env, values);
  try {
    await run();
  } finally {
    for (const name of managed) {
      const value = before.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** Calls `whoami` as an MCP client would, and returns what the call answered. */
async function whoami(server: McpServer) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "que-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name: "whoami", arguments: {} });
  } finally {
    await client.close();
  }
}

/** The single text content a tool result carries, read as JSON. */
function answer(result: Awaited<ReturnType<typeof whoami>>) {
  const content = result.content as { type: string; text: string }[];
  assert.equal(content.length, 1);
  assert.equal(content[0]?.type, "text");
  return JSON.parse(content[0]!.text) as { email: string; name: string };
}

const audience = "the-que-application";
const team = await generateKeyPair("RS256");
const kid = "the-team-key";
const publicKey = {
  ...(await exportJWK(team.publicKey)),
  kid,
  alg: "RS256",
  use: "sig",
};

const keyServers: Server[] = [];

/** The team domain's key set, served from this test's own localhost. */
const teamDomain = await new Promise<string>((ready) => {
  const keys: Server = createServer((request, response) => {
    if (request.url !== "/cdn-cgi/access/certs") {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("the key set cannot be read");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [publicKey] }));
  });
  keys.listen(0, "127.0.0.1", () => {
    const { port } = keys.address() as AddressInfo;
    keyServers.push(keys);
    ready(`http://127.0.0.1:${port}`);
  });
});

after(() => {
  for (const keys of keyServers) keys.close();
});

/** A token from que's login, signed by the team's key, for this email. */
const jwt = (email: string) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(teamDomain)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(team.privateKey as CryptoKey);

test("given both Access settings and a signed Access JWT in the env, when an MCP client calls whoami, then it gets the que user the token's email names", async () => {
  await withEnv(
    {
      QUE_ACCESS_TEAM_DOMAIN: teamDomain,
      QUE_ACCESS_AUDIENCE: audience,
      QUE_ACCESS_JWT: await jwt("ana.lima@example.com"),
    },
    async () => {
      const who = answer(await whoami(createMcpServer()));
      assert.equal(who.email, "ana.lima@example.com");
      assert.equal(who.name, "ana.lima");
    },
  );

  await withEnv(
    {
      QUE_ACCESS_TEAM_DOMAIN: teamDomain,
      QUE_ACCESS_AUDIENCE: audience,
      QUE_ACCESS_JWT: await jwt("ben.lima@example.com"),
    },
    async () => {
      const who = answer(await whoami(createMcpServer()));
      assert.equal(who.email, "ben.lima@example.com");
      assert.equal(who.name, "ben.lima");
    },
  );
});

test("given no token and no DEV_USER_EMAIL, when an MCP client calls whoami, then the call is rejected, not answered as a default user", async () => {
  await withEnv(
    { QUE_ACCESS_TEAM_DOMAIN: teamDomain, QUE_ACCESS_AUDIENCE: audience },
    async () => {
      const result = await whoami(createMcpServer());
      assert.equal(
        result.isError,
        true,
        "whoami answered a user with no token",
      );
    },
  );

  await withEnv({}, async () => {
    const result = await whoami(createMcpServer());
    assert.equal(
      result.isError,
      true,
      "whoami answered the default user with no DEV_USER_EMAIL",
    );
  });
});

test("given neither Access setting and DEV_USER_EMAIL set, when an MCP client calls whoami, then the name is DEV_USER_NAME or the email's first part", async () => {
  await withEnv(
    { DEV_USER_EMAIL: "cara.lima@example.com", DEV_USER_NAME: "Cara Lima" },
    async () => {
      const who = answer(await whoami(createMcpServer()));
      assert.equal(who.email, "cara.lima@example.com");
      assert.equal(who.name, "Cara Lima");
    },
  );

  await withEnv({ DEV_USER_EMAIL: "dana.lima@example.com" }, async () => {
    const who = answer(await whoami(createMcpServer()));
    assert.equal(who.email, "dana.lima@example.com");
    assert.equal(who.name, "dana.lima");
  });
});
