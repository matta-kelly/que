---
type: spec
description: "Keep test traffic out of the real traces: the browser tests run que on a model that is not real and send nothing to Langfuse, about four of them stay on the real stack, and a deployment names its Langfuse environment. Reference for what the change must do and how it is checked."
status: dropped
belongs_to: "[[que]]"
---
## Need

- que sends a trace of each run to the deployment's Langfuse ([[spec-run-traces-to-langfuse]]). The browser tests (`ui/tests/e2e`, `just test`) drive the real que of a deployment, so each message of a test is a real model call and a real trace
- seen on the lotusandluna Langfuse, on the day tracing went on: 347 traces, about 310 of them test messages ("Say hi in one word." 185 times), and 5 of them a real chat
- so real use cannot be found among the traces, and each run of the tests is paid for ([[evals]], Aim)
- most of those tests do not check the model. They check that the UI shows what the server sent, and any reply does
- each trace has the environment `default`: nothing says which world it is from
- decided by the owner, and not open here
	- the browser tests on the real stack go down to about four
	- a deployment sets the environment of its traces
	- no more than is needed for those two

## Choices made here

Each one is mine, and each can be changed in review.

- **the rule for a browser test**: it runs on the real stack only when what it checks is the real model or a real service. Each other test runs on the test deployment
- **the test deployment**: a deployment in que's repo, for the browser tests only
	- its model is not real: a local server in the place of the provider answers each request with a fixed reply and fixed token counts. The provider package is pointed at it with `FIREWORKS_BASE_URL`, as the tests of the judge do ([[spec-eval-judge]])
	- it has que's two chat agents, two model configs, and one small plugin with one operation that reads nothing outside the test
	- its `.env` has no Langfuse setting, so it sends no trace. It has no secret: the key of the provider is a made up one
	- it uses que's own database, as any deployment does
- **two commands**
	- `just test`: starts que on the test deployment when que is down, runs the tests that are not marked live, and stops what it started. It stops with a message when que is up for another deployment
	- `just test-live`: runs the tests marked live against the que that is up, as `just test` does today
- **which tests stay live**, about four. Design names each one by the rule. The ones the rule gives today
	- `chat: a message gets a reply`
	- `connections: odoo shows connected; bad credential is rejected`
	- `activity: steps are collapsed under a summary row`
	- one of `cost`: that a real reply has a real price
- **how a test is marked**: a tag in its title, `@live`, which Playwright selects by (`--grep`, `--grep-invert`)
- **a test that needs a tool call on the test deployment**: the stand-in answers a message that starts with a known word with a call of the fixture operation. No other logic is in it
- **the environment is a setting of the deployment**: `LANGFUSE_TRACING_ENVIRONMENT` in its `.env`
	- the SDK reads it by itself, in que and in the eval runner (`@langfuse/otel` and `@langfuse/core`, `getEnv`; named in [[spec-run-traces-to-langfuse]], Edges). que names it in no code
	- not set: `default`, as today
	- the lotusandluna deployment on the dev machine sets `dev`. A deployment that real users reach sets `production`
	- one que has one environment. A live test and a real chat on the same que are in the same one
- **an eval run is told apart from a chat by a tag**: the eval runner sends `eval` as a tag of each run it makes on que
	- to be shown in Design: that a tag of a run reaches the trace que sends. If it does not with no change to `run/trace.ts`, this point is dropped, and named under Out of scope

## Done looks like

### What a person does

```
just test          # no deployment, no model, no trace
./start            # in a deployment
just test-live     # about four tests, on the real stack
```

### Acceptance criteria

- 1: `just test`, with que down, starts que on the test deployment, runs each browser test not marked live, and stops que. It makes no request to a real model provider and none to a Langfuse
- 2: `just test`, with que up for another deployment, stops before any test, and says so
- 3: `just test-live` runs only the tests marked live, against the que that is up. There are five or fewer
- 4: each test that was moved keeps its assertions, but for the text of a reply or a number that came from the real model. Each such change is listed in the pull request
- 5: the stand-in of the provider answers a chat request as a stream, with a fixed reply and fixed token counts, and with a call of the fixture operation for a message that asks for one
- 6: the test deployment passes `just check-deployment`, and its `.env` holds no Langfuse setting and no real key
- 7: with `LANGFUSE_TRACING_ENVIRONMENT` in a deployment's `.env`, the traces of que and the traces of the eval runner have that environment. With none, they have `default`. Checked on the live Langfuse
- 8: each run the eval runner makes on que has the tag `eval` on its trace in Langfuse. Checked on the live Langfuse
- 9: `just check` and the pipeline pass. Each test on `main` that is not a browser test still passes, with the same assertions
- 10: prose, read in review
	- `README.md`: the two commands, and the rule for a live test
	- `templates/deployment/.env.example`: `LANGFUSE_TRACING_ENVIRONMENT`, with one line
	- [[evals]], Aim: the rows on environments and on test traffic say what que does

### Before the merge

By the owner, on the live que and the live Langfuse.

1. `just test` passes with que down, and Langfuse has no new trace after it
2. with `LANGFUSE_TRACING_ENVIRONMENT=dev` in the `.env` of the lotusandluna deployment, one chat message and one `./eval` give traces with the environment `dev`, and the traces of the eval runs have the tag `eval`
3. `just test-live` passes, and Langfuse has a trace for each message it sent, and no more

### Out of scope

- a tag on the trace of a live browser test: the UI makes the run, and one que has one environment
- a Langfuse project for tests
- the removal of the test traces Langfuse holds now
- the browser tests in the pipeline: no pipeline runs them, before or after
- a cut of the browser tests by the rule of the test cut ("a test that repeats another"): this change moves tests, and removes none
- sampling and masking ([[evals]], Aim)

## Tests

To be written on the branch `test/test-traffic`, before the code.

| Criterion | Test | Kind |
|---|---|---|
| 5 | "the stand-in answers a chat request as a stream, with its fixed reply and token counts" | integration |
| 5 | "the stand-in answers with a call of the fixture operation when the message asks for one" | integration |
| 6 | `just check-deployment` on the test deployment | |
| 1, 4 | the browser tests themselves, on the test deployment | end to end |
| 2, 3 | review, and the checks before the merge | |
| 7, 8 | the checks before the merge | |
