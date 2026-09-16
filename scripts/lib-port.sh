# 포트를 잡고 있는 프로세스를 찾고 정리합니다.
# start.sh / shutdown.sh 가 함께 씁니다. 직접 실행하는 파일이 아닙니다.
#
# WSL 배포판마다 들어 있는 도구가 달라서 세 가지를 차례로 시도합니다.
# 하나라도 있으면 동작합니다.

pids_on_port() { # 포트 → PID 목록 (공백 구분)
  local port=$1 pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)
  fi
  if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "$port/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$')
  fi
  if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
    pids=$(ss -lptnH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2)
  fi

  printf '%s' "$pids" | tr '\n' ' ' | sed 's/ *$//'
}

# 자식까지 포함해 프로세스 트리를 모읍니다.
# Next 는 워커를 띄우므로 부모만 죽이면 포트가 안 풀릴 때가 있습니다.
pid_tree() { # PID → 자신 + 모든 자손
  local pid=$1 child
  printf '%s ' "$pid"
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    pid_tree "$child"
  done
}

# TERM 으로 먼저 부탁하고, 안 죽으면 KILL 합니다.
kill_gracefully() { # PID 목록...
  local pids="$*" left
  [ -z "$pids" ] && return 0

  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    left=""
    for p in $pids; do kill -0 "$p" 2>/dev/null && left="$left $p"; done
    [ -z "$left" ] && return 0
    sleep 0.3
  done

  # shellcheck disable=SC2086
  kill -KILL $left 2>/dev/null
  sleep 0.3
  return 0
}

# 이 리포에서 띄운 채 남아 있는 node 프로세스.
# 다른 프로젝트(My-Project 등)를 건드리지 않도록 **작업 디렉터리로** 거릅니다.
stale_node_in_repo() { # 리포 절대경로 → PID 목록
  local repo=$1 pid cwd out=""
  for pid in $(pgrep -f 'node|next' 2>/dev/null); do
    cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null) || continue
    case "$cwd" in
      "$repo"|"$repo"/*) out="$out $pid" ;;
    esac
  done
  printf '%s' "$out" | sed 's/^ *//'
}
