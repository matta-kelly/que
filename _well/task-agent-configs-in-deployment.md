---
type: task
description: "Move the agent, loop and model configs out of que and into the deployment, so que holds only the forms they are written on and its fallback values. Reference when adding a config, or when a deployment points into que's checkout."
status: planned
belongs_to: "[[task-agent-config-seams]]"
---
A deployment holds its own agent, loop and model configs. que holds only the forms they are written on.
- [[#Done means]] what is true after
- [[#What is known]] what is settled
- [[#Decisions]] what to settle before the cut
- [[#Out of scope]]

- [[task-agent-config-seams]]: the parent. que offers the blocks; a config is a pick of blocks, and the pick belongs to the deployment
- [[que]]: its Agent part says what a config is

---
## Done means

- a deployment lists no file in que's checkout: each agent, loop and model config it lists sits in its own folder
- so the pick that [[task-agent-config-seams]] says a config is belongs to the deployment, and que offers only the blocks

## What is known

- landl lists que's own configs (`server/agents/`, `server/loops/`, `server/models/`) by an absolute path, so it is tied to one checkout of que
- `templates/deployment/` already holds its own copies (`agents/chat.ts`, `loops/long-chat.ts`, `models/glm-flash.ts`), and its `index.ts` lists them by a relative path
- que keeps the forms: `defineAgent`, `defineLoop`, `defineModel`, in the contract
- the cost: each deployment has its own copy of a config, and copies can drift

## Decisions

- where que's fallback goes. A run on a deployment that lists no model is built with the file `server/models/glm-flash.ts` (`server/harness/src/run/model.ts`), so que's fallback is a config file today
- what happens to `server/agents/`, `server/loops/` and `server/models/`: deleted, or kept only as the source of the template's copies
- the integration tests that mount que's own configs (`server/tests/integration/mount/que-*.test.ts` and their fixtures)

## Out of scope

- the seams between the parts of a config: [[task-agent-config-seams]]
