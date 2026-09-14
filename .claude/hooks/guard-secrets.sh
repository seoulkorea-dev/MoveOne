#!/usr/bin/env bash
# PreToolUse: .env 계열 파일 편집과 하드코딩된 비밀값을 차단한다. exit 2 = 차단.
set -uo pipefail
input=$(cat)

# jq가 없으면 검사를 건너뛴다(작업을 막지 않는다). WSL: sudo apt install jq
command -v jq >/dev/null 2>&1 || { echo "guard-secrets: jq가 없어 비밀값 검사를 건너뜁니다. 'sudo apt install jq'" >&2; exit 0; }

file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -z "$file" ] && exit 0

case "$(basename "$file")" in
  # 예시 파일은 값이 비어 있으므로 통과시킨다 (.env.example, .env.local.example 등)
  *.example|*.sample|*.template)
    exit 0
    ;;
  .env|.env.*)
    echo "차단: ${file} 은 비밀값 파일입니다. 값이 필요하면 .env.local.example 에 키 이름만 추가하고 사용자에게 직접 입력을 요청하세요." >&2
    exit 2
    ;;
esac

payload=$(printf '%s' "$input" | jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits // [] | map(.new_string) | join("\n"))] | map(select(. != null)) | join("\n")')
[ -z "$payload" ] && exit 0

# 명백한 비밀값 패턴만 잡는다. 예시/플레이스홀더는 통과시킨다.
if printf '%s' "$payload" | grep -Eqi '(odsay|kakao|smtp|database|session)[_a-z]*(key|secret|password|url|token)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'{$][^"'"'"']{7,}'; then
  echo "차단: 비밀값으로 보이는 리터럴이 ${file} 에 포함되어 있습니다. process.env 로 읽고 .env.example 에 키만 등록하세요." >&2
  exit 2
fi

# 클라이언트 컴포넌트에서 서버 전용 키 사용 차단
if printf '%s' "$payload" | grep -q "'use client'" && printf '%s' "$payload" | grep -Eq 'process\.env\.(ODSAY_|KAKAO_REST_|DATABASE_|SMTP_|SESSION_)'; then
  echo "차단: 클라이언트 컴포넌트(${file})에서 서버 전용 환경변수를 참조하고 있습니다. app/api 프록시를 통해 호출하세요. (규칙 20-security.md)" >&2
  exit 2
fi

exit 0
