/**
 * The repeat guard on pi: a tool call that fails three times in a row, with
 * the same arguments and the same error, ends the run, and the user is told
 * the call and the error. The count is read from the saved chat, so a repeat
 * across turns counts.
 *
 * Not built yet: a stub, so its tests reach their assertions.
 */

import type { HookRegistration } from "@earendil-works/pi-durable";

/** The guard's hooks, for an extension that every conversation selects. */
export const repeatGuard: HookRegistration[] = [];
