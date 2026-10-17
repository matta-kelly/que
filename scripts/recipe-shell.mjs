// Writes the shell of each justfile recipe to a file of its own, named by the recipe, for shellcheck to read.
// Reads the justfile as just dumps it (`just --dump --dump-format json`) on stdin, and writes into the folder given.
// An interpolation, {{...}}, is just's and not shell: it becomes one plain word, and shellcheck reads the shell around it.
import { readFileSync, writeFileSync } from "node:fs";

const [dir] = process.argv.slice(2);
const { recipes } = JSON.parse(readFileSync(0, "utf8"));

for (const recipe of Object.values(recipes)) {
  const lines = recipe.body.map((line) =>
    line.map((part) => (typeof part === "string" ? part.replaceAll("{{{{", "{{") : "_just_")).join(""),
  );
  // A recipe with no shebang runs each line in its own `sh -cu`, after just takes off the @ or - in front.
  const script = recipe.shebang ? lines : ["#!/bin/sh", "set -u", ...lines.map((line) => line.replace(/^[@-]+/, ""))];
  writeFileSync(`${dir}/${recipe.namepath}`, `${script.join("\n")}\n`);
}
