# que UI

Chat UI for the que agent, built on [assistant-ui](https://www.assistant-ui.com/docs)
(from its `with-langgraph` example). Talks to the LangGraph server serving `server/harness/`
through the proxy at `app/api/[..._path]`.

- `app/`: routes, plus the root layout
- `components/<feature>/`: a feature, whole: its UI, its logic, its state and its tests, in one folder. So `components/assistant-ui/elements/usage/` has the meter, the counts and the cost, and `run-pickers/` has the pickers and the pick
- `hooks/`: React hooks that more than one feature uses
- `lib/`: three things many features share, and no more: the que API's types (`que-api.ts`), the fonts, and shadcn's `cn`. A lint rule stops a new file there
- `components/runtime/runtime-provider.tsx`: connects to the LangGraph server
  - a run outlives its connection. que makes the stream call itself, and sends each run to go on when its stream ends (`onDisconnect: "continue"`), with its events kept (`streamResumable`)
  - a stream that is cut is picked up by the SDK from the last event it got. The proxy hands on the header it does that with, `Last-Event-ID`
  - the run a thread is on is kept in session storage, from when the run is made to when its stream comes to its end (`components/runtime/run-of-thread.ts`)
  - stop is a call: `runs.cancel` with `interrupt`, for the run the open thread is on. The end of a stream cancels nothing, so a reload leaves the run going. A stop that comes before the chat has the id of its run finds the run on the server
  - a chat that is opened while its run is going joins it: when the saved chat is loaded and the server says the run is going, a run with no message is started in the library, and the stream call answers it with the events of that run from its first. Each event holds a message whole so far, so none is doubled
- `components/thread/toolkit.tsx`: custom UIs for agent tools, keyed by tool name
- `lib/que-api.ts`: the que API's response types and the fetcher for `useSWR`
- `components/assistant-ui/elements/run-pickers/pick.ts`: the pick of a chat, the agent and the model its runs name. The composer has a picker for each, made from what the deployment lists (`/api/que/deployment`)
  - the pick is kept in the thread's metadata, as `agent` and `model`, beside its title. A chat with no pick follows the deployment
  - the model can change at any message. The agent is fixed after the first
- `components/assistant-ui/elements/usage/counts.ts`: what a chat used, counted from the usage on each reply of the model
  - the meter, in the composer: a ring that fills as the chat grows, with what the chat cost beside it. It is of the chat's last model call, tokens in plus tokens out, over the window of the model the chat is on. Not a sum over the chat: each call sends the chat again
    - its panel, on hover or focus: the three parts of that call as the provider counts them (cached tokens in, the rest of tokens in, tokens out), the exact total over the window, the model, and the cost of the chat
    - it warns past the share the chat's agent summarizes at (`summarizeAt` on the agent in `/api/que/deployment`), and for an agent that does not summarize, past 85 percent
    - the ring is `components/assistant-ui/elements/usage/composer-context.tsx`: a copy of assistant-ui's `ComposerContext`, edited. What was changed is at the top of the file. `surfaces.tsx` and `utils/range.ts` beside it are the library's own, as shipped, and its other elements use them too
  - the line under a reply: the model that gave it (que's stamp, `response_metadata.que.model`), tokens in and tokens out. A reply is a turn: tokens out is the sum over its model calls, tokens in is from the last one. Cached and reasoning are in the tooltip
  - a reply's own messages come from the library's `getExternalStoreMessages`, which it marks experimental
- `components/assistant-ui/elements/usage/cost.ts`: what a chat cost, counted in the browser and stored in no place: the usage of each model call times the price of the model its stamp names. The price of a model is on `/api/que/deployment`
  - it shows in three places: the price beside each model in the picker, the cost at the end of the line under a reply, and the cost of the chat beside the meter's ring, and in its panel
  - a model call with no stamp, or of a model with no price, has no cost, and is not counted as zero. The chat's cost says how many replies it could not count
  - a cost is an estimate, at the price of today. The tokens of a subagent are in no count
- a unit test is beside the code it tests (`*.test.ts`), and runs on Node's own test runner, in `just check`
- `.env.local`: copy from `.env.example`
