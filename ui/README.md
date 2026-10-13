# que UI

Chat UI for the que agent, built on [assistant-ui](https://www.assistant-ui.com/docs)
(from its `with-langgraph` example). Talks to the LangGraph server serving `server/harness/`
through the proxy at `app/api/[..._path]`.

- `app/`: routes, plus the root layout
- `components/<feature>/`: UI; `hooks/`: React hooks; `lib/`: non-UI code
- `components/runtime-provider.tsx`: connects to the LangGraph server
- `components/thread/toolkit.tsx`: custom UIs for agent tools, keyed by tool name
- `lib/que-api.ts`: the que API's response types and the fetcher for `useSWR`
- `lib/run-pick.ts`: the pick of a chat, the agent and the model its runs name. The composer has a picker for each, made from what the deployment lists (`/api/que/deployment`)
  - the pick is kept in the thread's metadata, as `agent` and `model`, beside its title. A chat with no pick follows the deployment
  - the model can change at any message. The agent is fixed after the first
- `lib/usage.ts`: what a chat used, counted from the usage on each reply of the model
  - the meter, in the composer: the tokens of the chat's last model call, in plus out, over the window of the model the chat is on. Not a sum over the chat: each call sends the chat again
  - the line under a reply: the model that gave it (que's stamp, `response_metadata.que.model`), tokens in and tokens out. A reply is a turn: tokens out is the sum over its model calls, tokens in is from the last one. Cached and reasoning are in the tooltip
  - a reply's own messages come from the library's `getExternalStoreMessages`, which it marks experimental
- `lib/cost.ts`: what a chat cost, counted in the browser and stored in no place: the usage of each model call times the price of the model its stamp names. The price of a model is on `/api/que/deployment`
  - it shows in three places: the price beside each model in the picker, the cost at the end of the line under a reply, and the cost of the chat in the hover of the meter
  - a model call with no stamp, or of a model with no price, has no cost, and is not counted as zero. The chat's cost says how many replies it could not count
  - a cost is an estimate, at the price of today. The tokens of a subagent are in no count
- `lib/*.test.ts` run on Node's own test runner, in `just check`
- `.env.local`: copy from `.env.example`
