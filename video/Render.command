#!/bin/zsh
cd "$(dirname "$0")"
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
npm run render
result=$?
if [[ $result -eq 0 ]]; then
  open -R out/SafeNight-story-cut-final.mp4
fi
printf '\nPress Return to close.\n'
read
exit $result
