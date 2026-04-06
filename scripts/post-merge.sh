#!/bin/bash
set -e

echo "→ Installing dependencies..."
pnpm install --frozen-lockfile

echo "→ Pushing database schema..."
pnpm --filter @workspace/db run push-force

echo "→ Seeding initial data..."
pnpm --filter @workspace/scripts run seed

echo "✓ Post-merge setup complete"
