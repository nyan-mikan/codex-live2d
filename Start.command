#!/bin/zsh
set -eu
TASK_DIR="${0:A:h}"
TASK_NODE="$(command -v node || true)"
if [[ -z "$TASK_NODE" ]]; then
  TASK_NODES=("$HOME"/.nvm/versions/node/*/bin/node(N))
  if (( ${#TASK_NODES} )); then TASK_NODE="${TASK_NODES[-1]}"; fi
fi
if [[ -z "$TASK_NODE" ]]; then print 'Install Node.js 22 or later first. / 请先安装 Node.js 22 或更新版本。'; exit 1; fi
"$TASK_NODE" "$TASK_DIR/launch.mjs"
