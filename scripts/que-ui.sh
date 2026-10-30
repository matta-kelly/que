#!/usr/bin/env bash
# que's UI, as a node runs it: the build the image made, served by Next on port 3000, the port the
# node reads it on. No npm around the process, and no build at run time: `next build` ran in the
# image's build.
set -euo pipefail
cd /app/que/ui

# The UI proxies to the server on QUE_URL, which the node sets; the port it serves on is its own.
exec node node_modules/next/dist/bin/next start --port "${PORT:-3000}"
