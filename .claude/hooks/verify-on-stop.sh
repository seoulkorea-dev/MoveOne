#!/usr/bin/env bash
# Stop: 소스가 바뀐 채로 턴을 끝내려 하면 검증을 돌리고, 실패하면 exit 2 로 되돌린다.
set -uo pipefail
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# 이 훅 때문에 다시 돌아온 턴이면 무한루프를 막기 위해 통과시킨다.
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

changed=$(git status --porcelain -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.css' 2>/dev/null | wc -l | tr -d ' ')
[ "$changed" = "0" ] && exit 0

if out=$(pnpm verify 2>&1); then
  exit 0
fi

echo "검증(pnpm verify)이 실패했습니다. 아래 문제를 고치고 나서 마무리하세요." >&2
printf '%s\n' "$out" | tail -n 60 >&2
exit 2
