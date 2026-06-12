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

# The gates the quality workflow runs. They are cheap, they are the ones a
# review notices first, and a developer who only finds out about them from a
# red build has already pushed.
tests_are_where_they_belong() {
  local stray
  stray=$(find "$here/registry-service/src" "$here/registry-console/src" \
    \( -name '*.spec.ts' -o -name '*.test.ts' \) -print)

  if [[ -n "$stray" ]]; then
    printf 'these belong under /tests:\n%s\n' "$stray"
    return 1
  fi
}

every_migration_is_registered() {
  local on_disk listed
  on_disk=$(ls "$here"/registry-service/src/database/migrations/*-*.ts | wc -l)
  listed=$(grep -c '^  [A-Z].*[0-9],$' "$here"/registry-service/src/database/migrations/index.ts)

  if [[ "$on_disk" -ne "$listed" ]]; then
    printf '%s migration file(s) but %s in the list\n' "$on_disk" "$listed"
    return 1
  fi
}

step "tests live under /tests"  tests_are_where_they_belong
step "migrations registered"    every_migration_is_registered

if [[ ${#failures[@]} -gt 0 ]]; then
  printf '\033[31m%d step(s) failed:\033[0m %s\n' "${#failures[@]}" "${failures[*]}"
  exit 1
fi

printf '\033[32meverything passed\033[0m\n'
