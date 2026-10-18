#!/usr/bin/env bash
# =============================================================================
#  VERCEL'S "IGNORED BUILD STEP" (vercel.json ignoreCommand)
# =============================================================================
# Exit 0 skips this deployment; exit 1 builds it. Vercel runs this before
# installing anything, so it costs seconds, not a build.
#
# A deployment is skipped only when EVERY file changed since the branch's
# last successful deployment is one the running app never reads: tests,
# docs, historical SQL copies, the native iOS and Android shells, CI workflows,
# the root notes (*.md) and the browser check scripts. Nothing under app/,
# lib/, components/, public/, content/, themes/ or the build's own scripts
# is ever skipped. Canonical run-now SQL is also a build input: the admin's
# SQL updates catalog must ship when a part is added, changed or removed.
#
# Anything uncertain builds: no previous deployment, a previous commit the
# shallow clone does not have, a git error, or a change list that cannot be
# read. Production on main keeps deploying on every change that matters.
#
# Agent branches (claude/*, codex/*) never reach this: vercel.json's
# git.deploymentEnabled turns their automatic deployments off.
set -u
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
cur="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
if [ -z "$prev" ]; then echo "No previous deployment on this branch: building."; exit 1; fi
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then echo "Previous deployment ${prev} is not in the clone: building."; exit 1; fi
if ! changed=$(git diff --name-only "$prev" "$cur" 2>/dev/null); then echo "Could not compare with ${prev}: building."; exit 1; fi
if [ -z "$changed" ]; then echo "No file changes since ${prev} (a redeploy): building."; exit 1; fi
if printf '%s\n' "$changed" | grep -qE '^supabase/sql/run-now/[^/]+\.sql$'; then
  echo "Canonical SQL changed: rebuilding the admin SQL updates catalog."
  exit 1
fi
runtime=$(printf '%s\n' "$changed" | grep -vE '^(tests/|docs/|supabase/|sql/|android/|ios/|\.github/|scratchpad/|[^/]+\.md$|scripts/(check|render|probe)-[^/]+$)')
if [ -n "$runtime" ]; then
  echo "Changes the app uses:"; printf '%s\n' "$runtime" | head -20
  exit 1
fi
echo "Only tests, docs, SQL, native shells, CI or notes changed since ${prev}: skipping this build."
printf '%s\n' "$changed" | head -20
exit 0
