/**
 * Run the eval cases against the real agent (as the dev user, no UI/server),
 * each several times, and print each case's pass rate. `npm run eval` from the
 * repo root; `npm run eval -- 5` (or EVAL_RUNS=5) for 5 runs per case, default 3.
 *
 * Every attempt is also written as one JSON line to evals/results/<started>.jsonl,
 * with the sample, the tools called and the tokens, to compare runs over time.
 */

import { mkdirSync, appendFileSync } from "node:fs";
import { config } from "dotenv";
import {
  LOAD_OPERATION,
  OPEN_PACKAGE,
} from "../agent/src/legibility/on-demand/tools.ts";
import { READ_SKILL } from "../agent/src/legibility/skills.ts";
import { CASES, type Case, type Sample } from "./cases.ts";
config({
  path: new URL("../agent/.env", import.meta.url).pathname,
  quiet: true,
});

const NAVIGATION = [OPEN_PACKAGE, LOAD_OPERATION, READ_SKILL];

// Imported after .env is loaded: the agent reads its config at import.
const { buildAgent } = await import("../agent/src/agent.ts");
const { packages } = await import("../agent/src/mount/packages.ts");
const { getConnection } = await import("../agent/src/mount/credentials.ts");
const { users } = await import("../agent/src/users.ts");
const { identify } = await import("@que/identity");

const RUNS = Number(process.argv[2] ?? process.env.EVAL_RUNS ?? 3);
if (!Number.isInteger(RUNS) || RUNS < 1)
  throw new Error(
    `runs must be a whole number ≥ 1, got ${process.argv[2] ?? process.env.EVAL_RUNS}`,
  );

type ToolCall = { name: string; args: Record<string, unknown> };
type Msg = {
  tool_calls?: ToolCall[];
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    input_token_details?: { cache_read?: number };
  };
  response_metadata?: { model_name?: string };
};

const me = await users.ensure((await identify(new Headers()))!);

// A real company that has a salesperson, to build the prompts from.
const odoo = packages.find((p) => p.definition.name === "odoo")!.definition;
const conn = (await getConnection(odoo, me.id)) as {
  call: (...a: unknown[]) => Promise<unknown>;
};
const [row] = (await conn.call(
  "res.partner",
  "search_read",
  [
    [
      ["is_company", "=", true],
      ["user_id", "!=", false],
    ],
  ],
  {
    fields: ["id", "name", "user_id"],
    limit: 1,
    order: "id desc",
  },
)) as { id: number; name: string; user_id: [number, string] }[];
const odooMe = await odoo.whoami!(conn as never);
const sample: Sample = {
  company: { id: row.id, name: row.name },
  salesperson: row.user_id[1],
  me: { id: Number(odooMe.id), name: odooMe.name },
};

const agent = await buildAgent(me.id);
const started = new Date();
const resultsDir = new URL("./results/", import.meta.url).pathname;
const resultsFile = `${resultsDir}${started.toISOString().replace(/[:.]/g, "-")}.jsonl`;
mkdirSync(resultsDir, { recursive: true });

// One try at a case. An error (the model API, a tool that throws) is a failed attempt, not the end of the run.
async function attempt(c: Case) {
  const t = Date.now();
  let calls: ToolCall[] = [];
  let pass = false;
  let error: string | undefined;
  const tokens = { input: 0, output: 0, cached: 0 };
  let model = process.env.MODEL;
  try {
    const out = await agent.invoke({
      messages: [{ role: "user", content: c.ask(sample) }],
    });
    const messages = out.messages as Msg[];
    calls = messages
      .flatMap((m) => m.tool_calls ?? [])
      .map(({ name, args }) => ({ name, args }));
    for (const m of messages) {
      tokens.input += m.usage_metadata?.input_tokens ?? 0;
      tokens.output += m.usage_metadata?.output_tokens ?? 0;
      tokens.cached += m.usage_metadata?.input_token_details?.cache_read ?? 0;
      model = m.response_metadata?.model_name ?? model;
    }
    pass =
      c.expect.tool === null
        ? // Looking around is not acting: only an operation counts as a tool used.
          calls.every((call) => NAVIGATION.includes(call.name))
        : calls.some(
            (call) =>
              call.name === c.expect.tool &&
              (!c.expect.args || c.expect.args(call.args, sample)),
          );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const result = {
    at: new Date().toISOString(),
    model,
    case: c.id,
    sample,
    calls,
    pass,
    error,
    tokens,
    seconds: (Date.now() - t) / 1000,
  };
  appendFileSync(resultsFile, JSON.stringify(result) + "\n");
  return result;
}

const table = [];
for (const c of CASES) {
  const attempts = [];
  for (let i = 0; i < RUNS; i++) attempts.push(await attempt(c));
  const passed = attempts.filter((a) => a.pass).length;
  table.push({
    case: c.id,
    expected: c.expect.tool ?? "(no tool)",
    passed: `${passed}/${RUNS}`,
    // What the failed attempts did instead, so a miss is readable without opening the file.
    misses: attempts
      .filter((a) => !a.pass)
      .map(
        (a) =>
          a.error ??
          (a.calls
            .map((t) => `${t.name}(${JSON.stringify(t.args)})`)
            .join(", ") ||
            "(no tool)"),
      )
      .join(" | "),
    tokens: Math.round(
      attempts.reduce((n, a) => n + a.tokens.input + a.tokens.output, 0) / RUNS,
    ),
    seconds: (attempts.reduce((n, a) => n + a.seconds, 0) / RUNS).toFixed(1),
  });
}

console.table(table);
const passed = table.filter((r) => r.passed === `${RUNS}/${RUNS}`).length;
console.log(
  `${passed}/${table.length} cases passed every run (${RUNS} runs each). Attempts: ${resultsFile}`,
);
process.exit(passed === table.length ? 0 : 1);
