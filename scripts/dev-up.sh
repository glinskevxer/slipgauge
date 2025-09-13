#!/usr/bin/env bash
#
# Brings up a database, migrates it, loads the demo laboratory and starts both
# sides. Everything it starts is torn down again when this script is stopped,
# because a stray PostgreSQL container from last week is how people end up
# debugging against data they do not recognise.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
service="$here/registry-service"
console="$here/registry-console"

db_container="slipgauge-dev-db"
db_port="${REGISTRY_DB_PORT:-5432}"

log() { printf '\033[36m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[31mx\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  log "stopping"
  [[ -n "${service_pid:-}" ]] && kill "$service_pid" 2>/dev/null || true
  [[ -n "${console_pid:-}" ]] && kill "$console_pid" 2>/dev/null || true
  if [[ "${started_db:-no}" == "yes" ]]; then
    docker rm -f "$db_container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

command -v node >/dev/null || fail "no node on the path, this needs node 20"

if pg_isready -h localhost -p "$db_port" >/dev/null 2>&1; then
  log "using the postgres already listening on $db_port"
else
  command -v docker >/dev/null || fail "no postgres on $db_port and no docker to start one"
  log "starting postgres in docker"
  docker run --rm --detach --name "$db_container" \
    --env POSTGRES_DB=slipgauge \
    --env POSTGRES_USER=slipgauge \
    --env POSTGRES_PASSWORD=slipgauge \
    --publish "$db_port:5432" \
    postgres:16.6-alpine >/dev/null
  started_db=yes

  log "waiting for it to accept connections"
  for _ in $(seq 1 30); do
    docker exec "$db_container" pg_isready -U slipgauge >/dev/null 2>&1 && break
    sleep 1
  done
fi

log "starting the registry service with the demo laboratory"
(
  cd "$service"
  REGISTRY_DB_URL="postgres://localhost:$db_port/slipgauge" \
  REGISTRY_DB_USER=slipgauge \
  REGISTRY_DB_PASSWORD=slipgauge \
  REGISTRY_JWT_SECRET="a-development-only-signing-key-nobody-should-deploy" \
  REGISTRY_DEMO_ESTATE=true \
  npm run start:dev
) &
service_pid=$!

log "waiting for the service to come up"
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8080/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS http://localhost:8080/health >/dev/null 2>&1 \
  || fail "the service did not come up, look at the output above"

log "starting the console"
(
  cd "$console"
  npm start
) &
console_pid=$!

cat <<'BANNER'

  Console   http://localhost:4200
  API       http://localhost:8080/api
  Docs      http://localhost:8080/api/docs
  Health    http://localhost:8080/health
  Metrics   http://localhost:8080/metrics

  Sign in as h.whitcombe with demo-password-not-for-real-use

  Control C stops everything this script started.

BANNER

wait
