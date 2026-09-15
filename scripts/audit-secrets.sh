#!/usr/bin/env bash
# 키가 이미 새어나갔는지 점검합니다. 아무것도 고치지 않고 보고만 합니다.
#
#   ./scripts/audit-secrets.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 1

G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; O=$'\033[0m'
ok()   { printf '  %sOK%s    %s\n' "$G" "$O" "$1"; }
bad()  { printf '  %s위험%s  %s\n' "$R" "$O" "$1"; }
warn() { printf '  %s확인%s  %s\n' "$Y" "$O" "$1"; }

echo
echo "MoveOne 비밀값 점검 — $(pwd)"
echo

# 1. git 이력
echo "── git 이력 ──"
hist=$(git log --all --full-history --oneline -- '.env' '.env.*' ':(exclude)*.example' 2>/dev/null)
if [ -n "$hist" ]; then
  bad ".env 파일이 커밋된 적이 있습니다. 아래 커밋을 확인하고 키를 반드시 교체하세요."
  printf '%s\n' "$hist" | sed 's/^/        /'
else
  ok ".env 계열이 커밋된 적 없음"
fi

tracked=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.example$' || true)
if [ -n "$tracked" ]; then
  bad "지금 추적 중인 .env 파일이 있습니다: $tracked"
else
  ok "추적 중인 .env 파일 없음"
fi

# 2. .gitignore
echo
echo "── .gitignore ──"
if [ -f .gitignore ] && grep -qE '^\.env\*?($|/)|^\*\.env|^\.env\*' .gitignore; then
  ok ".env* 가 무시 목록에 있음"
else
  bad ".env* 가 .gitignore 에 없습니다. scripts/secure-init.sh 를 실행하세요."
fi

# 3. 파일 권한
echo
echo "── 파일 권한 ──"
if [ -f .env.local ]; then
  perm=$(stat -c '%a' .env.local 2>/dev/null || echo "?")
  if [ "$perm" = "600" ]; then ok ".env.local 권한 600"
  else warn ".env.local 권한이 $perm 입니다 → chmod 600 .env.local"; fi
else
  warn ".env.local 이 없습니다"
fi

# 4. 백업 파일
echo
echo "── 패치 백업 파일 ──"
baks=$(find . -name '*.bak-*' -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null)
if [ -n "$baks" ]; then
  warn "백업 파일이 남아 있습니다 ($(printf '%s\n' "$baks" | wc -l)개). 지우세요:"
  echo "        find . -name '*.bak-*' -not -path './node_modules/*' -delete"
else
  ok "백업 파일 없음"
fi

# 5. 셸 히스토리
echo
echo "── 셸 히스토리 ──"
found=0
for f in "$HOME/.bash_history" "$HOME/.zsh_history"; do
  [ -f "$f" ] || continue
  n=$(grep -Eic 'apikey=|KakaoAK|ODSAY_API_KEY|KAKAO_REST' "$f" 2>/dev/null || echo 0)
  if [ "$n" -gt 0 ]; then bad "$(basename "$f") 에 키가 담긴 명령 ${n}줄"; found=1; fi
done
if [ "$found" = "0" ]; then
  ok "히스토리에 키 흔적 없음"
else
  echo "        지우기:  grep -vEi 'apikey=|KakaoAK' ~/.bash_history > /tmp/h && mv /tmp/h ~/.bash_history"
  echo "        앞으로:  키가 든 명령은 맨 앞에 공백 한 칸을 넣고 치세요"
fi

# 6. 훅
echo
echo "── 커밋 차단 훅 ──"
hp=$(git config --get core.hooksPath || echo "")
if [ "$hp" = ".githooks" ] && [ -x .githooks/pre-commit ]; then
  ok "pre-commit 훅 동작 중"
else
  bad "훅이 걸려 있지 않습니다 → ./scripts/secure-init.sh"
fi

echo
echo "'위험' 이 하나라도 있으면 docs/SECURITY-KEYS.md 의 교체 절차를 따르세요."
echo
