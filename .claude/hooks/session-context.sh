#!/usr/bin/env bash
# SessionStart: 지금 어디서 무엇을 하는 중인지 세션 시작 시 컨텍스트로 주입한다.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(git 아님)")
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
wt=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
db="중지"
if docker compose ps --status running 2>/dev/null | grep -q postgres; then db="실행중"; fi

cat <<CTX
[MoveOne 세션 컨텍스트]
- 브랜치: ${branch} (변경 파일 ${dirty}개)
- worktree: ${wt}개
- Postgres(5433): ${db}
- 검증 명령: pnpm verify / E2E: pnpm test:e2e
- 티켓 목록: docs/TICKETS.md
CTX
exit 0
