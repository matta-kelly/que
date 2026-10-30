/**
 * The wiring of the pair's release, read from `.github/workflows/publish.yml`: one tag starts one job, which runs the
 * server set, then the guard on npm's live records (scripts/pair-release-live.ts), then publishes what the guard
 * names, plugin before harness. Only a tag's run on GitHub runs the job; these hold the file it runs, and the README
 * that tells a release how to start it. The file is read as text, line by line, in the shape GitHub's own examples
 * write: a job's steps are the items of its `steps:`, each a `- ` at one indent.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dirname, "../../../..");
const workflow = readFileSync(
  join(repo, ".github/workflows/publish.yml"),
  "utf8",
);
const readme = readFileSync(join(repo, "README.md"), "utf8");

/** The workflow's lines with no comment lines, so a comment's words are never read as a step's. */
const lines = workflow.split("\n").filter((line) => !/^\s*#/.test(line));
const indent = (line: string) => line.length - line.trimStart().length;

/** The patterns of `on.push.tags`, in its flow form (`tags: ["a", "b"]`) or its block form (`- a` lines). */
const tagPatterns = (): string[] => {
  const at = lines.findIndex((line) => /^\s+tags:/.test(line));
  if (at < 0) return [];
  const flow = /tags:\s*\[(.*)\]/.exec(lines[at]);
  if (flow)
    return flow[1]
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  const block: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s+-\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
    if (!item || indent(line) <= indent(lines[at])) break;
    block.push(item[1]);
  }
  return block;
};

/** One step of the job: its text, and its `id`, `if`, `uses`, `run` and `working-directory` as written. */
type Step = {
  text: string;
  id?: string;
  if?: string;
  uses?: string;
  run: string;
  dir?: string;
};

const field = (text: string, name: string) =>
  new RegExp(`^\\s*(?:- )?${name}:\\s*(.+)$`, "m").exec(text)?.[1].trim();

/** The steps of the job, in order: the items of its `steps:`. */
const steps = (): Step[] => {
  const at = lines.findIndex((line) => /^\s+steps:\s*$/.test(line));
  assert.ok(at >= 0, "the job has steps");
  const items: string[][] = [];
  let item = -1;
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "") continue;
    if (indent(line) <= indent(lines[at])) break;
    if (/^\s*- /.test(line) && (item < 0 || indent(line) === indent(items[0][0])))
      items[++item] = [line];
    else if (item >= 0) items[item].push(line);
  }
  return items.map((step) => {
    const text = step.join("\n");
    const run = /run:\s*\|?\s*([\s\S]*)$/.exec(text)?.[1] ?? "";
    return {
      text,
      id: field(text, "id"),
      if: field(text, "if"),
      uses: field(text, "uses"),
      run,
      dir: field(text, "working-directory"),
    };
  });
};

const show = (all: Step[]) =>
  all.map((step, at) => `${at}: ${step.text.trim()}`).join("\n---\n");

const PACKAGE_TAG = /que-(plugin|harness)-v/;

test("given the workflow, when a tag is pushed, then one pattern starts it, which names neither package alone and is not que's own v*", () => {
  const patterns = tagPatterns();
  assert.equal(
    patterns.length,
    1,
    `one tag pattern; on.push.tags has ${JSON.stringify(patterns)}`,
  );
  const [pattern] = patterns;
  assert.doesNotMatch(pattern, /plugin|harness/, "it names neither package");
  assert.notEqual(pattern, "v*", "que's own tags publish nothing");
  assert.doesNotMatch(pattern, /^v/, "que's own tags publish nothing");
});

test("given a version npm already has, when the job runs, then no step passes it on its own: only the guard's outputs start a publish", () => {
  const all = steps();
  assert.doesNotMatch(
    lines.join("\n"),
    /npm (view|info|show)\b/,
    "no step reads npm to skip a publish",
  );
  const guard = all.find((step) => step.run.includes("pair-release-live.ts"));
  assert.ok(guard?.id, `a step with an id runs the guard:\n${show(all)}`);
  const publishes = all.filter(
    (step) => step.dir && /\bnpm publish\b/.test(step.run),
  );
  assert.deepEqual(
    publishes.map((step) => step.dir),
    ["server/plugin", "server/harness"],
    `one publish step for each package, plugin first:\n${show(all)}`,
  );
  for (const [step, side] of [
    [publishes[0], "plugin"],
    [publishes[1], "harness"],
  ] as const)
    assert.match(
      step.if ?? "",
      new RegExp(
        `steps\\.${guard.id}\\.outputs\\.${side}\\s*==\\s*'true'`,
      ),
      `the publish of ${side} runs only when the guard names it`,
    );
});

test("given harness's publish fails after plugin's succeeds, when the job ends, then it fails and its last step says npm holds plugin alone and the tag's run must be run again", () => {
  const all = steps();
  const plugin = all.find(
    (step) => step.dir === "server/plugin" && /\bnpm publish\b/.test(step.run),
  );
  assert.ok(plugin?.id, `plugin's publish step has an id:\n${show(all)}`);
  const last = all.at(-1);
  assert.ok(last);
  assert.match(
    last.if ?? "",
    /failure\(\)/,
    `the last step runs when the job has failed:\n${show(all)}`,
  );
  assert.match(
    last.if ?? "",
    new RegExp(`steps\\.${plugin.id}\\.outcome\\s*==\\s*'success'`),
    "and plugin's publish succeeded",
  );
  assert.match(last.run, /que-plugin/, "it names plugin");
  assert.match(last.run, /alone/, "npm holds plugin alone");
  assert.match(last.run, /again/, "the tag's run must be run again");
  assert.match(last.run, /exit 1/, "the job fails");
});

test("given the job, when its steps are read in order, then they are checkout, node, npm 11.21.0, the server set, the guard, publish plugin, publish harness", () => {
  const all = steps();
  const is = [
    (step: Step) => step.uses?.startsWith("actions/checkout@"),
    (step: Step) => step.uses?.startsWith("actions/setup-node@"),
    (step: Step) => /npm install --global npm@11\.21\.0\b/.test(step.run),
    (step: Step) => /scripts\/check\.sh server\b/.test(step.run),
    (step: Step) => step.run.includes("pair-release-live.ts"),
    (step: Step) =>
      step.dir === "server/plugin" && /\bnpm publish\b/.test(step.run),
    (step: Step) =>
      step.dir === "server/harness" && /\bnpm publish\b/.test(step.run),
  ];
  const names = [
    "checkout",
    "node",
    "npm 11.21.0",
    "the server set",
    "the guard",
    "publish plugin",
    "publish harness",
  ];
  const read = all.map((step) => names[is.findIndex((one) => one(step))]);
  // After them, only the step that names a partial publish, which runs on a failure.
  const tail = all.slice(names.length);
  assert.deepEqual(
    read.slice(0, names.length),
    names,
    `the job's steps:\n${show(all)}`,
  );
  assert.ok(
    tail.every((step) => /failure\(\)/.test(step.if ?? "")),
    `after harness's publish, only a step on failure:\n${show(tail)}`,
  );
});

test("given the README, when a release is read there, then one tag of the workflow's pattern publishes the pair, and no per-package tag is named", () => {
  assert.doesNotMatch(
    readme,
    PACKAGE_TAG,
    "the README names no que-plugin-v or que-harness-v tag",
  );
  const [pattern] = tagPatterns();
  const prefix = (pattern ?? "").replace(/\*.*$/, "");
  assert.ok(
    prefix && readme.includes(prefix),
    `the README names the tag that publishes the pair, ${pattern}`,
  );
});
