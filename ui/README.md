# que UI

Chat UI for the que agent, built on [assistant-ui](https://www.assistant-ui.com/docs).
Talks to que's server (`server/runtime/`) over AG-UI, through the proxy at
`app/api/[..._path]`.

- `app/`: routes, plus the root layout
- `components/<feature>/`: a feature, whole: its UI, its logic, its state and its tests, in one folder. So `run-pickers/` has the pickers, the pick and the price
- `components/` is in groups: `ui/` (shadcn), `assistant-ui/` (the library's files only; a lint rule stops a new one), `chat/` (que's chat features), `runtime/` (connects the chat to the server), `shell/` (the app frame, with `shell/sidebar/`) and `settings/`
- `hooks/`: React hooks that more than one feature uses
- `lib/`: three things many features share, and no more: the que API's types (`que-api.ts`), the fonts, and shadcn's `cn`. A lint rule stops a new file there
- `components/runtime/runtime-provider.tsx`: connects the chat to que's server, with assistant-ui's AG-UI runtime (`useAgUiRuntime`) inside its remote thread list (`useRemoteThreadListRuntime`)
  - a chat is a thread of the signed-in user's on que's server: `POST /threads` makes it when its first message is sent, `GET /threads` lists them (`thread-list-adapter.ts`), and `GET /threads/:id` loads its messages when it is opened. que's server has no route to rename, archive or delete a thread, so those fail
  - a run is `POST /threads/:id/runs`, with AG-UI's `RunAgentInput`, and its answer streams back as AG-UI events over SSE (`que-client.ts`). A turn is one reply: the runtime joins its model calls and tool calls (`joinStrategy: "concat-content"`), and a chat that is loaded joins them the same way
  - each message keeps the id que's server gave it. An edit or a refresh sends the messages before it, by those ids, and que's server goes on from there
  - the Stop button is `POST /threads/:id/stop` as well as the end of the stream in the browser: it ends the run on que's server, which keeps the reply as far as it came, and the thread says it was stopped until its next run. A chat that is left while its reply goes is not stopped: its run goes on on que's server, and a reload or another chat does not pick it up again
  - `components/chat/message-queue/`: a message sent while a run is going waits above the composer, can be taken back, and is sent when that run ends. It is the library's own queue (`unstable_enableMessageQueue`), kept in the browser: a stop or a closed tab lets the waiting messages go
  - `components/chat/run-states/`: a `Stopped` mark with `Continue`, and a `Reconnecting` line, above the composer. The mark shows while the thread says it was stopped: the Stop button sets it when que's server stopped a run, a chat loaded from que's server reads it, and a run that starts clears it. Nothing sets the line: que's server has no rejoin
- `components/runtime/runs/`: the LangGraph runtime's helpers (a checkpoint, a run's options, a kept run) and their tests. Nothing uses them
- `components/chat/toolkit.tsx`: custom UIs for agent tools, keyed by tool name
- `lib/que-api.ts`: the que API's response types and the fetcher for `useSWR`
- `components/chat/run-pickers/pick.ts`: the pick of a chat, the agent and the model. The composer has a picker for each, made from what the deployment lists (`/api/que/deployment`)
  - the pick is kept in the browser's memory, and no run is sent it: a run is on the deployment's first agent and its model
  - each model in the picker has its price beside it, for one million tokens in and out (`price.ts`)
- a unit test is beside the code it tests (`*.test.ts`), and runs on Node's own test runner, in `just check`
- `.env.local`: not needed. With none, the UI talks to que's own server on localhost:2024 (`components/runtime/agent-server.ts`). `.env.example` lists the setting that points it elsewhere, `QUE_URL`
