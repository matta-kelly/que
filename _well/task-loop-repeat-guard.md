---
type: task
description: "The loop let an agent send the same failing tool call about 25 times across turns. Reference when building a guard in the loop for repeated failures."
status: planned
belongs_to: "[[que]]"
---
Nothing in the loop sees an agent repeat a call that fails.
- [[#Problem]]
- [[#Idea]]
- [[#Done might be]]

- [[loop-policy]]: what the loop keeps and how it recovers. This guard is a recovery rule
- Langfuse session `01a13bf2-9f22-741a-aa7f-cf8c9d005382` (que-landl): the loop

---
## Problem

- the agent sent the same `searchRead` call with the same error about 25 times, across turns
- each call is paid for, and the user waits with no way in ([[task-interrupt-a-run]])

## Idea

- the loop sees the same call fail the same way, and acts: a note to the model, then a stop that tells the user what failed
- a guard in code, not a line in the prompt

## Done might be

- a call that fails the same way N times ends with a message to the user, not a further call
