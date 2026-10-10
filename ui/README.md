# que UI

Chat UI for the que agent, built on [assistant-ui](https://www.assistant-ui.com/docs)
(from its `with-langgraph` example). Talks to the LangGraph server serving `agent/`
through the proxy at `app/api/[..._path]`.

- `app/`: routes, plus the root layout
- `components/<feature>/`: UI; `hooks/`: React hooks; `lib/`: non-UI code
- `components/runtime-provider.tsx`: connects to the LangGraph server
- `components/thread/toolkit.tsx`: custom UIs for agent tools, keyed by tool name
- `lib/que-api.ts`: the que API's response types and the fetcher for `useSWR`
- `.env.local`: copy from `.env.example`
