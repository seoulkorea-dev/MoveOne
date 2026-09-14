#!/usr/bin/env bash
# MoveOne worktree 헬퍼.
# 티켓 하나 = 브랜치 하나 = worktree 하나. 포트도 worktree마다 다르게 배정한다.
#
#   ./scripts/wt.sh new P1-3 route-search   # 생성
#   ./scripts/wt.sh list                    # 목록
#   ./scripts/wt.sh rm P1-3                 # 정리
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel) || exit 1
WT_DIR="$ROOT/../moveone-worktrees"
cd "$ROOT" || exit 1

usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

cmd="${1:-}"; shift || true

case "$cmd" in
  new)
    id="${1:-}"; slug="${2:-}"
    [ -z "$id" ] || [ -z "$slug" ] && usage
    branch="feat/${id}-${slug}"
    dir="$WT_DIR/${id}"

    if [ -d "$dir" ]; then
      echo "이미 있습니다: $dir"; exit 1
    fi

    mkdir -p "$WT_DIR"
    git fetch --quiet origin 2>/dev/null || true
    base=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || echo main)
    git worktree add -b "$branch" "$dir" "${base#origin/}" || exit 1

    # 포트 배정: 기존 worktree 수 + 4101
    n=$(find "$WT_DIR" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
    port=$((4100 + n))

    if [ -f "$ROOT/.env.local" ]; then
      sed "s/^PORT=.*/PORT=${port}/" "$ROOT/.env.local" > "$dir/.env.local"
      grep -q '^PORT=' "$dir/.env.local" || echo "PORT=${port}" >> "$dir/.env.local"
    else
      echo "PORT=${port}" > "$dir/.env.local"
      echo "  주의: 루트에 .env.local 이 없어 PORT만 만들었습니다. 나머지 값을 채우세요."
    fi

    ln -s "$ROOT/node_modules" "$dir/node_modules" 2>/dev/null || true

    cat <<MSG

worktree 준비 완료
  티켓    : ${id}
  브랜치  : ${branch}
  경로    : ${dir}
  개발포트: ${port}   (DB는 5433을 공유합니다)

  cd ${dir} && claude
MSG
    ;;

  list)
    git worktree list
    ;;

  rm)
    id="${1:-}"; [ -z "$id" ] && usage
    dir="$WT_DIR/${id}"
    [ -d "$dir" ] || { echo "없습니다: $dir"; exit 1; }

    if [ -n "$(git -C "$dir" status --porcelain)" ]; then
      echo "커밋되지 않은 변경이 있습니다. 확인 후 직접 지우세요:"
      git -C "$dir" status --short
      exit 1
    fi
    branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD)
    git worktree remove "$dir" || exit 1
    echo "제거했습니다: $dir  (브랜치 ${branch} 는 남아 있습니다)"
    ;;

  *) usage ;;
esac
