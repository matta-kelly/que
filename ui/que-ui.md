---
type: component
description: "que's chat UI: what it is built on, what it shows today, and the outside components that fit it. Its Work lists the designs and specs in flight on the UI; read before adding to or changing the chat."
status: running
---
The chat UI of [[que]]: a Next.js app in `ui/`, in front of the LangGraph server.
- [[#What it is]] the stack, and the rule for where behavior and looks come from
- [[#What it shows]] the parts of the chat today
- [[#Sources]] outside components that fit, by what they are for

- [[que]]: the harness this is the UI of
- [[loop-policy]]: what the agent keeps and recovers. A stop, a drop and a retry in the UI stand on it
- how to run and test the UI is in `ui/README.md`

#### Work
- [[task-ui-failure-and-waiting]]: stop, error, queue and reconnect. A design in progress
	- a run goes on when its stream is cut, the chat picks it up again, and stop is a call. The base of the rest
	- after it, not started: what a stopped, cut or failed run looks like, and a retry; then a message sent while a run is going

---
## What it is

- Next.js, with shadcn components (`ui/components/ui/`) and [assistant-ui](https://www.assistant-ui.com/docs) for the chat
	- the thread is a copy of assistant-ui's `Thread`, edited in the repo (`ui/components/assistant-ui/elements/`). An upgrade is a diff by hand
	- que's own chat features are in `ui/components/chat/`, a folder each; lint keeps them out of `assistant-ui/`
	- the runtime is assistant-ui's LangGraph adapter. It speaks to the LangGraph server through the proxy at `/api`
- Where a thing comes from
	- behavior from LangGraph: what a run does when it is queued, stopped or cut off is a setting of the run on the server
	- looks from assistant-ui: its elements, in their standalone mode. que hands them its own values
		- an element is copied into the repo, and edited when que needs it to say a thing the library's does not. The file says at its top what was changed. `surfaces.tsx` and `utils/range.ts` are the library's own, shared by its elements, and are not edited
		- their other mode reads usage and model from a runtime made for another backend. que's runtime does not fill those
	- data from que's server: `GET /que/deployment` (agents, models, windows), and the stamp on each reply (`response_metadata.que.model`)
- State the browser keeps is kept with the thread, in its metadata: title, archived, and the pick of agent and model
- A run outlives its connection: it goes on when its stream is cut, by a reload, a look at another chat, or a network that drops. The chat picks it up again when it is opened, and stop is a call that cancels the run. The id of the run a thread is on is kept in the browser's session storage

## What it shows

- sidebar: the areas of the deployment, and the chats (rename, archive, delete, select several)
- chat
	- a reply, with its thinking and tool calls folded into steps
	- composer: the agent and model pickers, the meter, send and stop
		- each model in the picker has its price beside it
		- the meter is a ring that fills as the chat grows, with what the chat cost beside it. Its panel has the parts of the chat's last model call, the window, the model and the cost. It warns past the share the agent summarizes at, or when the window is nearly full
	- under a reply: copy, refresh, and the model, the tokens and the cost of the turn
	- a cost is an estimate, counted in the browser from the usage on each reply and the price of its model
	- a message sent while a run is going: it waits above the composer, can be taken back, and is sent when that run ends. The waiting messages are kept in the browser
	- a stopped reply: a `Stopped` mark above the composer, with `Continue`, which writes the reply again from the last saved step
	- a chat that joins its run after a reload: a `Reconnecting` line, then the rest of the reply
	- a failed run: a box with the error text, under the reply
- settings: account, connections (a credential per plugin), users
- command palette

## Sources

- [assistant-ui elements](https://www.assistant-ui.com/elements): the ready-made parts of the library the chat is built on. Each one is copied into the repo, as a shadcn component is. The ones that fit que, by what they are for
	- pick what a run uses
		- [Model selector](https://www.assistant-ui.com/elements/model-selector): searchable picker, with a description per model and a reasoning effort level
		- [Models](https://www.assistant-ui.com/elements/composer-model-picker): the model in the composer rail
		- [Reasoning effort](https://www.assistant-ui.com/elements/reasoning-effort): how hard to think, and how much of it the run spent
		- [Agent card](https://www.assistant-ui.com/elements/agent-card): the agent: its skills and its model
		- [Regenerate with](https://www.assistant-ui.com/elements/regenerate-menu): send the same turn again on another model
		- [Settings](https://www.assistant-ui.com/elements/settings-panel): model, system prompt, and what the assistant can do
	- see what a run used
		- [Context display](https://www.assistant-ui.com/elements/context-display): the window as a ring, a bar or text, with a hover view
		- [Context](https://www.assistant-ui.com/elements/composer-context): a token ring in the composer rail, with a warning near the limit
		- [Context breakdown](https://www.assistant-ui.com/elements/context-breakdown): where the window went: prompt, tools, files, conversation
		- [Cost meter](https://www.assistant-ui.com/elements/cost-meter): what the run spent, by model, against the session total
		- [Message timing](https://www.assistant-ui.com/elements/message-timing): first token, total time and speed of a reply. Works on que's runtime as it is
		- [Quota banner](https://www.assistant-ui.com/elements/quota-banner): how much is left, and when it comes back
	- what the agent is doing
		- [Agent status](https://www.assistant-ui.com/elements/agent-status): one pill: what it is doing, and for how long
		- [Thinking indicator](https://www.assistant-ui.com/elements/thinking-indicator): a live status line with elapsed time
		- [Run activity](https://www.assistant-ui.com/elements/run-activity): a live summary, the tools in order, and the final answer
		- [Tool group](https://www.assistant-ui.com/elements/tool-group): consecutive tool calls of a turn, collapsed
		- [Tool call](https://www.assistant-ui.com/elements/tool-call): one call, with its request and result
		- [Tool failure](https://www.assistant-ui.com/elements/tool-error): the error, the attempt count, and a retry
		- [Tool timeline](https://www.assistant-ui.com/elements/tool-timeline): a whole session as verbs and targets
		- [Agent plan](https://www.assistant-ui.com/elements/agent-plan): a checklist the agent works through
		- [Todo list](https://www.assistant-ui.com/elements/todo-list): the agent's own list, rewritten in the run
	- delegation, for the deep agent
		- [Task card](https://www.assistant-ui.com/elements/task-card): a delegated task: state, timing, result, transcript
		- [Subagent list](https://www.assistant-ui.com/elements/subagent-list): parallel workers, each with its progress and model
		- [Handoff](https://www.assistant-ui.com/elements/agent-handoff): control passing between agents, with the reason
		- [File tree](https://www.assistant-ui.com/elements/file-tree): everything a run touched
	- approval and questions
		- [Approval card](https://www.assistant-ui.com/elements/approval-card): the agent asks before an action with consequences
		- [Permission grant](https://www.assistant-ui.com/elements/permission-grant): grant a capability, with its reach spelled out
		- [Elicitation form](https://www.assistant-ui.com/elements/elicitation-form): a tool call that stops to ask for the fields it needs
		- [Option list](https://www.assistant-ui.com/elements/option-list): a question with a few answers
		- [Question flow](https://www.assistant-ui.com/elements/question-flow): a few short questions in sequence
	- runs, traces and scores
		- [Trace waterfall](https://www.assistant-ui.com/elements/trace-waterfall): every span of a run on one time axis
		- [Score breakdown](https://www.assistant-ui.com/elements/score-breakdown): a verdict with its criteria and weights
		- [Activity graph](https://www.assistant-ui.com/elements/activity-graph): a half-year of runs as a calendar
		- [Checkpoints](https://www.assistant-ui.com/elements/checkpoint-history): points to fall back to
		- [Background runs](https://www.assistant-ui.com/elements/background-inbox): work still going, and results waiting
		- [Schedule](https://www.assistant-ui.com/elements/schedule-card): a run that repeats, and how it has been doing
	- results in a reply
		- [Data table](https://www.assistant-ui.com/elements/data-table): a sortable table for tool results
		- [Chart](https://www.assistant-ui.com/elements/chart): area, line and bars
		- [Spec sheet](https://www.assistant-ui.com/elements/spec-sheet): one object, labeled
		- [Sources](https://www.assistant-ui.com/elements/sources): citation chips and source cards
	- connections
		- [MCP config dialog](https://www.assistant-ui.com/elements/mcp-config): connectors, with authentication and connection state
		- [Server panel](https://www.assistant-ui.com/elements/mcp-server-panel): which servers are connected, and which wait on the user
	- failure and waiting
		- [Error state](https://www.assistant-ui.com/elements/error-state): a quiet failure banner with a retry
		- [Stopped run](https://www.assistant-ui.com/elements/stopped-run): the half-written answer stays, and can continue
		- [Connection state](https://www.assistant-ui.com/elements/connection-state): the socket drops, and the stream is picked up again
		- [Message queue](https://www.assistant-ui.com/elements/message-queue): turns typed while a run is in flight
- Agent chat sets, other than assistant-ui
	- [AICSS](https://www.aicss.dev/): agent chat parts in React, Vue and Svelte: thinking, tool calls, tables, approval, inputs. Nothing for stop, queue or reconnect
- Component sets. The UI is on shadcn, so a set made for shadcn drops in
	- [shadcn/ui](https://ui.shadcn.com): the base the UI has
	- [shadcnblocks](https://shadcnblocks.com): section blocks made for shadcn
	- [21st.dev](https://21st.dev): a community component market, which an agent reads over MCP
	- [Magic UI](https://magicui.design), [Aceternity UI](https://ui.aceternity.com), [beui](https://beui.dev), [smoothui](https://smoothui.dev): animated React components
	- [affectui](https://affectui.com), [kobra](https://kobra.systems), [uiarc](https://uiarc.dev): general component sets
	- [boardui](https://boardui.com): components for dashboards. For the areas beside the chat
- Motion
	- [Transitions.dev](https://transitions.dev/): transitions for agent UIs
	- [Motion Primitives](https://motion-primitives.com): interactions
	- [microkit](https://microkit.co): micro-interactions
- Charts. For cost over time, and reports
	- [evilcharts](https://evilcharts.com): chart components
	- [lieflat-charts](https://github.com/larashero3-dotcom/lieflat-charts): a skill that draws a chart in HTML from data, with over 60 kinds ([post](https://x.com/guillaume_rygn/status/2095409653425307933))
- Design reference: how others solved a part, before que draws its own
	- [component.gallery](https://component.gallery): one element, as each known design system does it
	- [Refero styles](https://styles.refero.design): styles and type of real products
	- [Mobbin](https://mobbin.com): patterns of real apps
	- [designmd.ai](https://designmd.ai): design systems as markdown an agent can read
- Ways of working
	- [state-machine skill](https://github.com/jakubkrehel/skills): renders one component in each of its states on a throwaway page, with mock data ([post](https://x.com/jakubkrehel/status/2108217939556233615))
	- shadcn's skills make a `DESIGN.md`: a preset, then colors, tokens, type scale, elevation, and the styled primitives and blocks ([post](https://x.com/shadcn/status/2108574564586332615))
	- a contact sheet: many screenshots in one image, so an agent reviews a change over time with one read ([post](https://x.com/mattpocockuk/status/2099172859599880503))
- The two lists the sets above were picked from: [UI components](https://x.com/neropursue/status/2109514246853677192), and [40 design resources](https://x.com/himanshubuildss/status/2106411655055974640). What is left out of them is for landing pages, 3D and illustration
