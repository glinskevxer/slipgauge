#!/usr/bin/env bash
#
# Everything CI runs, in the order CI runs it, so a push is not the first time
# anybody finds out. Takes about three minutes on a laptop.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failures=()

step() {
  local name="$1"; shift
  printf '\033[36m==>\033[0m %s\n' "$name"
  if "$@"; then
    printf '\033[32m ok\033[0m %s\n\n' "$name"
  else
    printf '\033[31m  x\033[0m %s\n\n' "$name"
    failures+=("$name")
  fi
}

step "service typecheck"     bash -c "cd '$here/registry-service' && npm run typecheck --silent"
step "service unit tests"    bash -c "cd '$here/registry-service' && npm test --silent"
step "service integration"   bash -c "cd '$here/registry-service' && npm run test:integration --silent"
step "service builds"        bash -c "cd '$here/registry-service' && npm run build --silent"
step "console lint"          bash -c "cd '$here/registry-console' && npm run lint --silent"
step "console typecheck"     bash -c "cd '$here/registry-console' && npm run typecheck --silent"
step "console unit tests"    bash -c "cd '$here/registry-console' && npm test --silent"
step "console builds"        bash -c "cd '$here/registry-console' && npm run build --silent"

if [[ ${#failures[@]} -gt 0 ]]; then
  printf '\033[31m%d step(s) failed:\033[0m %s\n' "${#failures[@]}" "${failures[*]}"
  exit 1
fi

printf '\033[32meverything passed\033[0m\n'
