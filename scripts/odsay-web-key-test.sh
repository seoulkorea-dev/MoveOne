#!/usr/bin/env bash
# ODsay 웹 키가 왜 거부되는지 경우의 수를 한 번에 돌려봅니다.
#
#   ./scripts/odsay-web-key-test.sh
#
# 무엇을 가리는가:
#   1) 키에 +, /, = 가 들어 있는가 → URL 인코딩이 문제일 수 있습니다
#   2) Referer 형식에 따라 결과가 달라지는가 → 콘솔 등록 형식 문제
#   3) 서버 키로도 같은 결과인가 → 플랫폼 구분이 실제로 도는지
#
# 키는 .env.local 에서 읽으므로 셸 히스토리에 남지 않습니다.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 1

readkey() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
WEBKEY=$(readkey NEXT_PUBLIC_ODSAY_WEB_KEY)
SRVKEY=$(readkey ODSAY_API_KEY)

[ -z "$WEBKEY" ] && { echo "NEXT_PUBLIC_ODSAY_WEB_KEY 가 .env.local 에 없습니다."; exit 1; }

SDK="https://api.odsay.com/v1/api/subway/sdk.js"

echo
echo "── 키 생김새 ──"
printf '  웹   키  %s자' "${#WEBKEY}"
special=$(printf '%s' "$WEBKEY" | tr -cd '+/=%' )
if [ -n "$special" ]; then
  printf '   특수문자 있음: %s  ← URL 인코딩이 결과를 바꿀 수 있습니다\n' "$special"
else
  printf '   특수문자 없음 (인코딩 영향 없음)\n'
fi
if [ -n "$SRVKEY" ]; then
  if [ "$WEBKEY" = "$SRVKEY" ]; then
    echo "  서버 키  웹 키와 같은 값 ← 이것부터 고쳐야 합니다"
  else
    printf '  서버 키  %s자 (웹 키와 다름 — 정상)\n' "${#SRVKEY}"
  fi
fi

# 응답 한 줄 요약. ODsay 는 실패해도 HTTP 200 으로 주는 일이 많아 본문을 봅니다.
probe() { # 설명 / referer(비우면 안 보냄) / 인코딩여부(raw|enc) / 키
  local label=$1 ref=$2 mode=$3 key=$4 out code body
  local -a args=(-s -o /tmp/odsay_sdk_body -w '%{http_code}')
  [ -n "$ref" ] && args+=(-H "Referer: $ref")

  if [ "$mode" = "enc" ]; then
    code=$(curl "${args[@]}" -G --data-urlencode "apiKey=$key" --data-urlencode "callback=cb" "$SDK")
  else
    code=$(curl "${args[@]}" "$SDK?apiKey=$key&callback=cb")
  fi

  body=$(head -c 300 /tmp/odsay_sdk_body 2>/dev/null | tr -d '\n')
  case "$body" in
    *ApiKeyAuthFailed*)  out="인증 실패" ;;
    *AccessDenied*|*domain*|*Domain*) out="도메인 거부" ;;
    *error*|*Error*)     out="오류: $(printf '%s' "$body" | head -c 60)" ;;
    "")                  out="빈 응답" ;;
    *)                   out="✅ 정상 (스크립트 내려옴)" ;;
  esac
  printf '  %-34s HTTP %-4s %s\n' "$label" "$code" "$out"
}

echo
echo "── Referer 별 (웹 키, 인코딩 없음) ──"
probe "Referer 없음"                        ""                                  raw "$WEBKEY"
probe "http://localhost:4100/"              "http://localhost:4100/"            raw "$WEBKEY"
probe "http://localhost:4100"               "http://localhost:4100"             raw "$WEBKEY"
probe "http://localhost:4100/route/detail"  "http://localhost:4100/route/detail" raw "$WEBKEY"
probe "http://127.0.0.1:4100/"              "http://127.0.0.1:4100/"            raw "$WEBKEY"
probe "http://localhost/"                   "http://localhost/"                 raw "$WEBKEY"

echo
echo "── 키 인코딩 비교 (Referer 고정) ──"
probe "인코딩 없음"                          "http://localhost:4100/"            raw "$WEBKEY"
probe "URL 인코딩"                           "http://localhost:4100/"            enc "$WEBKEY"

if [ -n "$SRVKEY" ] && [ "$SRVKEY" != "$WEBKEY" ]; then
  echo
  echo "── 서버 키로도 해보기 (플랫폼 구분이 실제로 도는지) ──"
  probe "서버 키"                            "http://localhost:4100/"            raw "$SRVKEY"
fi

rm -f /tmp/odsay_sdk_body

cat <<'MSG'

── 읽는 법 ──
  어느 한 줄이라도 ✅ 면 그 조건이 답입니다. 코드를 그 형식에 맞추면 됩니다.
  전부 "인증 실패" 면 콘솔 등록 자체가 아직 반영되지 않았을 가능성이 큽니다
  (ODsay 는 서버 IP 등록 때도 반영에 시간이 걸렸습니다).
  "도메인 거부" 가 보이면 키는 맞고 등록한 URI 문자열만 고치면 됩니다.

출력을 그대로 보내주세요. 키 값은 들어가지 않습니다.
MSG
echo
