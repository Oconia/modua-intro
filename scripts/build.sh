#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist/client dist/server dist/.openai
cp -R public/. dist/client/
cp worker/index.mjs dist/server/index.js
cp .openai/hosting.json dist/.openai/hosting.json
