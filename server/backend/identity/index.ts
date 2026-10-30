/**
 * Identity: who is making this request. The only place that knows how login
 * works.
 *
 * With both Access settings, the Cloudflare Access JWT in the
 * `cf-access-jwt-assertion` header decides: its signature, issuer, audience and
 * expiry are verified, and the email comes from the verified claims, never from
 * a plain header. With neither setting, a fixed dev user comes from
 * DEV_USER_EMAIL / DEV_USER_NAME.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

export type Identity = { email: string; name: string };

type Access = { teamDomain: string; audience: string };

/**
 * The Access settings, or undefined with neither. One without the other is a
 * deployment mistake, and throws with the missing name.
 */
function accessSettings(env = process.env): Access | undefined {
  const teamDomain = env.QUE_ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, "");
  const audience = env.QUE_ACCESS_AUDIENCE?.trim();
  if (!teamDomain && !audience) return undefined;
  if (!teamDomain || !audience) {
    const missing = [
      ...(teamDomain ? [] : ["QUE_ACCESS_TEAM_DOMAIN"]),
      ...(audience ? [] : ["QUE_ACCESS_AUDIENCE"]),
    ];
    throw new Error(
      `identity: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set. Set QUE_ACCESS_TEAM_DOMAIN and QUE_ACCESS_AUDIENCE together, or neither`,
    );
  }
  return { teamDomain, audience };
}

/**
 * Stops a start that has an Access setting without its pair, or Access together
 * with DEV_USER_EMAIL. Both are deployment mistakes, and a bad start fails once
 * and names them, rather than turning every request away.
 */
export function checkAccessSettings(env = process.env): void {
  if (!accessSettings(env)) return;
  if (env.DEV_USER_EMAIL?.trim())
    throw new Error(
      "identity: QUE_ACCESS_TEAM_DOMAIN and QUE_ACCESS_AUDIENCE are set, and so is DEV_USER_EMAIL. With Access, the verified token decides the email: remove DEV_USER_EMAIL, or remove both Access settings",
    );
}

/** The team domain's key set: fetched once per team domain, and jose refetches it for a key id it does not know. */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySet(teamDomain: string) {
  let keys = keySets.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    keySets.set(teamDomain, keys);
  }
  return keys;
}

export async function identify(headers: Headers): Promise<Identity | null> {
  const access = accessSettings();
  if (!access) {
    const email = process.env.DEV_USER_EMAIL?.trim();
    if (!email) return null;
    return {
      email,
      name: process.env.DEV_USER_NAME?.trim() || email.split("@")[0],
    };
  }

  const token = headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keySet(access.teamDomain), {
      issuer: access.teamDomain,
      audience: access.audience,
    });
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!email) return null;
    return { email, name: email.split("@")[0] };
  } catch {
    return null;
  }
}
