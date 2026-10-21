#!/usr/bin/env bash
# Stages a PHP release for deployment (ADR-008): copies api/ sources, embeds the
# private Twin9 engine, installs production dependencies with the local
# Composer, stamps VERSION.
# Output: build/api-release/ (flat, ready to upload as app/releases/<ts>/).
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
stage="$repo/build/api-release"

rm -rf "$stage"
mkdir -p "$stage"

cp -R "$repo/api/src" "$stage/src"
cp -R "$repo/api/public" "$stage/public"
cp "$repo/api/composer.json" "$repo/api/composer.lock" "$stage/"

# The private Twin9 engine (ADR-011 §4, T18): its sources and its commit in
# Twin_v9/, outside the webroot, where the release's EngineLoader finds them.
# TWIN_V9_DIR, else ../Twin_v9, at the root of its git clone; the files of its
# commit; refuses a missing engine or templates, and uncommitted changes.
node "$repo/scripts/deploy/stage-twin9.mjs" "$stage"

# JSON Schemas: the dual-runtime validation contract (P1) ships with the release
mkdir -p "$stage/schemas"
cp "$repo/schemas/"*.schema.json "$stage/schemas/"
# the variables the engine gives each Twin9 template: the atelier checks a copy's edits against it (T14)
cp "$repo/schemas/twin9-protocole-contrat.json" "$stage/schemas/"
if [ -d "$repo/api/config" ]; then cp -R "$repo/api/config" "$stage/config"; fi
if [ -d "$repo/scripts/migrations" ]; then
  mkdir -p "$stage/scripts"
  cp -R "$repo/scripts/migrations" "$stage/scripts/migrations"
  cp "$repo/scripts/migrate.php" "$stage/scripts/migrate.php" 2>/dev/null || true
fi

# Digest de doc de l'assistant tuteur (D9) — régénéré avant la copie de data.
node "$repo/scripts/build-tuteur-digest.mjs"

# Corpus du seed des compétences atomiques (POST /api/admin/seed-competences)
# + digest tuteur (tuteur-digest.md).
if [ -d "$repo/scripts/data" ]; then
  mkdir -p "$stage/scripts/data"
  cp -R "$repo/scripts/data/." "$stage/scripts/data/"
fi

# Regenerate the PUBLISHED prompt packages imported by `deploy.mjs api`
# (build/prompt-packages/*.json, hash-idempotent server-side): the default
# aurora package (P8) and the forkable Twin6 package (D1/AD-D1). Both are
# deterministic — re-running is a no-op on the server. The Twin6 fiches P1..P7
# are regenerated here from the committed corpus rather than left to a prior
# front build; its three public templates are versioned in scripts/data/twin6/
# (since 2026-10-20, UC-SYS-04 AN-2).
node "$repo/scripts/build-default-prompt-package.mjs"
node "$repo/scripts/generate-fiches.mjs"
node "$repo/scripts/build-twin6-prompt-package.mjs"

git -C "$repo" describe --always --dirty 2>/dev/null > "$stage/VERSION" || echo "unknown" > "$stage/VERSION"

# Production vendor/ with the local Composer: composer.json pins the platform to
# PHP 8.2 (the OVH version), so the installed set is the lock's, whatever the
# local PHP.
composer install --no-dev --optimize-autoloader --no-interaction --quiet --working-dir="$stage"

echo "staged release $(cat "$stage/VERSION") in $stage ($(find "$stage" -type f | wc -l | tr -d ' ') files)"
