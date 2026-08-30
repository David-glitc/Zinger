#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
TECTONIC="${TECTONIC:-$HOME/.local/bin/tectonic}"
if [[ ! -x "$TECTONIC" ]]; then
  echo "tectonic not found; install from https://tectonic-typesetting.github.io/" >&2
  exit 1
fi
"$TECTONIC" -X compile zinger-handbook.tex --outdir .
echo "wrote $(pwd)/zinger-handbook.pdf"
