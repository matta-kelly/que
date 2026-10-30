/**
 * The judge: a model that is asked the `good` of a case about the run the
 * agent made, and answers yes or no with a reason. The one file that makes a
 * model: with `@que/chat-model`, as a run makes its own. What it takes and hands
 * back is in the runner's own form.
 */

import { createModels, type Models } from "@earendil-works/pi-ai";
import { fireworks, levelOf, piModel } from "@que/chat-model";
import type { Model } from "@mku1tra/que-harness";
import type { LoadedCase } from "./load.js";
import type { RunRecord } from "./record.js";
import type { Outcome } from "./report.js";

/** What the judge said of a run: a pass or a fail with its reason, or why there is no verdict. */
export type Verdict = { pass: boolean; reason: string } | { none: string };
export type Ask = (c: LoadedCase, record: RunRecord) => Promise<Verdict>;

const RESULT = 2_000;
const LINE = /^\s*VERDICT:\s*(yes|no)\s*$/i;

/** The judge's model config: the one the deployment lists under this name. */
export function modelNamed(models: Model[], name: string): Model {
  const model = models.find((m) => m.name === name);
  if (model) return model;
  throw new Error(
    `eval: no model ${JSON.stringify(name)}. Models: ${models.map((m) => m.name).join(", ")}`,
  );
}

// A tool result can be the size of a table. The judge needs to see what was read, not all of it.
const cut = (text: string) =>
  text.length > RESULT ? `${text.slice(0, RESULT)} (cut)` : text;

/** The text sent to the model. No case and no plugin changes the words around the case and the run. */
export function question(c: LoadedCase, record: RunRecord): string {
  const steps = record.steps.map((step) =>
    step.kind === "call"
      ? `call: ${step.name} ${JSON.stringify(step.args)}`
      : `result: ${cut(step.text)}`,
  );
  return [
    "You are the judge of one run of an agent. A user sent the agent one message. The agent called tools, or called none, and then gave an answer.",
    "Decide one thing: is the STATEMENT true of this run? Use only what is written below. Do not judge the run on any other point.",
    `USER MESSAGE\n${c.input}`,
    `STATE BEFORE THE RUN\n${c.start}`,
    `STATEMENT\n${c.good}`,
    `RUN, IN ORDER\n${steps.length ? steps.join("\n") : "(no tool was called)"}`,
    `ANSWER\n${record.answer || "(the run ended with no answer)"}`,
    "Give your reason first, in one or two short sentences. Then end with one line, and write nothing after it:\nVERDICT: yes\nif the statement is true of this run, or\nVERDICT: no\nif it is not.",
  ].join("\n\n");
}

/** The verdict in a reply: its last VERDICT line. The reason is the reply without that line. */
export function verdictOf(reply: string): Verdict {
  const lines = reply.split("\n");
  const at = lines.map((line) => LINE.test(line)).lastIndexOf(true);
  if (at < 0) return { none: "the reply has no VERDICT line" };
  const [, word] = LINE.exec(lines[at]) ?? [];
  return {
    pass: word.toLowerCase() === "yes",
    reason: [...lines.slice(0, at), ...lines.slice(at + 1)].join("\n").trim(),
  };
}

/**
 * The judge on one model config, called through pi-ai's `models`: by default
 * ones with Fireworks on them for the config, so the judge's model is the one
 * a run on that config gets. A test gives its own. A call that fails is no
 * verdict, so the runs after it are judged.
 */
export function judge(
  model: Model,
  models: Models = withFireworks(model),
): Ask {
  return async (c, record) => {
    const reply = await models.completeSimple(
      piModel(model),
      {
        messages: [
          { role: "user", content: question(c, record), timestamp: Date.now() },
        ],
      },
      { reasoning: levelOf(model) },
    );
    if (reply.stopReason === "error")
      return { none: `the call to the model failed: ${reply.errorMessage}` };
    return verdictOf(
      reply.content
        .flatMap((c) => (c.type === "text" ? [c.text] : []))
        .join(""),
    );
  };
}

function withFireworks(model: Model): Models {
  const models = createModels();
  models.setProvider(fireworks([model]));
  return models;
}

/** The outcomes in order, each finished run with its verdict. One run is judged after the other. */
export async function judged(
  outcomes: Outcome[],
  ask: Ask,
): Promise<Outcome[]> {
  const all: Outcome[] = [];
  for (const outcome of outcomes)
    all.push(
      "record" in outcome
        ? { ...outcome, verdict: await ask(outcome.case, outcome.record) }
        : outcome,
    );
  return all;
}
