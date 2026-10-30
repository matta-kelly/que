/**
 * Who is asking, from Cloudflare Access. The team domain's key set is served
 * by this test on localhost, and every token is signed by a key pair the test
 * makes, so no request reaches Cloudflare.
 *
 * With both Access settings, the identity comes from the token's verified
 * email claim. Without them, it comes from DEV_USER_EMAIL, as before. A start
 * with both settings and DEV_USER_EMAIL, or with only one Access setting,
 * stops and names the settings.
 */

import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { type CryptoKey, exportJWK, generateKeyPair, SignJWT } from "jose";
import { deploymentRoot } from "../../tests/deployment-root.js";
import { identify } from "./index.js";

const team = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
const kid = "the-team-key";
const audience = "the-que-application";
const publicKey = {
  ...(await exportJWK(team.publicKey)),
  kid,
  alg: "RS256",
  use: "sig",
};

/** A server for the team domain's key set, or one that cannot give it. */
function keyServer(keys: object[] | null) {
  const server: Server = createServer((request, response) => {
    if (keys && request.url === "/cdn-cgi/access/certs") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys }));
      return;
    }
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("the key set cannot be read");
  });
  return new Promise<{ url: string; server: Server }>((ready) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      ready({ url: `http://127.0.0.1:${port}`, server });
    });
  });
}

const keys = await keyServer([publicKey]);
const noKeys = await keyServer(null);

after(() => {
  keys.server.close();
  noKeys.server.close();
});

afterEach(() => {
  delete process.env.QUE_ACCESS_TEAM_DOMAIN;
  delete process.env.QUE_ACCESS_AUDIENCE;
  delete process.env.DEV_USER_EMAIL;
  delete process.env.DEV_USER_NAME;
});

const signed = (
  privateKey: CryptoKey,
  {
    issuer = keys.url,
    aud = audience,
    email = "ana.lima@example.com",
    expires = "5m",
    kid: keyId = kid,
  }: {
    issuer?: string;
    aud?: string;
    email?: string;
    expires?: string | number;
    kid?: string;
  } = {},
) =>
  new SignJWT(email === "" ? {} : { email })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(privateKey);

const plainEmail = {
  "cf-access-authenticated-user-email": "mallory@example.com",
};

const headers = (token?: string) =>
  new Headers({
    ...plainEmail,
    ...(token ? { "cf-access-jwt-assertion": token } : {}),
  });

test("with both Access settings, a token signed by the team's key gives its email, and the email's first part as the name", async () => {
  process.env.QUE_ACCESS_TEAM_DOMAIN = keys.url;
  process.env.QUE_ACCESS_AUDIENCE = audience;

  assert.deepEqual(await identify(headers(await signed(team.privateKey))), {
    email: "ana.lima@example.com",
    name: "ana.lima",
  });
});

test("with both Access settings, when the token is missing, forged, expired, for another audience or issuer, has no email, or the keys cannot be read, then identify gives null, whatever plain email header the request holds", async () => {
  process.env.QUE_ACCESS_TEAM_DOMAIN = keys.url;
  process.env.QUE_ACCESS_AUDIENCE = audience;
  // The dev fallback is set to prove that Access settings turn it off. A real
  // start with both of them and this setting stops (the test below).
  process.env.DEV_USER_EMAIL = "dev@example.com";

  assert.equal(await identify(headers()), null);

  const now = Math.floor(Date.now() / 1000);
  const expired = await new SignJWT({ email: "ana.lima@example.com" })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(keys.url)
    .setAudience(audience)
    .setIssuedAt(now - 120)
    .setExpirationTime(now - 60)
    .sign(team.privateKey);

  assert.equal(await identify(headers(await signed(other.privateKey))), null);
  assert.equal(await identify(headers(expired)), null);
  assert.equal(
    await identify(
      headers(await signed(team.privateKey, { aud: "another-app" })),
    ),
    null,
  );
  assert.equal(
    await identify(
      headers(
        await signed(team.privateKey, {
          issuer: "https://another-team.example",
        }),
      ),
    ),
    null,
  );
  assert.equal(
    await identify(headers(await signed(team.privateKey, { email: "" }))),
    null,
  );

  process.env.QUE_ACCESS_TEAM_DOMAIN = noKeys.url;
  assert.equal(
    await identify(
      headers(await signed(team.privateKey, { issuer: noKeys.url })),
    ),
    null,
  );
});

/** que's server, started as a process, with the settings given and a database that refuses at once. */
const started = (settings: Record<string, string>) =>
  new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const base: NodeJS.ProcessEnv = { ...process.env };
    delete base.DEV_USER_EMAIL;
    delete base.DEV_USER_NAME;
    delete base.QUE_ACCESS_TEAM_DOMAIN;
    delete base.QUE_ACCESS_AUDIENCE;
    execFile(
      process.execPath,
      [
        "--import",
        "tsx",
        join(import.meta.dirname, "../../runtime/src/listen.ts"),
      ],
      {
        env: {
          ...base,
          QUE_DEPLOYMENT: deploymentRoot(
            join(import.meta.dirname, "../../tests/integration/mount/fixtures"),
            "two",
          ),
          DATABASE_URL: "postgresql://postgres@127.0.0.1:1/postgres",
          QUE_CREDENTIALS_KEY: randomBytes(32).toString("base64"),
          ...settings,
        },
        timeout: 20_000,
      },
      (error, out, err) =>
        resolve({
          code: error ? ((error.code as number | undefined) ?? 1) : 0,
          out,
          err,
        }),
    );
  });

test(
  "with both Access settings and DEV_USER_EMAIL, or only one of the two settings, que stops at start, and the error names them",
  { timeout: 60_000 },
  async () => {
    const both = await started({
      QUE_ACCESS_TEAM_DOMAIN: keys.url,
      QUE_ACCESS_AUDIENCE: audience,
      DEV_USER_EMAIL: "ana@example.com",
    });
    assert.notEqual(both.code, 0);
    assert.match(both.out + both.err, /DEV_USER_EMAIL/);
    assert.match(both.out + both.err, /QUE_ACCESS_TEAM_DOMAIN/);
    assert.match(both.out + both.err, /QUE_ACCESS_AUDIENCE/);

    const noAudience = await started({ QUE_ACCESS_TEAM_DOMAIN: keys.url });
    assert.notEqual(noAudience.code, 0);
    assert.match(noAudience.out + noAudience.err, /QUE_ACCESS_AUDIENCE/);

    const noTeam = await started({ QUE_ACCESS_AUDIENCE: audience });
    assert.notEqual(noTeam.code, 0);
    assert.match(noTeam.out + noTeam.err, /QUE_ACCESS_TEAM_DOMAIN/);
  },
);

test("with neither Access setting, DEV_USER_EMAIL decides, and the name is DEV_USER_NAME or the email's first part", async () => {
  process.env.DEV_USER_EMAIL = "ana@example.com";
  process.env.DEV_USER_NAME = "Ana Lima";
  assert.deepEqual(await identify(headers()), {
    email: "ana@example.com",
    name: "Ana Lima",
  });

  delete process.env.DEV_USER_NAME;
  assert.deepEqual(await identify(headers()), {
    email: "ana@example.com",
    name: "ana",
  });

  delete process.env.DEV_USER_EMAIL;
  assert.equal(await identify(headers()), null);
});
