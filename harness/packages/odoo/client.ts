/**
 * Odoo client: credential in, connection out.
 * Owns auth and protocol; every Odoo error surfaces as OperationFailed.
 *
 * JSON-RPC against Odoo's external API (/jsonrpc): same execute_kw as the
 * XML-RPC client in data-ops, over plain fetch.
 */

import * as z from "zod";
import { OperationFailed } from "@que/core";

export const credential = z.object({
  url: z.string().url(),
  db: z.string().min(1),
  login: z.string().min(1),
  apiKey: z.string().min(1),
});

export type OdooCredential = z.infer<typeof credential>;

export type OdooConnection = {
  /** The Odoo user id this connection is logged in as. */
  uid: number;
  call(
    model: string,
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
  ): Promise<unknown>;
};

type RpcResponse = {
  result?: unknown;
  error?: { message: string; data?: { name?: string; message?: string } };
};

/** How long one Odoo request may take before it's abandoned. */
export const TIMEOUT_MS = 15_000;

export async function connect(
  credential: OdooCredential,
): Promise<OdooConnection> {
  const endpoint = `${credential.url.replace(/\/$/, "")}/jsonrpc`;
  const at = `Odoo at ${credential.url}`;

  // Three different failures, worded so the model can tell the user what to do:
  // no answer in time, no answer at all, or an answer that isn't a result.
  async function rpc(
    service: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    let body: RpcResponse;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: { service, method, args },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok)
        throw new OperationFailed(
          `${at} answered HTTP ${res.status} ${res.statusText}; Odoo may be down or restarting. Try again later.`,
        );
      body = (await res.json()) as RpcResponse;
    } catch (error) {
      if (error instanceof OperationFailed) throw error;
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new OperationFailed(
          `${at} didn't answer within ${TIMEOUT_MS / 1000}s; it may be busy. Try again, or ask for fewer records.`,
        );
      }
      if (error instanceof SyntaxError)
        throw new OperationFailed(
          `${at} answered with something that isn't JSON-RPC; check the Odoo URL.`,
        );
      const { cause } = error as {
        cause?: { code?: string; message?: string };
      };
      const why = cause?.code ?? cause?.message ?? String(error); // e.g. ECONNREFUSED, ENOTFOUND
      throw new OperationFailed(
        `${at} is unreachable (${why}); check the URL and network. Retrying won't help until it's reachable.`,
      );
    }
    if (body.error) {
      // e.g. "odoo.exceptions.AccessError" → "AccessError"
      const kind = body.error.data?.name?.split(".").pop();
      throw new OperationFailed(
        `Odoo refused the request${kind ? ` (${kind})` : ""}: ${body.error.data?.message ?? body.error.message}`,
      );
    }
    return body.result;
  }

  const uid = await rpc("common", "authenticate", [
    credential.db,
    credential.login,
    credential.apiKey,
    {},
  ]);
  if (!uid) {
    throw new OperationFailed(
      `Odoo login failed for ${credential.login} on db ${credential.db}`,
    );
  }

  // The credential stays in this closure; callers only ever see call().
  return {
    uid: uid as number,
    call: (model, method, args = [], kwargs = {}) =>
      rpc("object", "execute_kw", [
        credential.db,
        uid,
        credential.apiKey,
        model,
        method,
        args,
        kwargs,
      ]),
  };
}
