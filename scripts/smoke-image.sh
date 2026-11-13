#!/usr/bin/env bash
# The smoke check of que's runtime image: the three things only a built image decides.
# It is a step of each ship run, after the build and before any push, and it is the same
# check on a machine that built the image the same way.
#
#   scripts/smoke-image.sh <image>                       every step
#   scripts/smoke-image.sh <image> server|ui|git         one step, while a fix touches one
#
# The image is `ghcr.io/matta-kelly/que:<tag>`: a tag's run pushes the tag only after these
# steps pass. The engine is podman, or docker where a runner has only that
# (`QUE_SMOKE_ENGINE=docker`). The steps start three containers of this machine and remove
# them.
#
# What the image owes these steps, since they are the only place it is read:
#   - the commands `que-server` and `que-ui` on PATH, run as they are, with no npm around them
#   - `que-ui` on port 3000, the port the node reads it on (`http://que-ui:3000`)
#   - no setting that picks a deployment: `QUE_DEPLOYMENT` arrives at run time from the
#     container that starts it, and a baked one fails the first step
#   - QUE_COMMIT arrives at build (`--build-arg`), as the image's revision label, since the image
#     has no .git to read it from
#   - a shell, and find: the git step reads the image's folders from inside it
# No step here holds the image's tags: `latest` is a tag the run does not push.
set -euo pipefail

engine=${QUE_SMOKE_ENGINE:-podman}
image=${1:-}
only=${2:-all}

usage() {
    echo "usage: scripts/smoke-image.sh <image> [server|ui|git]" >&2
    exit 2
}
[ -n "$image" ] || usage
case "$only" in
    all | server | ui | git) ;;
    *) usage ;;
esac

container=

cleanup() {
    [ -z "$container" ] || "$engine" rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Every step begins here: an image that this commit has not built is what the check is missing,
# not a fault of the image. `image exists` reads no registry, so a step here pulls nothing.
require_image() {
    "$engine" image exists "$image" && return 0
    echo "smoke: there is no image $image on this machine, so nothing can be said of it." >&2
    echo "Build it from this commit first: $engine build -t $image ." >&2
    return 1
}

# Given no QUE_DEPLOYMENT, when que-server starts, then it exits, and says which setting it needs.
# The server makes its users store as it loads (runtime/src/access/users.ts), before it reads the
# deployment (deploymentFolder in runtime/src/mount/mounted.ts), and that store throws when
# DATABASE_URL is not set (backend/users/index.ts). So the run gets the one setting the load needs to
# reach that check. The store's pool is made, not dialled, before the missing deployment stops the start.
step_server() {
    local out code=0
    out=$(timeout 60 "$engine" run --rm -e DATABASE_URL=postgres://que@127.0.0.1:1/que "$image" que-server 2>&1) || code=$?
    if [ "$code" -eq 0 ]; then
        echo "que-server exited 0 with no QUE_DEPLOYMENT: it served with nothing that names a deployment" >&2
        return 1
    fi
    case "$out" in
        *"QUE_DEPLOYMENT is not set"*) ;;
        *)
            echo "que-server exited $code, and did not say QUE_DEPLOYMENT is not set. It said: $out" >&2
            return 1
            ;;
    esac
}

# When que-ui starts, then it answers / with 200 on port 3000. The root page is a client page,
# so this needs no server behind it, and no QUE_URL.
step_ui() {
    local code port
    container=$("$engine" run -d --rm -p 127.0.0.1::3000 "$image" que-ui)
    for _ in $(seq 1 60); do
        port=$("$engine" port "$container" 3000/tcp 2>/dev/null | head -1 | sed 's/.*://') || true
        code=$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port:-0}/" 2>/dev/null) || code=000
        if [ "$code" = 200 ]; then
            return 0
        fi
        sleep 2
    done
    echo "que-ui did not answer / with 200 on port 3000 in 120s: it answered ${code:-nothing}. Its log ends with:" >&2
    "$engine" logs --tail 20 "$container" >&2 || true
    echo "Port 3000 is the port the node reads the UI on. A page that needs a server answers 5xx here." >&2
    return 1
}

# Then the image holds no .git. A .git in it ships the repo's history, which the image reads nothing
# of, and its revision label (QUE_COMMIT) names its commit instead. No path is assumed: find runs as root, so
# no folder is out of its reach, and a .git only root can read is still found. Only stdout is a
# path, so a permission error cannot read as a .git, and a find that does not finish still fails it.
step_git() {
    local out status=0
    out=$(timeout 120 "$engine" run --rm --user root "$image" \
        find / -xdev -type d -name .git -print) || status=$?
    if [ -n "$out" ]; then
        echo "the image holds a .git at: $out" >&2
        return 1
    fi
    if [ "$status" -ne 0 ]; then
        echo "find did not finish in the image (exit $status), so it cannot say the image holds no .git" >&2
        return 1
    fi
}

for name in server ui git; do
    [ "$only" = all ] || [ "$only" = "$name" ] || continue
    echo "== image: $name"
    if ! require_image || ! "step_$name"; then
        echo "smoke failed at: image: $name" >&2
        exit 1
    fi
done
echo "the image passed the smoke check: $image"
