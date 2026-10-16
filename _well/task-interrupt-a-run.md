---
type: task
description: "Let the user redirect a run that is going: a message sent mid-run waits its turn, so \"stop\" typed in the chat does nothing until the run ends. Reference when picking up how a user takes control of a run."
status: planned
belongs_to: "[[que-ui]]"
---
A message sent while a run is going waits its turn. The user cannot redirect the agent until the run ends.
- [[#Problem]]
- [[#Idea]]
- [[#Done might be]]

- [[task-ui-failure-and-waiting]]: the design of stop, the queue and failure in the chat. This task may fold into it
- Langfuse session `01a13bf2-9f22-741a-aa7f-cf8c9d005382` (que-landl): the run where it hurt

---
## Problem

- the user typed "STOP!" while the agent looped on a failing call. The message waited, and the agent went on until its run ended
- the queue is the library's own: a message runs when the run before it ends

## Idea

- a message sent mid-run can stop the run that is going, and is then read
- open: the stop control, a message that interrupts, or a choice of the two

## Done might be

- a message sent mid-run reaches the agent before its next model call, or ends the run
