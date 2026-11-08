#!/bin/zsh
cd "$(dirname "$0")"
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
npm run dev
