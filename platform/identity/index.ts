/**
 * Identity: who is making this request. The only place that knows how login
 * works.
 *
 * Today: a fixed dev user from DEV_USER_EMAIL / DEV_USER_NAME.
 * Production (not wired yet): verify the Cloudflare Access JWT in the
 * `cf-access-jwt-assertion` header (signature, audience, expiry) and take the
 * email from the verified claims, never from a plain header.
 */

export type Identity = { email: string; name: string };

export async function identify(headers: Headers): Promise<Identity | null> {
  void headers; // read once Cloudflare Access is wired in
  const email = process.env.DEV_USER_EMAIL?.trim();
  if (!email) return null;
  return { email, name: process.env.DEV_USER_NAME?.trim() || email.split("@")[0] };
}
