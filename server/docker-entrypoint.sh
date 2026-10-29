#!/bin/sh
set -e
# Optional, idempotent seeding so `docker compose up` gives a working demo.
if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding demo data (SEED_ON_START=true)..."
  node scripts/seed.js
fi
exec "$@"
