"use generative";

import { defineToolkit } from "@assistant-ui/react";

// Custom UIs for agent tools, keyed by tool name (e.g. odoo-get-company).
// Tools without an entry here render with the default tool-call display.
//
// A call that waits for a yes answers through the app's approval hooks
// (components/runtime/approval), not through the part's `respondToApproval`:
// the interrupt's schema names each decision the op allows, which the library's
// approval seam does not carry, so the part has no approval and the library has
// no resume for it. An entry reads its call's interrupt with `useInterrupt`,
// holds and sends its answer with `useAnswer`, and shows what it holds with
// `useHeldAnswer`. The entry's answers join the batch, so one resume carries
// every waiting call of the reply.
export default defineToolkit({});
