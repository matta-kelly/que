---
type: task
description: "Design what que's chat does when a run does not go the plain way: a stop, a failed run, a message sent while a run is in flight, and a stream that is cut. Reference when picking this up: what is wanted, what the chat does today, what is known from trials, and what is open before a spec."
status: planned
belongs_to: "[[que-ui]]"
---
What the chat does when a run does not go the plain way. A design in progress, and not a spec yet.
- [[#What is wanted]] the outcome
- [[#Where it stands]] what the chat does today
- [[#What is known]] what was tried, and held
- [[#Open]] what has to be decided before a spec

- [[que-ui]]: the chat UI this changes. Its Sources has the four elements that are the candidates for the look, under "failure and waiting"
- [[loop-policy]]: what the agent keeps and how it recovers. A retry and a repair stand on it

---
## What is wanted

- a run that is stopped, cut off or failed leaves the chat in a state the user can read, and go on from
- a message can be sent while a run is in flight
- none of it is lost when the tab is closed or the page is loaded again
- behavior is a setting of the run on the LangGraph server, and the look is an assistant-ui element ([[que-ui#What it is]])

## Where it stands

- a run outlives its connection, and the chat joins it when it is opened again
- stop: a call that cancels the run. The chat shows a `Stopped` mark with `Continue`, kept with the thread
- a tool call with no result is repaired on both engines
- a message sent while a run is going waits above the composer, can be taken back, and is sent when that run ends. It is the library's own queue, kept in the browser: a stop or a closed tab lets the waiting messages go, and a message runs on the pick of the time it is sent
- a failed run: the error box, with no retry
- a rejoin after a reload shows a `Reconnecting` line. A stream that is cut and picked up by the SDK shows nothing: the chat shows as running
- a failed run has no retry. A failure cannot be made on purpose on the real stack without a thread that cannot be read after: a run that names a model the deployment does not list leaves its thread with that name in its config, and each read of its state then fails

## What is known

Each one was tried on a local que.

- queue: a run sent with `multitaskStrategy: "enqueue"` is held by the server, and runs when the thread is free. It keeps the config it was sent with, so a queued message keeps its pick
- reconnect: a run sent with `streamResumable` and `onDisconnect: "continue"` goes on when the stream is cut. `joinStream` with the id of the last event gives the rest, with none lost and none twice
- stop: a reply that is part written is not saved. The saved chat has the user's message and no reply, so "continue" is a new run of that step, and the part answer is gone on a reload
- stop has two actions. `interrupt` leaves the thread idle. `rollback` leaves it in an error state on this server, so que uses `interrupt`
- the rejoin has reference code in the SDK que has: LangChain's `useStream` keeps the id of the run in session storage, by thread, and rejoins on load

- a queue on the server, tried with the SDK and not used by the chat: a run that waits is in the list of the thread's `pending` runs, with its message and its config; a join of it waits and then gives its events from the first; a cancel of it leaves it `interrupted`, and it does not run

### What the chat library does, read in its code

- stop: the library ends its own fetch, and makes no call to cancel the run. The run stops on the server only because the stream is sent with `onDisconnect: "cancel"`. With `continue`, que has to cancel the run itself: `runs.cancel` with `interrupt`, on the library's `composer.cancel` event, with the id of the run kept by que
	- the same fetch is ended when the thread goes out of view, so the cancel cannot hang on the end of the fetch
	- after a stop the part answer stays in the browser, and the library marks the reply as whole. A mark of "stopped" has to be que's own
- the stream: the library takes any stream of events. Its helper, which que uses, cannot send `streamResumable` or `multitaskStrategy`, so que makes the call itself
	- the SDK picks a cut stream up by itself: it keeps the id of the last event, and asks again with a `Last-Event-ID` header, five tries
	- que's proxy at `/api` does not hand that header on. It hands on four headers by name
- a rejoin after a reload: a send of no message starts a run in the library with nothing new, and que's stream call can answer it with `joinStream`. The library has no call of its own for this
	- a replay is not safe as it is: a part of a reply that is sent again is added to the text again. que has to drop the parts of a message it has whole
- queue: the library's queue is kept in the browser's memory, and is gone with the tab and on a stop. It sends a message when the run before it ends. The library runs one stream at a time, so it cannot make a queued run on the server while a run is going
- retry: the refresh under a reply is off, since que hands the library no checkpoint. A send of no message runs the thread again from its last saved step
	- a run that fails is marked on the last reply in the list, which is the reply before it when the failed run gave none
- the four elements are one file each, take plain values, and need `surfaces.tsx`, which que has

## Open

- to try on a running que, before a spec of each part says it
	- the id of a run and the `Location` of its stream come back through the proxy
	- a thread that goes out of view ends its stream, and what the run does then
	- a send of no message on a thread in an error state
	- a rejoin from the start of a run, and the text it adds twice
- what the chat shows while it rejoins, and after a reload in the middle of a run
- what a queued message looks like, and if it can be taken back
