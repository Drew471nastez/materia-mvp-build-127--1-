#!/bin/sh
# Starts the official image's own init (freshclam daemon, then clamd) in the
# background, then the API in the foreground. The API drops from root to the
# unprivileged clamav user itself (RUN_AS_USER) before it listens.
# The API answers /health with 503 until clamd is up, so a platform's health
# check holds traffic back while the signatures load.
set -eu

/init &

exec node /app/src/server.js
