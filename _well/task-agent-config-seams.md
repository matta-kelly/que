---
type: task
description: "Find and hold the seams of an agent config, so a deployment can swap one part, keep the rest, and an eval can say which part made the difference. Reference when changing what an agent config is made of, or when an eval of two configs cannot be read."
status: planned
belongs_to: "[[que]]"
---
que is an agent factory. A deployment is where agents are built: it picks blocks from que and holds its own configs, runs them against its environment (packages and ontology), and iterates with evals. That works only if the parts of an agent config have clean seams.
- [[#What is wanted]] the outcome
- [[#Pains]] where it does not hold today
- [[#What is known]] what is settled
- [[#Done means]] how to tell it is finished

- [[que]]: the harness this belongs to. Its Agent part says what a unit is

---
## What is wanted

- each part que offers is a block that can be swapped
- a config is a pick of blocks, and the settings of each. 
	- The pick sits in the deployment, not in que
- a deployment can change one pick and keep the rest
- an eval of two configs can say which pick made the difference

## Pains

- the `deepagents` engine brings tools, a sub agent and a base prompt that no config chose
	- *think we axed deep agents completely to give us a simple and repeatable surface*
- two agent configs can differ in more than one part, so an eval result cannot be pinned to one
- loading has one variant, so no seam of it has been tested by a swap
- several parts write the system prompt: the agent's instructions, the user's own instructions, and the environment text
- the middleware list is filled by more than one part
- a big tool result moved out of the chat needs a read tool, so a loop setting depends on a tool
- some blocks take settings in a file of their own (loop, model), and one takes only a name (loading)

## What is known

- one engine, `createAgent`: a deep agent is `createAgent` and middleware, so its parts are taken one by one. In progress on a branch
- the cut today is loop, loading and semantic (instructions, `agents.md`). It is one cut, and not settled
- some parts are coupled, for example loading and the shape of the environment. A seam can be "these two go together"

## Done means

- a deployment swaps one block, keeps the rest, and the eval result points at that block

## Out of scope

- the outer loop itself: promotion, the gate, automation
- ontology as packages
