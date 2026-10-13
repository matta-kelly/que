/**
 * The runs, as text for a person to read: each case with what good looks
 * like, and under it what the agent did under each config.
 */

import type { LoadedCase } from "./load.js";
import type { RunRecord } from "./record.js";

/** One planned run, and how it ended: with a record, with the error of a run that did not finish, or not made. */
export type Outcome = { case: LoadedCase; agent?: string } & (
  { record: RunRecord } | { error: string } | { skipped: string }
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
  const lines = [`  [${outcome.agent ?? "default"}]`];
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
  }
  return lines.join("\n");
}

const heading = (c: LoadedCase) =>
  [
    `${c.package} / ${c.capability} / ${c.name}`,
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
    `${outcomes.length - skipped} runs, ${unfinished} did not finish, ${skipped} skipped`,
  );
  return blocks.join("\n\n");
}
