import type { Client } from "@langchain/langgraph-sdk";
import type {
  LangChainMessage,
  LangGraphMessagesEvent,
  LangGraphStreamCallback,
} from "@assistant-ui/react-langgraph";
import {
  setReconnecting,
  setStopped,
  useRunStates,
} from "@/components/chat/run-states/store";
import { STREAM_MODE, runOptions } from "@/components/runtime/runs/run-options";
import { runs } from "@/components/runtime/runs/run-of-thread";
import { resolve } from "@/components/chat/run-pickers/pick";
import { pickOf, useRunPicks } from "@/components/chat/run-pickers/pick-store";
import {
  mapMessages,
  withReasoning,
} from "@/components/runtime/with-reasoning";
import { agentGraph } from "@/components/runtime/agent-server";

// Read by its whole name, so Next.js puts the value into the browser's code.
const ASSISTANT_ID = agentGraph(process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID);
// The id that takes every message out, as LangGraph has it.
const REMOVE_ALL_MESSAGES = "__remove_all__";
// A stop was asked for while the chat did not have the id of its run yet.
let stopAsked = false;

// The chat asks for a stop of a run it has no id for yet: StopsRuns sets the flag.
export const askStop = () => {
  stopAsked = true;
};

export const createStreamCall = (client: Client) => {
  // que makes the stream call itself: the library's helper cannot send a run that
  // outlives its connection. A run is sent to go on when its stream ends, with
  // its events kept (`runOptions`), so a cut stream is picked up again, by the
  // SDK from the last event it got, and by the chat when it is opened again.
  // Stop is then a call of its own: see `StopsRuns`.
  const call: LangGraphStreamCallback<LangChainMessage> = async function* (
    messages,
    config,
  ) {
    const { externalId: thread } = await config.initialize();
    if (!thread) throw new Error("Thread has not been initialized.");
    // A send of no message, on a thread that has a run going: the chat was
    // opened in the middle of that run, and joins it. From its first event:
    // each one holds a message whole so far, so one the chat has is not doubled.
    const going = runs.get(thread);
    // Not a refresh of a reply: that is a send of no message too, from a checkpoint.
    const joins =
      going !== undefined &&
      !messages.length &&
      config.command == null &&
      config.checkpointId == null;
    stopAsked = false;
    let run = joins ? going : undefined;
    try {
      if (joins) {
        // The chat says it is picking the run up, for a second at the least, so it can be read.
        setReconnecting(thread, true);
        setTimeout(() => setReconnecting(thread, false), 1_000);
        yield* client.runs.joinStream(thread, going, {
          signal: config.abortSignal,
          lastEventId: "-1",
          streamMode: STREAM_MODE,
        }) as AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>>;
      } else {
        // A new run takes the mark of a stop away, here and with the thread.
        if (useRunStates.getState().stopped[thread]) {
          setStopped(thread, false);
          client.threads
            .update(thread, { metadata: { stopped: false } })
            .catch(() => {});
        }
        // A run with no message goes on from the last saved step (Continue, after a
        // stop). The chat is first set to what is saved: the part of a reply that
        // came in before the stop is not saved, and would stay above the new one.
        if (!messages.length && config.command == null) {
          const saved = await client.threads.getState<{
            messages?: LangChainMessage[];
          }>(thread);
          yield {
            event: "messages/complete",
            data: [
              { type: "remove", id: REMOVE_ALL_MESSAGES },
              ...(saved.values?.messages ?? []).map(withReasoning),
            ],
          };
        }
        const state = useRunPicks.getState();
        const { send } = resolve(pickOf(state, thread), state.deployment);
        // Each run names what its chat picked.
        yield* client.runs.stream(thread, ASSISTANT_ID, {
          ...runOptions(messages, config, send),
          signal: config.abortSignal,
          onRunCreated: ({ run_id }) => {
            run = run_id;
            runs.set(thread, run_id);
          },
        }) as AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>>;
      }
      // The stream came to its end, so the run is over. A stream that was cut
      // (a stop, a reload, a look at another chat, a network that dropped)
      // leaves what is kept as it is: the run may be going on, and the chat
      // asks the server when it is opened again.
      if (run) runs.clear(thread, run);
    } catch (error) {
      // A stop that came before the id of the run did: the run is on the server
      // with nothing in the chat to name it, so it is found there and cancelled.
      if (config.abortSignal.aborted && !run && stopAsked) {
        stopAsked = false;
        // Asked for by status: a list of all the runs of a thread is its first few, in no order.
        for (const status of ["pending", "running"] as const) {
          const active = await client.runs
            .list(thread, { status })
            .catch(() => []);
          for (const { run_id } of active)
            client.runs
              .cancel(thread, run_id, false, "interrupt")
              .catch(() => {});
        }
      }
      // An end from this side is not an error for the chat. A join that fails is a
      // run with no events left to give: the chat is as it was loaded.
      if (config.abortSignal.aborted || joins) return;
      throw error;
    }
  };
  return async function* (...args: Parameters<typeof call>) {
    for await (const event of await call(...args)) {
      yield event.event.startsWith("messages")
        ? { ...event, data: mapMessages(event.data) }
        : event;
    }
  } as typeof call;
};
