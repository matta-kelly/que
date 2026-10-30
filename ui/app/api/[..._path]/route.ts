import { type NextRequest, NextResponse } from "next/server";
import { agentServer } from "@/components/runtime/agent-server";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function isAllowedRequestContext(req: NextRequest) {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite !== null) {
    return fetchSite === "same-origin" || fetchSite === "none";
  }

  const origin = req.headers.get("origin");
  if (origin === null) return true;

  try {
    return new URL(origin).origin === req.nextUrl.origin;
  } catch {
    return false;
  }
}

function crossOriginResponse() {
  return NextResponse.json(
    { error: "Cross-origin requests are not allowed." },
    { status: 403 },
  );
}

async function handleRequest(req: NextRequest, method: string) {
  if (!isAllowedRequestContext(req)) return crossOriginResponse();

  try {
    const apiUrl = agentServer(process.env.QUE_URL);

    const path = req.nextUrl.pathname.replace(/^\/?api\//, "");
    const searchParams = new URLSearchParams(req.nextUrl.search);
    searchParams.delete("_path");
    searchParams.delete("nxtP_path");
    const queryString = searchParams.toString()
      ? `?${searchParams.toString()}`
      : "";

    const headers = new Headers();
    const accept = req.headers.get("accept");
    if (accept) headers.set("accept", accept);

    const contentType = req.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    // A stream that was cut is asked for again from the last event the browser got.
    const lastEventId = req.headers.get("last-event-id");
    if (lastEventId) headers.set("last-event-id", lastEventId);

    // Who's asking is decided by que's server. Pass along Cloudflare Access's
    // signed identity token: que verifies it and takes the email from it.
    const accessToken = req.headers.get("cf-access-jwt-assertion");
    if (accessToken) headers.set("cf-access-jwt-assertion", accessToken);

    const options: RequestInit = {
      method,
      headers,
      redirect: "manual",
      signal: req.signal,
    };

    if (["POST", "PUT", "PATCH"].includes(method)) {
      // The bytes as they came: a multipart body's boundary and file bytes are
      // not text, and turning them into text corrupts both.
      options.body = await req.arrayBuffer();
    }

    const res = await fetch(`${apiUrl}/${path}${queryString}`, options);

    if (
      res.status === 0 ||
      (res.status >= 300 && res.status < 400 && res.status !== 304) ||
      res.type === "opaqueredirect"
    ) {
      await res.body?.cancel().catch(() => undefined);
      return NextResponse.json(
        { error: "que's server returned an unexpected redirect." },
        { status: 502 },
      );
    }

    const responseHeaders = new Headers(res.headers);
    for (const name of [
      "access-control-allow-credentials",
      "access-control-allow-headers",
      "access-control-allow-methods",
      "access-control-allow-origin",
      "content-encoding",
      "content-length",
      "set-cookie",
      "transfer-encoding",
    ]) {
      responseHeaders.delete(name);
    }
    responseHeaders.set("Cache-Control", "no-store");

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      const typedError = e as Error & { status?: number };
      return NextResponse.json(
        { error: typedError.message },
        { status: typedError.status ?? 500 },
      );
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

export const GET = (req: NextRequest) => handleRequest(req, "GET");
export const POST = (req: NextRequest) => handleRequest(req, "POST");
export const PUT = (req: NextRequest) => handleRequest(req, "PUT");
export const PATCH = (req: NextRequest) => handleRequest(req, "PATCH");
export const DELETE = (req: NextRequest) => handleRequest(req, "DELETE");
export const OPTIONS = (req: NextRequest) =>
  isAllowedRequestContext(req)
    ? new NextResponse(null, {
        status: 204,
        headers: { Allow: ALLOWED_METHODS },
      })
    : crossOriginResponse();
