/**
 * The eval runner: run each case of a deployment's packages against a running
 * que, under each of its agent configs, and print what the agent did.
 *
 *   tsx src/cli.ts <deployment folder> [--agent <name>]...
 *
 * que is at QUE_URL, or on this machine. Nothing is graded: a person reads
 * the runs.
 */

import { resolve } from "node:path";
import { load } from "./load.js";
import { plan } from "./plan.js";
import { que } from "./que.js";
import { record } from "./record.js";
import { report, type Outcome } from "./report.js";

const USAGE = "Usage: eval <deployment folder> [--agent <name>]...";

function read(args: string[]): { folder: string; named: string[] } {
  const [folder, ...rest] = args;
  if (!folder || folder.startsWith("--"))
    throw new Error(`eval: no deployment folder. ${USAGE}`);
  const named: string[] = [];
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] !== "--agent" || !rest[i + 1])
      throw new Error(`eval: cannot read "${rest[i]}". ${USAGE}`);
    named.push(rest[i + 1]);
  }
  return { folder: resolve(folder), named };
}

async function main(): Promise<number> {
  const { folder, named } = read(process.argv.slice(2));
  const url = process.env.QUE_URL ?? "http://localhost:2024";
  const server = que(url);
  const { cases, agents } = await load(folder);
  const planned = plan(cases, agents, named);
  if (!(await server.up()))
    throw new Error(
      `eval: que is not up at ${url}. Start the deployment first: <its folder>/start`,
    );

  const outcomes: Outcome[] = [];
  for (const { case: c, agent, skipped } of planned) {
    if (skipped) outcomes.push({ case: c, agent, skipped });
    else
      outcomes.push(
        await server.run(c.input, agent).then(
          (messages) => ({ case: c, agent, record: record(messages) }),
          (error: Error) => ({ case: c, agent, error: error.message }),
        ),
      );
  }
  console.log(report(outcomes));
  return outcomes.some((outcome) => "error" in outcome) ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  },
);
