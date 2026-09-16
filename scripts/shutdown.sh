#!/usr/bin/env bash
# MoveOne 개발 서버 종료. Ctrl-C 로 안 죽었을 때 쓰는 비상구입니다.
#
#   ./scripts/shutdown.sh              포트 4100 정리
#   ./scripts/shutdown.sh 4101         다른 포트
#   ./scripts/shutdown.sh --all        이 리포에서 띄운 node 프로세스까지 정리
#   ./scripts/shutdown.sh --db         DB 컨테이너도 내림
#
# --all 은 **이 리포 안에서 실행 중인 것만** 건드립니다 (작업 디렉터리로 거름).
# 같은 PC 의 다른 프로젝트는 영향받지 않습니다.
set -uo pipefail

# 스크립트 위치는 cd 하기 **전에** 잡아야 합니다.
# 먼저 cd 하면 $0 의 상대 경로가 깨져 lib-port.sh 를 못 찾습니다.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib-port.sh"
cd "$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || echo "$HERE/..")" || exit 1

REPO=$(pwd)
PORT=4100
ALL=0
DB=0
for arg in "$@"; do
  case "$arg" in
    --all) ALL=1 ;;
    --db)  DB=1 ;;
    [0-9]*) PORT=$arg ;;
    *) echo "모르는 옵션: $arg"; exit 1 ;;
  esac
done

G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; O=$'\033[0m'
ok()   { printf '  %s✓%s %s\n' "$G" "$O" "$1"; }
warn() { printf '  %s!%s %s\n' "$Y" "$O" "$1"; }

printf '\n%sMoveOne 종료%s  포트 %s\n\n' "$B" "$O" "$PORT"

# ── 포트를 잡은 프로세스 ───────────────────────────────────────────────
held=$(pids_on_port "$PORT")
if [ -z "$held" ]; then
  ok "포트 $PORT 는 이미 비어 있습니다"
else
  tree=""
  for p in $held; do tree="$tree $(pid_tree "$p")"; done
  warn "정리할 프로세스: $(printf '%s' "$tree" | wc -w)개"
  kill_gracefully $tree
  if [ -z "$(pids_on_port "$PORT")" ]; then
    ok "포트 $PORT 비움"
  else
    warn "포트가 아직 물려 있습니다. 남은 것: $(pids_on_port "$PORT")"
    echo "     ss -lptn 'sport = :$PORT'   로 확인해 보세요"
  fi
fi

# ── 리포 안의 남은 node (--all) ────────────────────────────────────────
if [ "$ALL" = "1" ]; then
  stale=$(stale_node_in_repo "$REPO")
  # 자기 자신과 부모 셸은 빼야 합니다.
  filtered=""
  for p in $stale; do
    [ "$p" = "$$" ] && continue
    [ "$p" = "$PPID" ] && continue
    filtered="$filtered $p"
  done
  filtered=$(printf '%s' "$filtered" | sed 's/^ *//')

  if [ -z "$filtered" ]; then
    ok "리포에 남은 node 프로세스 없음"
  else
    warn "리포에서 실행 중인 node $(printf '%s' "$filtered" | wc -w)개 정리"
    kill_gracefully $filtered
    ok "정리 완료"
  fi
fi

# ── DB (--db) ──────────────────────────────────────────────────────────
if [ "$DB" = "1" ]; then
  if command -v docker >/dev/null 2>&1; then
    docker compose stop >/dev/null 2>&1 && ok "DB 컨테이너 중지" || warn "DB 중지 실패"
  else
    warn "docker 가 없습니다"
  fi
fi

echo
