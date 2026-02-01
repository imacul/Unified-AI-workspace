#!/usr/bin/env bash
set -euo pipefail

# Start Redis via docker-compose (local dev)
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Bringing up Redis using docker-compose..."
if command -v docker >/dev/null 2>&1; then
  docker compose up -d redis || docker-compose up -d redis
  echo "Redis started. To view logs: docker compose logs -f redis"
  echo "Run the Redis setup script: node server/scripts/setup_redis_buckets.js"
else
  echo "Docker not found. Install Docker or run Redis manually (e.g., apt install redis-server)."
  exit 1
fi
