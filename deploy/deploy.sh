#!/usr/bin/env bash
# Runs ON THE SERVER (CI uploads it with docker-compose.prod.yml to /opt/spool-api).
# Usage: SPOOL_IMAGE=ghcr.io/jkhandeveloper/spool-api:<sha> ./deploy.sh
# Rolls back to the previous image if the new one doesn't become healthy.
set -euo pipefail
cd "$(dirname "$0")"

: "${SPOOL_IMAGE:?SPOOL_IMAGE is required}"
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is missing. As root: apt-get install -y docker-compose-v2" >&2
  exit 1
fi
COMPOSE=(docker compose -f docker-compose.prod.yml)

previous=""
[[ -f .current-image ]] && previous="$(cat .current-image)"

echo "Pulling $SPOOL_IMAGE"
docker pull -q "$SPOOL_IMAGE"

up() { SPOOL_IMAGE="$1" "${COMPOSE[@]}" up -d --remove-orphans; }

healthy() {
  for _ in $(seq 1 30); do
    status="$(docker inspect -f '{{.State.Health.Status}}' spool_api 2>/dev/null || echo missing)"
    [[ "$status" == healthy ]] && return 0
    sleep 3
  done
  return 1
}

up "$SPOOL_IMAGE"
if healthy; then
  echo "$SPOOL_IMAGE" > .current-image
  echo "Deployed $SPOOL_IMAGE"
  docker image prune -af --filter "label=org.opencontainers.image.source=https://github.com/jkhandeveloper/spool-api" --filter "until=168h" >/dev/null || true
  exit 0
fi

echo "New image did not become healthy. Last logs:" >&2
docker logs --tail 50 spool_api >&2 || true
if [[ -n "$previous" ]]; then
  echo "Rolling back to $previous" >&2
  up "$previous"
fi
exit 1
