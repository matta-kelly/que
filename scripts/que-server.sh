#!/usr/bin/env bash
# que's server, as a node runs it: the runtime workspace's listen.ts, under tsx, with no npm around
# the process. Nothing here names a deployment: QUE_DEPLOYMENT arrives at run time from the
# container that starts this one, and que's mount says so when it is missing.
#
# The image installs que's packages, not a build of them, so tsx runs the source, as
# `npm run server -w runtime` does in the dev container.
set -euo pipefail
cd /app/que/server/runtime

# server/.npmrc hands this condition to what npm starts, and npm starts nothing here: it is said
# again, so que's own packages resolve to their source. A setting the node adds is kept.
export NODE_OPTIONS="--conditions=@mku1tra/que-source${NODE_OPTIONS:+ $NODE_OPTIONS}"

exec node --import tsx src/listen.ts
