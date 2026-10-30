# que's runtime image: que's server, que's built UI, and the two commands a node runs from it. It
# names no deployment: QUE_DEPLOYMENT arrives at run time, from the container that starts it. A `v*`
# tag's ship run pushes this image after the smoke steps pass on it (scripts/smoke-image.sh).
#
# node 22 is the version que's engines ask for, on Debian's slim variant: nothing here compiles
# against a C library, so a browser and a sudo user would only be more to pull.
FROM node:22-bookworm-slim

# The commit this image is built from, for a run's trace. The image holds no .git to read it from,
# so the ship run passes --build-arg QUE_COMMIT=<sha>, as `_serve` passes its own in the dev container.
ARG QUE_COMMIT=""

# The label that links the package to this repo: it gives the package the repo's access permissions, and
# not its visibility, so the first publish is private. A pull then needs a login, which is step H1b's and
# `landl-image`'s business, not this file's.
LABEL org.opencontainers.image.source="https://github.com/matta-kelly/que" \
      org.opencontainers.image.revision="${QUE_COMMIT}"

ENV NEXT_TELEMETRY_DISABLED=1 \
    QUE_COMMIT="${QUE_COMMIT}"

# A node mounts its data volume here (QUE_DATA_DIR=/data): made as node's, so a new named volume keeps
# that owner.
RUN install -d -o node -g node -m 755 /data

# The installs run as node, as they do in the dev container, so no file in the image is root's.
WORKDIR /app/que
RUN chown node:node /app/que
USER node

# The server's install first, so a change to the UI alone does not install it again. It holds the
# runtime's devDependency on tsx, which runs the server's source: que builds no JavaScript to run.
COPY --chown=node:node server/ server/
RUN cd server && npm ci

# The UI's dependencies, then its sources, then its build: `next build` runs here, so a node serves
# the built UI with no build step of its own.
COPY --chown=node:node ui/package.json ui/package-lock.json ui/
RUN cd ui && npm ci
COPY --chown=node:node ui/ ui/
RUN cd ui && npm run build

# The two commands, on PATH as plain executables: no npm around the process. They keep their .sh
# name in the repo, where the shell set lints them, and are copied out of it under the names a node runs.
COPY --chown=node:node scripts/que-server.sh /usr/local/bin/que-server
COPY --chown=node:node scripts/que-ui.sh /usr/local/bin/que-ui
RUN chmod 755 /usr/local/bin/que-server /usr/local/bin/que-ui

ENV NODE_ENV=production

EXPOSE 2024 3000
