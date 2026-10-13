#!/usr/bin/env bash
# que's Postgres: a dedicated container on 127.0.0.1:5433, data in the
# que-pgdata volume. Run on the host, with the deployment's .env file, which
# holds the password.
set -euo pipefail
env_file=${1:?give the .env file of the deployment}
PW=$(grep '^POSTGRES_PASSWORD=' "$env_file" | cut -d= -f2-)
if podman container exists que-postgres; then
  podman start que-postgres >/dev/null
else
  podman run -d --name que-postgres --restart=unless-stopped \
    -p 127.0.0.1:5433:5432 -v que-pgdata:/var/lib/postgresql/data \
    -e POSTGRES_USER=que -e POSTGRES_DB=que -e POSTGRES_PASSWORD="$PW" \
    docker.io/library/postgres:17 >/dev/null
fi
echo "que-postgres running on 127.0.0.1:5433"
