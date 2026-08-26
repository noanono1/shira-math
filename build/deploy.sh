#!/bin/bash
# Deploy Shira's world to GitHub Pages (repo: noanono1/shira-math).
# Publishes outputs/SHIRA__math WITHOUT build/ (dev tools stay home).
# Usage: bash outputs/SHIRA__math/build/deploy.sh
set -euo pipefail
SITE="$(cd "$(dirname "$0")/.." && pwd)"
PY="$SITE/../../.venv/bin/python"; [ -x "$PY" ] || PY=python3
"$PY" "$SITE/build/build_search_index.py"
"$PY" "$SITE/build/build_pages_manifest.py"   # רשימת הדפים לשמירה במכשיר (עבודה בלי רשת)
TMP="$(mktemp -d)"
rsync -a --exclude 'build' "$SITE/" "$TMP/site/"
touch "$TMP/site/.nojekyll"
cd "$TMP/site"
git init -q -b main
git add -A
git commit -q -m "deploy $(date +%Y-%m-%d_%H:%M)"
git remote add origin "https://github.com/noanono1/shira-math.git"
git push -q -f origin main
echo "pushed. site: https://noanono1.github.io/shira-math/"
rm -rf "$TMP"
