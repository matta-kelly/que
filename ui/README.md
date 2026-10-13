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
  - `lib/run-pick.test.ts` runs on Node's own test runner, in `just check`
- `.env.local`: copy from `.env.example`
