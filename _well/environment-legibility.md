---
type: spec
description: "Make the que harness solely environment legibility: the agent starts with a system prompt that explains packages and lists the ones the rep can use, and reaches an operation by opening a package and loading it. Reference for what the change must do and how it is checked."
status: review
---
## Need

- every operation the rep can use is sent to the model with its full definition on every request
- the system prompt says nothing about what a package is or how to find anything
- the harness has no place for its own tools: its one tool sits inside the code that writes the prompt

## Done looks like

```
harness/agent/src/legibility/     environment legibility
  system-prompt.ts                  what a package is, how to navigate, the rep's packages
  tools.ts                          the base tools for navigating
  middleware.ts                     the tools sent on each request
```

### Acceptance criteria

- the system prompt says what a package is and how to reach an operation, and lists each of the rep's packages by its own name, title and description
- the system prompt names no operation and no skill
- a chat starts with the base tools only: `open_package`, `load_operation`, and `read_skill` when a package has a skill
- `open_package` returns a package's operations and skills with one line each, and no arguments
- `load_operation` brings one operation into reach: from the next request it is sent as a tool with its full definition, for the rest of the chat
- an operation that was not loaded is not sent
- the harness code names no specific package
- `just check` passes, the end to end tests pass, and the evals pass every case

### Approach

- `tools.ts`: the three base tools, built from the rep's packages through the package spec
	- the one line for an operation is its title and the first sentence of its description
- `middleware.ts`: a LangChain middleware (`wrapModelCall`) that filters the tools on each request
	- every operation tool is registered with the agent, so it can run; the middleware decides which are sent
	- what is loaded is read from the chat's own messages: each `load_operation` call that succeeded
- `system-prompt.ts`: takes over from `prompts.ts` and `retrieval/eager.ts`, which go
- `agent.ts`: builds the agent from the system prompt, the base tools and the middleware
- evals: a case that expects no tool passes when no operation was called; a look inside a package is not an operation
- UI: readable labels for the two new tools in the activity row

### Out of scope

- a sandbox, and code mode
- regrouping the other files in `harness/agent/src/`
- any change to a package or to the package spec

## Tests

- unit, beside the code: `tools.test.ts`, `middleware.test.ts`, `system-prompt.test.ts` in `harness/agent/src/legibility/`
	- fail today: the files they test do not exist
- `just test` and `just eval`
