/**
 * The runs, as text for a person to read: each case with what good looks
 * like, and under it what the agent did under each config.
 */

import type { Sent } from "./experiment.js";
import type { Verdict } from "./judge.js";
import type { LoadedCase } from "./load.js";
import type { RunRecord } from "./record.js";

/** One planned run, and how it ended: with a record, with the error of a run that did not finish, or not made. `verdict` is on a run that was judged. */
export type Outcome = { case: LoadedCase; agent: string } & (
  | { record: RunRecord; verdict?: Verdict }
  | { error: string }
  | { skipped: string }
);

const RESULT = 200;
const LABEL = 9;
const INDENT = "    ";

const line = (label: string, value: string) =>
  `${INDENT}${label.padEnd(LABEL)}${value}`;
const onOneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const cut = (text: string) =>
  text.length > RESULT ? `${text.slice(0, RESULT)} (cut)` : text;
// An answer is shown whole: its later lines start under its first.
const whole = (text: string) =>
  text.split("\n").join(`\n${INDENT}${" ".repeat(LABEL)}`);

function run(outcome: Outcome): string {
  const lines = [`  [${outcome.agent}]`];
  if ("skipped" in outcome) lines.push(line("skipped", outcome.skipped));
  else if ("error" in outcome) lines.push(line("error", outcome.error));
  else {
    for (const step of outcome.record.steps)
      lines.push(
        step.kind === "call"
          ? line("call", `${step.name} ${JSON.stringify(step.args)}`)
          : line("result", cut(onOneLine(step.text))),
      );
    lines.push(line("answer", whole(outcome.record.answer)));
    if (outcome.verdict) lines.push(line("verdict", said(outcome.verdict)));
  }
  return lines.join("\n");
}

const said = (verdict: Verdict) =>
  ("none" in verdict
    ? `none  ${onOneLine(verdict.none)}`
    : `${verdict.pass ? "pass" : "fail"}  ${onOneLine(verdict.reason)}`
  ).trimEnd();

/** For each agent config with a judged run, how many of them passed. A run with no verdict is not a pass. */
function passes(outcomes: Outcome[]): string[] {
  const counts = new Map<string, { passed: number; judged: number }>();
  for (const outcome of outcomes) {
    if (!("record" in outcome) || !outcome.verdict) continue;
    const name = `[${outcome.agent}]`;
    const count = counts.get(name) ?? { passed: 0, judged: 0 };
    count.judged += 1;
    if ("pass" in outcome.verdict && outcome.verdict.pass) count.passed += 1;
    counts.set(name, count);
  }
  const width = Math.max(...[...counts.keys()].map((name) => name.length)) + 2;
  return [...counts].map(
    ([name, { passed, judged }]) =>
      `  ${name.padEnd(width)}${passed} of ${judged} passed`,
  );
}

const heading = (c: LoadedCase) =>
  [
    `${c.plugin} / ${c.capability} / ${c.name}`,
    `  input  ${c.input}`,
    `  start  ${c.start}`,
    `  good   ${c.good}`,
  ].join("\n");

export function report(outcomes: Outcome[]): string {
  const blocks: string[] = [];
  let current: LoadedCase | undefined;
  for (const outcome of outcomes) {
    if (outcome.case !== current) {
      current = outcome.case;
      blocks.push(heading(current));
    }
    blocks.push(run(outcome));
  }
  const skipped = outcomes.filter((o) => "skipped" in o).length;
  const unfinished = outcomes.filter((o) => "error" in o).length;
  blocks.push(
    [
      `${outcomes.length - skipped} runs, ${unfinished} did not finish, ${skipped} skipped`,
      ...passes(outcomes),
    ].join("\n"),
  );
  return blocks.join("\n\n");
}

/** Where each experiment is in Langfuse: the link to its run, or its run name when Langfuse gave no link. */
export function links(sent: Sent[], url: string): string {
  return [
    "Langfuse",
    ...sent.map(
      ({ agent, run, url: link }) =>
        `  [${agent}]  ${link ?? `${run}, under Experiments at ${url}`}`,
    ),
  ].join("\n");
}
