# A justfile that the shell set of scripts/check.sh must fail: each recipe hides a failure from `set -e`.
# A lint that passes one of them reads nothing of the recipes.

dir := "."

script:
    #!/usr/bin/env bash
    set -euo pipefail
    mapfile -t files < <(ls "{{dir}}")
    echo "${files[@]}"

lines:
    @echo "$(ls "{{dir}}")"
