#!/bin/bash
# Pull + build + restart on the droplet. Called by the GitHub Actions deploy
# workflow (.github/workflows/deploy.yml) over SSH, but also safe to run by hand:
#   cd /var/www/portal && bash deploy-update.sh
set -euo pipefail

cd /var/www/portal

echo "▶ Fetching latest main…"
git fetch origin main
git reset --hard origin/main

echo "▶ Installing dependencies…"
npm ci --omit=dev=false

# Prisma reads .env (not .env.local); the build runs `prisma migrate deploy`.
echo "▶ Building (cap heap so the 512MB box uses swap instead of OOMing)…"
export NODE_OPTIONS="--max-old-space-size=2048"
npm run build

echo "▶ Restarting app…"
pm2 restart portal --update-env
pm2 save

echo "✅ Deploy complete: $(git rev-parse --short HEAD)"
