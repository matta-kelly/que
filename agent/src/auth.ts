/**
 * LangGraph custom auth (langgraph.json → auth.path). Runs on every request to
 * the LangGraph server, including our custom API routes.
 *
 * Who: @que/identity says who's asking; @que/users gets or creates their row.
 * The user's id becomes `langgraph_auth_user_id` in every run's config, which
 * the agent uses to pick their packages and credentials.
 *
 * What they can see: every thread/run/etc. is stamped with its owner, and
 * reads are filtered to the caller's own.
 */

import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";
import { identify } from "@que/identity";
import { users } from "./users.js";

export const auth = new Auth()
  .authenticate(async (request: Request) => {
    const identity = await identify(request.headers);
    if (!identity) throw new HTTPException(401, { message: "Not signed in" });
    const user = await users.ensure(identity);
    return { identity: user.id, display_name: user.name, email: user.email, permissions: [], is_authenticated: true };
  })
  .on("*", ({ value, user }) => {
    if (value && typeof value === "object" && "metadata" in value) {
      const v = value as { metadata?: Record<string, unknown> | null };
      v.metadata = { ...(v.metadata ?? {}), owner: user.identity };
    }
    return { owner: user.identity };
  });
