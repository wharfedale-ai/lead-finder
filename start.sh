#!/bin/sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 18.18 or newer from https://nodejs.org'; exit 1; }
if [ ! -d node_modules ]; then npm ci --omit=dev || exit 1; fi
echo 'Open the local address printed below in your browser. Keep this window open.'
node scripts/launch.mjs
