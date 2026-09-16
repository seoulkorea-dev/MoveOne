#!/usr/bin/env bash
# MoveOne 개발 서버 시작.
#
#   ./scripts/start.sh            포트 4100
#   ./scripts/start.sh 4101       worktree 등 다른 포트
#
# `pnpm dev` 를 그냥 쓰지 않고 이 스크립트를 두는 이유:
#
#   WSL + Turbopack 조합에서 Ctrl-C 가 Next 를 못 죽이는 일이 있습니다.
#   `pnpm dev` 는 `next dev` 를 자식으로 띄우고, Next 는 다시 워커를 띄웁니다.
#   Ctrl-C 는 포그라운드 프로세스 그룹에만 가는데 워커가 그룹을 벗어나
#   살아남으면 포트가 계속 물려 있고, 다음 실행이 "포트 사용 중" 으로 죽습니다.
#
#   여기서는 Ctrl-C 를 직접 받아서 **프로세스 트리 전체**를 정리하고,
#   그래도 안 풀리면 포트를 잡은 놈을 찾아 끝냅니다.
set -uo pipefail

# 스크립트 위치는 cd 하기 **전에** 잡아야 합니다.
# 먼저 cd 하면 $0 의 상대 경로가 깨져 lib-port.sh 를 못 찾습니다.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-port.sh"
cd "$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || echo "$HERE/..")" || exit 1

PORT="${1:-4100}"
G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; O=$'\033[0m'
ok()   { printf '  %s✓%s %s\n' "$G" "$O" "$1"; }
bad()  { printf '  %s✗%s %s\n' "$R" "$O" "$1"; }
warn() { printf '  %s!%s %s\n' "$Y" "$O" "$1"; }

printf '\n%sMoveOne 개발 서버%s  포트 %s\n\n' "$B" "$O" "$PORT"

# ── 1. 남아 있는 프로세스 정리 ─────────────────────────────────────────
held=$(pids_on_port "$PORT")
if [ -n "$held" ]; then
  warn "포트 $PORT 를 쓰고 있는 프로세스: $held — 정리합니다"
  tree=""
  for p in $held; do tree="$tree $(pid_tree "$p")"; done
  kill_gracefully $tree
  if [ -n "$(pids_on_port "$PORT")" ]; then
    bad "포트를 못 비웠습니다. 수동으로 확인하세요:"
    echo "     ss -lptn 'sport = :$PORT'"
    exit 1
  fi
  ok "포트 $PORT 비움"
fi

# ── 2. 환경 점검 ───────────────────────────────────────────────────────
[ -f .env.local ] || { bad ".env.local 이 없습니다. .env.local.example 을 복사해 채우세요."; exit 1; }
ok ".env.local 있음"

if command -v docker >/dev/null 2>&1; then
  if docker compose ps --status running 2>/dev/null | grep -q db; then
    ok "DB 컨테이너 실행 중"
  else
    warn "DB 컨테이너가 꺼져 있어 시작합니다"
    docker compose up -d >/dev/null 2>&1 && ok "DB 시작" || bad "DB 시작 실패 — docker compose up -d 를 직접 실행해 보세요"
  fi
else
  warn "docker 를 찾을 수 없습니다. DB 없이 뜨면 로그인·검색이 실패합니다."
fi

# ── 3. Ctrl-C 를 제대로 받습니다 ───────────────────────────────────────
DEV_PID=""
cleanup() {
  trap - INT TERM EXIT
  printf '\n'
  if [ -n "$DEV_PID" ]; then
    kill_gracefully $(pid_tree "$DEV_PID")
  fi
  # 트리를 지웠는데도 포트가 물려 있으면 그놈을 직접 찾습니다.
  left=$(pids_on_port "$PORT")
  if [ -n "$left" ]; then
    tree=""
    for p in $left; do tree="$tree $(pid_tree "$p")"; done
    kill_gracefully $tree
  fi
  if [ -z "$(pids_on_port "$PORT")" ]; then
    ok "종료 완료 — 포트 $PORT 비었습니다"
  else
    bad "포트 $PORT 가 아직 물려 있습니다. ./scripts/shutdown.sh $PORT 를 실행하세요."
  fi
  exit 0
}
trap cleanup INT TERM EXIT

# ── 4. 실행 ────────────────────────────────────────────────────────────
printf '\n  http://localhost:%s   (끄려면 Ctrl-C)\n\n' "$PORT"
pnpm exec next dev -p "$PORT" &
DEV_PID=$!
wait "$DEV_PID"
