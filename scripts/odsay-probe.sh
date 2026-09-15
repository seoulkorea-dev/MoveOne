#!/usr/bin/env bash
# ODsay 가 실제로 무엇을 주는지 한 번에 찍어 봅니다.
#
#   ./scripts/odsay-probe.sh 서울역 사당
#   ./scripts/odsay-probe.sh 서울역 사당 1     # 1=지하철 2=버스 0=전체(기본)
#
# .env.local 의 ODSAY_API_KEY 를 읽습니다. 키를 명령줄에 쓰지 않으므로
# 셸 히스토리에 남지 않습니다.
#
# 좌표는 아래 표에 있는 이름만 지원합니다. 다른 곳을 보려면
# 좌표를 직접 넘기세요:  ./scripts/odsay-probe.sh 126.9707,37.5547 126.9816,37.4765
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 1

command -v jq >/dev/null || { echo "jq 가 필요합니다:  sudo apt install jq"; exit 1; }

readkey() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
KEY=$(readkey ODSAY_API_KEY)
WEBKEY=$(readkey NEXT_PUBLIC_ODSAY_WEB_KEY)
[ -z "$KEY" ] && { echo ".env.local 에서 ODSAY_API_KEY 를 못 찾았습니다."; exit 1; }

# ── 0단계: 키 점검 ─────────────────────────────────────────────────────
# ODsay 는 "플랫폼마다 1개의 API Key" 입니다. 서버 키와 웹 키는 값이 다릅니다.
# 같은 값을 넣으면 노선도가 [ApiKeyAuthFailed] 로 죽습니다.
echo
echo "── 키 점검 ──"
printf '  서버 키   %s자\n' "${#KEY}"
if [ -z "$WEBKEY" ]; then
  echo "  웹   키   없음 — 노선도를 쓰려면 NEXT_PUBLIC_ODSAY_WEB_KEY 가 필요합니다"
elif [ "$WEBKEY" = "$KEY" ]; then
  echo "  웹   키   ${#WEBKEY}자 — ⚠ 서버 키와 값이 같습니다. 이것이 ApiKeyAuthFailed 의 원인입니다."
  echo "            ODsay 콘솔에서 Web 플랫폼 키를 따로 발급받으세요."
else
  printf '  웹   키   %s자 (서버 키와 다름 — 정상)\n' "${#WEBKEY}"
  body=$(curl -s -H "Referer: http://localhost:4100/" \
    "https://api.odsay.com/v1/api/subway/sdk.js?apiKey=$WEBKEY&callback=cb" | head -c 200)
  case "$body" in
    *ApiKeyAuthFailed*) echo "            ⚠ SDK 응답: 인증 실패. Web 플랫폼에 http://localhost:4100 이 등록됐는지 확인하세요" ;;
    *error*)            echo "            ⚠ SDK 응답에 오류가 있습니다: $(printf '%s' "$body" | head -c 120)" ;;
    "")                 echo "            ⚠ SDK 응답이 비었습니다" ;;
    *)                  echo "            SDK 응답 정상 (스크립트가 내려옵니다)" ;;
  esac
fi

# 자주 쓰는 지점 (경도,위도 — ODsay 순서)
coord() {
  case "$1" in
    서울역)   echo "126.9707,37.5547" ;;
    사당)     echo "126.9816,37.4765" ;;
    강남역)   echo "127.0276,37.4979" ;;
    판교역)   echo "127.1114,37.3947" ;;
    잠실역)   echo "127.1001,37.5133" ;;
    홍대입구) echo "126.9239,37.5571" ;;
    *)        echo "$1" ;;   # "경도,위도" 를 직접 넘긴 경우
  esac
}

FROM=$(coord "${1:-서울역}"); TO=$(coord "${2:-사당}"); TYPE="${3:-0}"
SX=${FROM%,*}; SY=${FROM#*,}
EX=${TO%,*};   EY=${TO#*,}

echo
echo "출발 $SX,$SY  →  도착 $EX,$EY   SearchPathType=$TYPE (1=지하철 2=버스 0=전체)"
echo

# ── 1단계 ──────────────────────────────────────────────────────────
S=$(curl -sS -G "https://api.odsay.com/v1/api/searchPubTransPathT" \
      --data-urlencode "apiKey=$KEY" \
      --data-urlencode "SX=$SX" --data-urlencode "SY=$SY" \
      --data-urlencode "EX=$EX" --data-urlencode "EY=$EY" \
      --data-urlencode "SearchPathType=$TYPE")

if echo "$S" | jq -e '.error' >/dev/null 2>&1; then
  echo "searchPubTransPathT 실패:"; echo "$S" | jq -c '.error'; exit 1
fi

echo "── 경로 후보 ──"
echo "$S" | jq -r '
  .result.path
  | to_entries[]
  | "  [\(.key)] pathType=\(.value.pathType)  \(.value.info.totalTime)분  환승 \((.value.info.busTransitCount // 0) + (.value.info.subwayTransitCount // 0) - 1)회  mapObj=\(.value.info.mapObj)"
' 2>/dev/null | head -6

echo
echo "── 0번 경로의 구간 ──"
echo "$S" | jq -r '
  .result.path[0].subPath[]
  | "  trafficType=\(.trafficType) \(
      if .trafficType==1 then "지하철 " + ((.lane[0].name) // "?")
      elif .trafficType==2 then "버스 " + ((.lane[0].busNo) // "?")
      else "도보" end
    )  \(.startName // "")→\(.endName // "")  \(.sectionTime // 0)분"
' 2>/dev/null

MAPOBJ=$(echo "$S" | jq -r '.result.path[0].info.mapObj // empty')
[ -z "$MAPOBJ" ] && { echo; echo "mapObj 가 없습니다. 여기서 끝."; exit 1; }

# ── 2단계 ──────────────────────────────────────────────────────────
echo
echo "── loadLane(0:0@$MAPOBJ) ──"
L=$(curl -sS -G "https://api.odsay.com/v1/api/loadLane" \
      --data-urlencode "apiKey=$KEY" \
      --data-urlencode "mapObject=0:0@$MAPOBJ")

if echo "$L" | jq -e '.error' >/dev/null 2>&1; then
  echo "loadLane 실패:"; echo "$L" | jq -c '.error'; exit 1
fi

# 이게 핵심입니다. type 1=지하철 2=버스 (ODsay 가이드 예제 기준).
# 지하철 구간인데 점이 수백 개면 도로를 따라가는 선일 가능성이 큽니다.
echo "$L" | jq -r '
  .result.lane
  | to_entries[]
  | "  lane[\(.key)] type=\(.value.type) class=\(.value.class // "-") sections=\(.value.section | length) points=\([.value.section[].graphPos | length] | add)"
' 2>/dev/null

echo
echo "── 첫 구간의 앞뒤 좌표 3개씩 ──"
echo "$L" | jq -c '.result.lane[0].section[0].graphPos | (.[0:3], .[-3:])' 2>/dev/null

echo
echo "정리해서 보내주세요. 키는 출력에 들어가지 않습니다."
echo
