#!/usr/bin/env bash
# PostToolUse: 방금 고친 파일만 포맷·자동수정한다. 실패해도 작업을 막지 않는다.
set -uo pipefail
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.md)
    pnpm exec prettier --write "$file" >/dev/null 2>&1
    ;;
esac
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs)
    out=$(pnpm exec eslint --fix "$file" 2>&1)
    if [ -n "$out" ]; then
      echo "ESLint가 ${file} 에서 자동 수정되지 않는 문제를 보고했습니다:" >&2
      printf '%s\n' "$out" >&2
      exit 1
    fi
    ;;
esac
exit 0
