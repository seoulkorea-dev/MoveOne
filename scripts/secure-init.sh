#!/usr/bin/env bash
# 비밀값 보호를 한 번에 걸어줍니다. 여러 번 실행해도 안전합니다.
#
#   ./scripts/secure-init.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

echo
echo "1) .gitignore 보강"
touch .gitignore
add_ignore() {
  if grep -qxF "$1" .gitignore; then
    echo "     이미 있음  $1"
  else
    printf '%s\n' "$1" >> .gitignore
    echo "     추가       $1"
  fi
}
grep -qxF '# 비밀값·패치 백업' .gitignore || printf '\n# 비밀값·패치 백업\n' >> .gitignore
add_ignore '.env'
add_ignore '.env.*'
add_ignore '!.env*.example'
add_ignore '*.bak-*'
add_ignore '*.pem'
add_ignore 'check-stubs.d.ts'
add_ignore 'tsconfig.check.json'

echo
echo "2) pre-commit 훅 연결"
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
echo "     core.hooksPath = $(git config --get core.hooksPath)"

echo
echo "3) .env.local 권한"
if [ -f .env.local ]; then
  chmod 600 .env.local
  echo "     $(stat -c '%a %n' .env.local)"
else
  echo "     .env.local 이 없습니다 (건너뜀)"
fi

echo
echo "4) 점검"
./scripts/audit-secrets.sh
