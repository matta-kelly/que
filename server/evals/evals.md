---
type: doc
description: "Evals: how an agent is checked against what good looks like, as one system of three stores and four movers, with the loops and procedures that run on it. Reference for the words (case, trace, grader, experiment), and read before designing or building any eval part of que."
status: active
---
How an agent is checked against what good looks like: one system, two loops that run on it, and the procedures inside them.
- [[#System]] the three stores and the four movers, and the names for their parts and uses
- [[#Loops]] the dev loop, the collection loop, and calibration
- [[#Procedures]] grading, the gate, and promotion: what starts each one and how it works
- [[#Overlap]] which loop uses which part, and the build order that follows
- [[#Aim]] what a team in production does with this system, and where que is against it

- [[que]]: the harness these evals check
- [[shit-sdlc]]: the loop a change goes through; the dev loop here is the same loop for a change to an agent

---
## System

Data that stays, and machinery that moves it.

- **Stores**
	- **Dataset**: the cases. Small, edited by hand, kept in git
		- **case**: an input, a start state, and what good looks like. It names the graders that apply to it
		- a case is the question. A trace is the answer
		- a case is about one capability, and names it
			- the cases of a capability are its measure: its entry in the map points at them
			- kept in the plugin the capability lives in, beside its tests
		- a case is not a test
			- test: no model. Shows that the code of one operation is right
			- case: the model is in the loop. Shows that the agent delivers the capability
	- **Traces**: what the agent did. Large, written one time, not edited
		- **trace**: one run: the input, each step (each tool call and its result), the output, and the agent version
	- **Scores**: the verdicts. Small. Each one points at a trace and an agent version
	- Traces and Scores are two tables in one database
	- in que: Langfuse, one for each deployment
- **Movers**
	- **Tracing**: agent → Traces
		- in que: the `run` step sends a trace of each run to the deployment's Langfuse, when the deployment sets it. An eval run is a run, so it is traced too
	- **Eval harness**: Dataset → Traces. It runs a case against the agent
		- in que: the eval runner, `./eval` in a deployment. It sets no start state. It prints the run, for a person to read, and keeps it in Langfuse when the deployment sets it: the cases as one dataset, and one experiment for each agent config
	- **Graders**: Traces → Scores
		- in que: one, the judge, inside `./eval`. It is asked the `good` of a case, for each run of an experiment. Nothing grades real use, and a verdict stops nothing
	- **Promotion**: Traces → Dataset

```
Dataset ──harness──▶ Traces ──graders──▶ Scores
   ▲                   ▲
   └─── promotion ─────┤
                    tracing
                   (real use)
```

- Names for a part or a use of the above
	- **environment**: part of the eval harness. Where the agent acts during a case: not a real system, and the same start state each time
	- **trace viewer**: a way to read one trace
	- **experiment**: one pass of the full Dataset against one agent version
	- **baseline**: the score of the last accepted experiment
	- **offline / online**: which mover filled Traces. Offline is the eval harness, online is real use

## Loops

- **Dev loop**: one turn for each change to the agent
	1. define: write the case, or select one
	2. fail: run it and see it fail
	3. change: edit the agent
	4. pass: run again until it passes
	5. regress: run the full Dataset and compare with the baseline
	6. ship
- **Collection loop**: continuous, on real use
	1. trace: real use fills Traces
	2. review: read traces, and let graders flag the bad ones
	3. promote: a bad trace becomes a case
		- a bad trace is also a signal: it can start a new capability, at the first stage
	- the new case goes into the dev loop at step 2
- **Calibration**: at intervals
	- label a sample of traces by hand, then check that the graders agree
	- without it, the scores move away from the truth

```
        ┌──────── collection ───────┐
        ▼                           │
     promote ─▶ fail ─▶ change ─▶ pass ─▶ regress ─▶ ship
                  ▲        │
                  └─ dev ──┘
```

Before there is real use, the collection loop is empty. The dev loop starts from cases written by hand.

## Procedures

- **Grading**: how a trace gets a verdict
	- a grader is a function: `(case, trace, end state) → pass or fail, with a reason`
	- three kinds, lowest cost first
		- state check, in code: is the environment in the correct state now
		- trace check, in code: was this tool called, one time, with this argument
		- judge, a model: one yes or no question that code cannot answer
			- it is given the case and what the agent did, and is asked the case's `good`
			- it gives its reason, then yes or no. No scale
	- a verdict is kept as a score on the trace it is about: the grader, pass or fail, and the reason
	- a run with no verdict is not a pass: it did not finish, or the grader gave none
	- a case passes when all its graders pass
	- each case runs more than one time, because the result changes between runs
	- the score of an experiment is the share of cases that passed
- **Gate**: what starts a run, and what it can stop

| Trigger | Runs | Result |
|---|---|---|
| a person | one case, or all | read by that person |
| a change to the agent (prompt, model, tools, config) | the full Dataset, as one experiment | stops the change when the score is below the baseline |
| real use | graders on real traces | flags bad traces. Stops nothing |

- a commit that does not change the agent runs the usual tests only, with no model call
- the gate compares with the baseline, not with 100%
- **Promotion**: how a trace becomes a case
	- keep the input and the start state of the trace
	- discard what the agent did
	- write what good looks like
	- remove private data before the case goes into git

## Overlap

| | Dev loop | Collection loop |
|---|---|---|
| **Tracing** | records each eval run | records real use |
| **Eval harness** | runs the cases | not used |
| **Graders** | score, and compare with the baseline | score, and flag |
| **Promotion** | not used | bad trace → case |
| **Dataset** | read | written |
| **Traces** | written | written and read |
| **Scores** | written and read | written |

- Tracing, Traces, Graders and Scores are shared. The two loops use them in the same form
- the eval harness is for the dev loop only. Promotion is for the collection loop only
- the Dataset is the join: the collection loop writes it and the dev loop reads it
- the gate is not a third loop. It is step 5 of the dev loop, run by a machine

Build order that follows:

1. Tracing and Traces: shared, and all other parts read them
2. Graders and Scores: shared
3. Eval harness: the dev loop works
4. Gate
5. Promotion: the collection loop is closed

## Aim

What a team that runs agents in production does with this system. The target, and where que is against it.

| They do | With | que |
|---|---|---|
| find the run a user complains about, and read which step went wrong | Traces, by user and by session | yes |
| tell worlds apart: production, dev, test | an environment on each trace | yes: a deployment sets it (`LANGFUSE_TRACING_ENVIRONMENT`), and eval runs have the tag `eval` |
| see cost, tokens, time and errors, by model, user and release | Traces, as dashboards | the release is on a trace. Cost is not checked |
| compare two agent versions on the same cases | Dataset, experiments, Scores | yes, with the judge |
| grade real use: a judge on a sample of real traces, to flag the bad ones | Graders, online | no |
| review by hand: a queue of flagged traces that a person marks good or bad | Scores, by a person | no |
| check the judge against those marks | Calibration | no |
| make a bad real trace a case | Promotion | no |
| stop a change that scores under the baseline | Gate | no |
| keep private data out of the store, and keep a sample of traces, not all | masking, sampling | no: each trace is kept, as it is |

- the order they are reached in: read traces, then experiments, then grading of real use with review by hand, then the gate
- test traffic is kept out of the real traces, or marked. Without that, real use cannot be found in the noise
