#!/usr/bin/env node
/**
 * The command of @mku1tra/que-harness: `que-harness lint <deployment folder>` lints the deployment as one graph, with
 * the harness schema (lintDeployment), from its code alone: no model fact is asked for, and no network is read. Prints
 * each problem at its file, from the folder it is run in, and ends with a fault when there is one.
 */

import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sayProblem } from "@mku1tra/que-plugin";
import { readDeployment } from "./read.ts";
import { lintDeployment } from "./source.ts";

const USAGE = "usage: que-harness lint <deployment folder>";

/** What the command prints, and its exit code, for its arguments. */
export async function command(
  args: readonly string[],
  cwd: string,
): Promise<{ out: string; code: number }> {
  const [verb, folder, ...rest] = args;
  if (verb !== "lint" || folder === undefined || rest.length)
    return { out: USAGE, code: 2 };
  const { problems } = lintDeployment(
    await readDeployment(resolve(cwd, folder)),
  );
  const from = (path: string) =>
    path.startsWith(sep) ? relative(cwd, path) || "." : path;
  return problems.length
    ? {
        out: problems
          .map((problem) =>
            sayProblem({ ...problem, path: from(problem.path) }),
          )
          .join("\n"),
        code: 1,
      }
    : { out: "no problem", code: 0 };
}

// Run as the command, not imported: the file Node was asked to run is this one.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { out, code } = await command(process.argv.slice(2), process.cwd());
  (code ? console.error : console.log)(out);
  process.exit(code);
}
