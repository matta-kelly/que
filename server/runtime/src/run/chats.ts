/**
 * A chat's agent: built at the chat's first run, and kept for each run after
 * it. So what an agent is built from (the user's access, their own
 * instructions) takes effect from the next chat, not part way through one.
 * A login is still read at each tool call, so a changed one is used at once.
 *
 * A chat is a thread, with the user, the agent config and the model the run
 * names: a run on one thread that names another agent or model gets its own.
 * The kept agents are held in memory, at most `max`, and the one used least
 * recently goes first. A chat that went, or a restart of the server, builds
 * its agent again at its next run, with what the user has at that time.
 *
 * The agent holds no state of a run: the chat is in the thread's checkpoint,
 * and each middleware reads it from there.
 */

import { LRUCache } from "lru-cache";

/** How many chats keep their agent. */
export const CHATS_MAX = 100;

type Call = { configurable?: Record<string, unknown> } | undefined;
type Runtime = { accessContext?: string } | undefined;

/**
 * If the server calls the factory for a run. It also calls it to read the
 * graph, its schemas and a thread's state (`@langchain/langgraph-api`,
 * `graph/load.mjs`).
 */
export const isRun = (runtime: Runtime) =>
  runtime?.accessContext === "threads.create_run";

type Chat = { user: string; agent: unknown; model: unknown };

/**
 * Gives the factory's agent for a call: the chat's own for a run, built at
 * its first; a new one for any other call, which is kept for none.
 */
export function chats<A extends object>(
  build: (user: string, agent: unknown, model: unknown) => Promise<A>,
  max = CHATS_MAX,
) {
  const kept = new LRUCache<string, A, Chat>({
    max,
    // A chat pushed out while its first build runs still gets that build.
    ignoreFetchAbort: true,
    // A build that fails is not kept: the next run builds again.
    fetchMethod: (_key, _stale, { context }) =>
      build(context.user, context.agent, context.model),
  });

  return (config: Call, runtime: Runtime): Promise<A> => {
    const { thread_id: thread, agent, model } = config?.configurable ?? {};
    const user =
      (config?.configurable?.langgraph_auth_user_id as string | undefined) ??
      "anonymous";
    // The server gives every run a thread: one that names none gets a new thread of its own.
    if (!isRun(runtime) || typeof thread !== "string")
      return build(user, agent, model);
    return kept.forceFetch(JSON.stringify([thread, user, agent, model]), {
      context: { user, agent, model },
    });
  };
}
