#!/usr/bin/env bash
# The smoke check of que's runtime image: the four things only a built image decides.
# It is a step of each ship run, after the build and before any push, and it is the same
# check on a machine that built the image the same way.
#
#   scripts/smoke-image.sh <image>                       every step
#   scripts/smoke-image.sh <image> server|ui|data|git    one step, while a fix touches one
#
# The image is `ghcr.io/matta-kelly/que:<tag>`: a tag's run pushes the tag only after these
# steps pass. The engine is podman, or docker where a runner has only that
# (`QUE_SMOKE_ENGINE=docker`). The steps start four containers of this machine and remove
# them, and the one volume they make.
#
# What the image owes these steps, since they are the only place it is read:
#   - the commands `que-server` and `que-ui` on PATH, run as they are, with no npm around them
#   - the user `node`, and a `/data` folder node can write at, which a new named volume keeps
#     (the node mounts its data volume there, and QUE_DATA_DIR=/data)
#   - `que-ui` on port 3000, the port the node reads it on (`http://que-ui:3000`)
#   - no setting that picks a deployment: `QUE_DEPLOYMENT` arrives at run time from the
#     container that starts it, and a baked one fails the first step
#   - QUE_COMMIT arrives at build (`--build-arg`), since the image has no .git to read it from:
#     the run passes the commit it builds, and `_serve` says the same one
#   - a shell, and coreutils: the steps read /data and the image's folders from inside it
# No step here holds the image's tags: `latest` is a tag the run does not push.
set -euo pipefail

engine=${QUE_SMOKE_ENGINE:-podman}
image=${1:-}
only=${2:-all}

usage() {
    echo "usage: scripts/smoke-image.sh <image> [server|ui|data|git]" >&2
    exit 2
}
[ -n "$image" ] || usage
case "$only" in
    all | server | ui | data | git) ;;
    *) usage ;;
esac

volume=
container=

cleanup() {
    [ -z "$container" ] || "$engine" rm -f "$container" >/dev/null 2>&1 || true
    [ -z "$volume" ] || "$engine" volume rm -f "$volume" >/dev/null 2>&1 || true
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
step_server() {
    local out code=0
    out=$(timeout 60 "$engine" run --rm "$image" que-server 2>&1) || code=$?
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

# Given a new named volume at /data, when a process in the image writes a file there, then the
# process ran as node, and the file on the volume is node's. A /data the image does not hold, or
# holds as another user's, fails on the second line rather than the first.
step_data() {
    local out code=0 owner user
    volume="que-smoke-data-$$-$RANDOM"
    "$engine" volume create "$volume" >/dev/null
    out=$(timeout 60 "$engine" run --rm -v "$volume:/data" "$image" \
        sh -c 'id -un && printf smoke > /data/smoke && stat -c %U /data/smoke' 2>&1) || code=$?
    if [ "$code" -ne 0 ]; then
        echo "a process in the image could not write to a new volume at /data (exit $code): $out" >&2
        return 1
    fi
    user=$(sed -n 1p <<<"$out")
    owner=$(sed -n 2p <<<"$out")
    if [ "$user" != node ]; then
        echo "a process in the image runs as $user, not node" >&2
        return 1
    fi
    if [ "$owner" != node ]; then
        echo "the file written to the new volume at /data is $owner's, not node's" >&2
        return 1
    fi
}

# Then the image holds no .git. A .git in it ships the repo's history, which the image reads
# nothing of, and QUE_COMMIT is how it names its commit instead. No path is assumed.
step_git() {
    local out
    out=$(timeout 120 "$engine" run --rm "$image" find / -xdev -type d -name .git -print 2>&1) || {
        echo "find failed in the image: $out" >&2
        return 1
    }
    if [ -n "$out" ]; then
        echo "the image holds a .git at: $out" >&2
        return 1
    fi
}

for name in server ui data git; do
    [ "$only" = all ] || [ "$only" = "$name" ] || continue
    echo "== image: $name"
    if ! require_image || ! "step_$name"; then
        echo "smoke failed at: image: $name" >&2
        exit 1
    fi
done
echo "the image passed the smoke check: $image"
