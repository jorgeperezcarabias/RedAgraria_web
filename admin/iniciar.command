#!/bin/zsh
cd "$(dirname "$0")/.." || exit 1
node admin/server.mjs
