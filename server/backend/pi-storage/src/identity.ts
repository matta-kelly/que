/**
 * A string pi indexes, encoded for a Postgres text column. JSON text escapes a lone surrogate and U+0000, which the
 * column cannot hold, and it is injective, so two identities keep two keys. The record keeps the string itself.
 */

import type { DocumentRecord } from "@earendil-works/pi-durable";

export const encoded = (value: string): string => JSON.stringify(value);

/** The exact scope of a document, as the scans and addresses key it. */
export function scopeKey(scope: DocumentRecord["scope"]): string {
  switch (scope.kind) {
    case "session":
      return encoded("session");
    case "conversation":
      return encoded(`conversation:${scope.conversationId}`);
    case "task":
      return encoded(`task:${scope.taskId}`);
  }
}

/** One logical document address, singleton or family member, as `findDocument` keys it. */
export const addressKey = (address: {
  readonly kind: string;
  readonly scope: DocumentRecord["scope"];
  readonly key?: string;
}): string =>
  encoded(
    JSON.stringify([
      address.kind,
      address.scope.kind,
      address.scope.kind === "conversation"
        ? address.scope.conversationId
        : address.scope.kind === "task"
          ? address.scope.taskId
          : null,
      address.key ?? null,
    ]),
  );
