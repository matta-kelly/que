---
type: task
description: "The base prompt teaches how to load packages and nothing about how to work: the agent built on a guess, did not look, did not ask, and wrote too much. Reference when changing the base system prompt or adding the eval case for it."
status: planned
belongs_to: "[[que]]"
---
The base prompt says "You are a helpful assistant", then how to load packages. It says nothing about how to work --> has led to nonoptimal results
- [[#Problem]]
- [[#Idea]]
- [[#Done might be]]
 
- `server/harness/src/assemble/prompt.ts`: the base prompt (`ROLE`)
- [[evals]]: the cases a change is measured on
- Langfuse session `01a13bf2-9f22-741a-aa7f-cf8c9d005382` (que-landl): the run

---
## Problem

- "use sales team as the key" was read as "salestream". The agent built on it, and did not look at the fields it had or ask
- it said "salestream does not exist" without looking at what does
- it wrote long status text after it was asked to be short
- mostly: couldn't reason out of very reasonable pieces
- how much of this is the broken filter ([[task-odoo-domain]]) is not known

Matts notes:
- nested issue of where the prompt lives.. feel that this should be configured deployment side..,. kinda ties into broader [[task-agent-config-seams]]

## Idea

- my proposal, not settled: a few rules in place of the role line
	- if the request is unclear, check the data or ask one short question
	- look before you conclude that something does not exist
	- when a call fails, read the error and change the call; after two of the same, stop and say what failed
	- answer first, in a few lines; say what you assumed
- no rule per incident (no line about typos). What the system can enforce goes in code: tool errors, the loop guard ([[task-loop-repeat-guard]])

## Done might be

- this session is an eval case
- fix the domain first, and run the case again: what still goes wrong is the prompt's part
- the new rules pass that case, and the others do not get worse
