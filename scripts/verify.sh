#!/usr/bin/env bash
# 전체 검증. pnpm verify 와 같지만 어느 단계에서 깨졌는지 명확히 보여준다.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

fail=0
step() {
  printf '\n\033[1m▶ %s\033[0m\n' "$1"
  shift
  if "$@"; then
    printf '\033[32m  ✓ 통과\033[0m\n'
  else
    printf '\033[31m  ✗ 실패: %s\033[0m\n' "$1"
    fail=1
  fi
}

step "타입 검사 (tsc --noEmit)" pnpm typecheck
step "린트 (eslint)"           pnpm lint
step "단위 테스트 (vitest)"     pnpm test:unit
step "빌드 (next build)"        pnpm build

if [ "${1:-}" = "e2e" ]; then
  step "E2E (playwright)" pnpm test:e2e
fi

printf '\n'
if [ "$fail" = "0" ]; then
  printf '\033[32m검증 전체 통과\033[0m\n'
else
  printf '\033[31m검증 실패 — 위 ✗ 항목을 보세요\033[0m\n'
fi
exit "$fail"
