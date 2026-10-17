/**
 * The runs of one command, as what Langfuse keeps: the cases as one dataset,
 * and the runs made under each agent config as one experiment. In the
 * runner's own form: nothing here knows Langfuse.
 */

import type { Verdict } from "./judge.js";
import type { Agent, LoadedCase } from "./load.js";
import type { RunRecord } from "./record.js";
import type { Outcome } from "./report.js";

/** One case in the dataset. `expected` is what good looks like. */
export type Item = {
  id: string;
  input: string;
  expected: string;
  metadata: {
    package: string;
    capability: string;
    case: string;
    start: string;
  };
};
/** What a run gave: its record, or the error of a run that did not finish. `verdict` is on a run that was judged. */
export type Output = {
  item: string;
  output: RunRecord | { error: string };
  verdict?: Verdict;
};
/** The runs made under one agent config. `run` names this pass of them. */
export type Experiment = {
  agent: string;
  name: string;
  run: string;
  metadata: {
    agent: string;
    config: Agent;
    commit: string;
    deployment: string;
    /** The name of the judge's model config, when the runs were judged. */
    judge?: string;
  };
  outputs: Output[];
};
export type Sending = {
  dataset: { name: string; items: Item[] };
  experiments: Experiment[];
};
/** An experiment that was sent. `url` opens its run, when Langfuse gave one. */
export type Sent = { agent: string; run: string; url?: string };

// A name of the contract has no ".", so no two cases share an id.
const idOf = (deployment: string, c: LoadedCase) =>
  `${deployment}.${c.package}.${c.name}`;

export function experiments({
  deployment,
  commit,
  at,
  cases,
  agents,
  outcomes,
  judge,
}: {
  deployment: string;
  commit: string;
  /** The UTC time the command started, to the second. */
  at: string;
  cases: LoadedCase[];
  agents: Agent[];
  outcomes: Outcome[];
  /** The name of the judge's model config, with a judge. */
  judge?: string;
}): Sending {
  const items = cases.map((c) => ({
    id: idOf(deployment, c),
    input: c.input,
    expected: c.good,
    metadata: {
      package: c.package,
      capability: c.capability,
      case: c.name,
      start: c.start,
    },
  }));

  const made = agents.flatMap((config): Experiment[] => {
    const outputs = outcomes.flatMap((outcome): Output[] => {
      if (outcome.agent !== config.name || "skipped" in outcome) return [];
      const item = idOf(deployment, outcome.case);
      if ("error" in outcome)
        return [{ item, output: { error: outcome.error } }];
      const { record, verdict } = outcome;
      return [{ item, output: record, ...(verdict && { verdict }) }];
    });
    if (!outputs.length) return [];
    const agent = config.name;
    const name = `${agent}@${commit}`;
    return [
      {
        agent,
        name,
        run: `${name} ${at}`,
        metadata: {
          agent,
          config,
          commit,
          deployment,
          ...(judge && { judge }),
        },
        outputs,
      },
    ];
  });

  return { dataset: { name: deployment, items }, experiments: made };
}
