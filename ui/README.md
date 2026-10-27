# que UI

Chat UI for the que agent, built on [assistant-ui](https://www.assistant-ui.com/docs)
(from its `with-langgraph` example). Talks to the LangGraph server serving `server/runtime/`
through the proxy at `app/api/[..._path]`.

- `app/`: routes, plus the root layout
- `components/<feature>/`: a feature, whole: its UI, its logic, its state and its tests, in one folder. So `components/chat/usage/` has the meter, the counts and the cost, and `run-pickers/` has the pickers and the pick
- `components/` is in groups: `ui/` (shadcn), `assistant-ui/` (the library's files only; a lint rule stops a new one), `chat/` (que's chat features), `runtime/` (connects the chat to the server; `runtime/runs/` is a run's life), `shell/` (the app frame, with `shell/sidebar/`) and `settings/`
- `hooks/`: React hooks that more than one feature uses
- `lib/`: three things many features share, and no more: the que API's types (`que-api.ts`), the fonts, and shadcn's `cn`. A lint rule stops a new file there
- `components/runtime/runtime-provider.tsx`: connects to the LangGraph server
  - a run outlives its connection. que makes the stream call itself, and sends each run to go on when its stream ends (`onDisconnect: "continue"`), with its events kept (`streamResumable`). What a run is sent is `components/runtime/runs/run-options.ts`
  - a stream that is cut is picked up by the SDK from the last event it got. The proxy hands on the header it does that with, `Last-Event-ID`
  - the run a thread is on is kept in session storage, from when the run is made to when its stream comes to its end (`components/runtime/runs/run-of-thread.ts`)
  - stop is a call: `runs.cancel` with `interrupt`, for the run the open thread is on. The end of a stream cancels nothing, so a reload leaves the run going. A stop that comes before the chat has the id of its run finds the run on the server
  - a chat that is opened while its run is going joins it: when the saved chat is loaded and the server says the run is going, a run with no message is started in the library, and the stream call answers it with the events of that run from its first. Each event holds a message whole so far, so none is doubled. What the chat does by the server's answer is `components/runtime/runs/kept-run.ts`: a run that has ended, or that the server does not have, is let go of
  - `components/chat/message-queue/`: a message sent while a run is going waits above the composer, can be taken back, and is sent when that run ends. It is the library's own queue (`unstable_enableMessageQueue`), kept in the browser: a stop or a closed tab lets the waiting messages go, and a message runs on the pick of the time it is sent
  - `components/chat/run-states/`: what the chat shows for a run that did not go the plain way, above the composer. A `Stopped` mark with `Continue` after a stop, and a `Reconnecting` line while the chat joins a run. That a thread was stopped is kept in its metadata (`stopped`), and a new run takes it away. `Continue` is a run with no message, from the last saved step: the chat is first set to what is saved, since the part of a reply that came in before the stop is not
- `components/chat/toolkit.tsx`: custom UIs for agent tools, keyed by tool name
- `lib/que-api.ts`: the que API's response types and the fetcher for `useSWR`
- `components/chat/run-pickers/pick.ts`: the pick of a chat, the agent and the model its runs name. The composer has a picker for each, made from what the deployment lists (`/api/que/deployment`)
  - the pick is kept in the thread's metadata, as `agent` and `model`, beside its title. A chat with no pick follows the deployment
  - the model can change at any message. The agent is fixed after the first
- `components/chat/usage/counts.ts`: what a chat used, counted from the usage on each reply of the model
  - the meter, in the composer: a ring that fills as the chat grows, with what the chat cost beside it. It is of the chat's last model call, tokens in plus tokens out, over the window of the model the chat is on. Not a sum over the chat: each call sends the chat again
    - its panel, on hover or focus: the three parts of that call as the provider counts them (cached tokens in, the rest of tokens in, tokens out), the exact total over the window, the model, and the cost of the chat
    - it warns past the share the chat's agent summarizes at (`summarizeAt` on the agent in `/api/que/deployment`), and for an agent that does not summarize, past 85 percent
    - the ring is `components/chat/usage/composer-context.tsx`: a copy of assistant-ui's `ComposerContext`, edited. What was changed is at the top of the file. `surfaces.tsx` and `utils/range.ts` beside it are the library's own, as shipped, and its other elements use them too
  - the line under a reply: the model that gave it (que's stamp, `response_metadata.que.model`), tokens in and tokens out. A reply is a turn: tokens out is the sum over its model calls, tokens in is from the last one. Cached and reasoning are in the tooltip
  - a reply's own messages come from the library's `getExternalStoreMessages`, which it marks experimental
- `components/chat/usage/cost.ts`: what a chat cost, counted in the browser and stored in no place: the usage of each model call times the price of the model its stamp names. The price of a model is on `/api/que/deployment`
  - it shows in three places: the price beside each model in the picker, the cost at the end of the line under a reply, and the cost of the chat beside the meter's ring, and in its panel
  - a model call with no stamp, or of a model with no price, has no cost, and is not counted as zero. The chat's cost says how many replies it could not count
  - a cost is an estimate, at the price of today. The tokens of a subagent are in no count
- a unit test is beside the code it tests (`*.test.ts`), and runs on Node's own test runner, in `just check`
- `.env.local`: not needed. With none, the UI talks to que's own agent server (`components/runtime/agent-server.ts`). `.env.example` lists the settings that point it elsewhere
