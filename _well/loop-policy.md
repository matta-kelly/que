---
type: doc
description: "Loop policy: what an agent keeps, shows and drops from one model call to the next in one run, and how it recovers. Reference for the frame, the principle (cheap to lose, record and view, a rule per kind) and where it acts; read before building retention, compaction or error handling in que."
status: active
---
What an agent keeps, shows and drops from one model call to the next, and how it recovers.
- [[#Frame]] what the loop decides, and where it sits
- [[#Principle]] how it decides, with what is open under each part
- [[#Practice]] where it acts, and what is built

- [[que]]: the harness this is a unit of
- [[daworks/que/server/core/package|package]]: what a package declares. The loop can show only that
- [[evals]]: what reads a run after it ends

---
## Frame

- the question: what an agent keeps, shows and drops from one call to the next, in one run, and how it recovers
- its place: in the run, the only frame with state that moves
	- before: what is declared (packages, checked at mount)
		- the loop can show only that. No loop rule repairs a bad description
	- after: what is read across runs (traces, cases)
		- a run leaves a trace. An error is made in the loop and read outside it
- its seam with loading
	- loading: what the model can find, and how
	- the loop: what stays after it is found
	- test: "find on demand, keep all" and "find on demand, drop at compaction" are two agents with the same loading

## Principle

- cheap to lose: the model's memory is never the only copy of a thing
	- each answer is recoverable (one call, the same answer) and self-sufficient (enough for the next step, with nothing assumed remembered)
	- derived things can be lost: a catalog entry, a skill, a query result
	- things that happened cannot: an order was made, the user chose B. They need a store and a way to read them back
		- open: which store, and how they are read back after compaction
	- so an agent does not control compaction. It survives it
- record and view
	- the record: the saved chat. Added to, never edited
	- the view: what one call is sent, made again for each call. Middleware makes it from the record
		- a summary is a pointer in the record (where it ends, and its text), not a rewrite. The view is the summary and what follows
		- loading only appends, so the prompt cache holds. A change to an earlier message breaks the cache from there on
		- results are most of the tokens, not definitions
		- open: what starts compaction, and what it must not touch
	- in LangGraph: state (channels, each with its merge rule; messages is one), the checkpointer (one thread), the store (across threads)
- rules by kind, which follow from the two above
	- tool definitions: keep nothing. Derived from the mount
	- what is open: one short line, on every call
	- results: a reference in the view, the bulk elsewhere, shown on request
		- open: where the bulk goes when nothing moves it out
	- things that happened: kept for the whole thread, never compacted away
	- instructions: on every call
	- errors: two jobs and two readers, so two forms
		- jobs: navigation ("open `orders` first", used once, then noise) and evidence ("this was tried and failed", stops a second try)
		- readers: the model now gets a line; a person later gets a record in the trace. The same error many times says a description is wrong or a capability is missing
		- each names what to do next, so a lost model recovers with no search
		- open: how long the evidence form stays. Start: one line, "X failed because Y", no stack, no retries

## Practice

- server side: what a response says. Works under any harness
	- small results with a reference, the line that says what is open, the text of an error
- harness side: what is shown and dropped. Works only where que runs the loop
	- rendering, retention, compaction. Under another harness it does nothing, and cheap to lose does the work
- in que: a loop is a file of settings with a name, and an agent names one. `server/core/loop-spec.ts` says which settings act
	- open: limits. The framework's own middleware leaves a thread that cannot go on, or ends a run with no answer. que's own would count from the saved chat
- outside a loop
	- cheap to lose: a rule of the harness and of how a package answers. No agent opts out
	- repair of an unanswered tool call: always on. The call gets a result that says it was cancelled
	- approval: which operations wait for a yes. On the agent, because it is about the job
	- audit of tool calls: on for every agent. Not built
