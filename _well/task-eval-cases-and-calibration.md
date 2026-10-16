---
type: task
description: "Make que's eval scores worth trusting: enough cases to say something, and a judge checked against a person's marks. Reference when picking this up: what is in place, what is wanted, and what is open."
status: planned
belongs_to: "[[que]]"
---
Give the evals enough cases, and a judge that is checked, so a score means something.
- [[#In place]] what this starts from
- [[#Wanted]] the outcome
- [[#Open]] what has to be decided before a spec
- [[#Done means]] how to tell it is finished

- [[evals]]: the model this works in, and its build order
- [[que]]: the harness this belongs to

---
## In place

- each run of que is traced to the deployment's Langfuse, with the deployment's environment (`dev` for lotusandluna)
- `./eval` in a deployment runs its cases and keeps each run in Langfuse as an experiment, tagged `eval`
- one grader: an LLM judge (`QUE_JUDGE`) that gives each run a yes or no score, `good`
- the dataset is the lotusandluna cases: two read-only cases for one capability, `find-company`
- the dev loop works: change, `./eval`, read the experiment

## Wanted

- enough cases for one capability that a change in the score says something
- the judge checked against a person's marks on the same runs, so its score can be trusted
- then, and not in this task: the gate ([[evals]], Gate)

## Open

- which capability, and how many cases
- how a person marks runs: a Langfuse annotation queue, or another way
- how close the judge must be to the person to be trusted
- what to do when it is not: change the judge's question, its model, or add a grader that is not a model

## Done means

- one capability has enough cases, each read-only, and `./eval` runs them
- a person has marked the runs of one experiment, and the agreement of the judge with those marks is known
- [[evals]] says where que is against each of these
