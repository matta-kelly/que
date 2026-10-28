#!/usr/bin/env node
/**
 * The command of @mku1tra/que-harness: `que-harness lint <deployment folder>` lints the deployment as one graph, with
 * the harness schema, from its code alone (the source `deployment`): no note of the folder is read, no model fact is
 * asked for, and no network is read. It lints as a folder's lint does (lintFolder), so it runs basis's rules over the
 * schemas themselves too: their type notes, and each zod object their packages export (basis/one-definition). Prints
 * each problem at its file, from the folder it is run in, and ends with a fault when there is one.
 */

import { realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sayProblem } from "@mku1tra/que-plugin";
import { lintFolder } from "@mku1tra/basis";
import { harness } from "./schema.ts";
import { readDeployment } from "./read.ts";
import { deployment } from "./source.ts";

// The folder that holds both folders.
const holding = (one: string, other: string): string => {
  let at = one;
  while (relative(at, other).startsWith("..")) at = dirname(at);
  return at;
};

const USAGE = "usage: que-harness lint <deployment folder>";

/** What the command prints, and its exit code, for its arguments. */
export async function command(
  args: readonly string[],
  cwd: string,
): Promise<{ out: string; code: number }> {
  const [verb, folder, ...rest] = args;
  if (verb !== "lint" || folder === undefined || rest.length)
    return { out: USAGE, code: 2 };
  // The folder linted holds the deployment and the real folder of each plugin it installs, wherever npm put the link
  // to it: each path the source gives is in it. Its code is given by the source; no note of it is read.
  const read = await readDeployment(resolve(cwd, folder));
  const root = read.plugins
    .map((plugin) => plugin.dir)
    .reduce(holding, read.dir);
  const { problems } = await lintFolder(harness, root, {
    sources: [deployment(read.dir, root)],
    skip: () => true,
  });
  const here = realpathSync(cwd);
  const from = (path: string) => relative(here, resolve(root, path)) || ".";
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
