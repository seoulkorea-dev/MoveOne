#!/usr/bin/env bash
# 서울교통공사 최단경로 API 실제 응답 확인.
#   SEOUL_OPENAPI_KEY=xxxx ./scripts/routing-probe.sh
#   SEOUL_OPENAPI_KEY=xxxx ./scripts/routing-probe.sh 강남 판교
#
# 주의: 이 API 는 경로를 못 찾아도 resultCode "00"(성공)으로 답하고
#       paths 를 빈 배열로 준다. 그래서 코드가 아니라 paths 개수를 봐야 한다.
set -u

if [ -z "${SEOUL_OPENAPI_KEY:-}" ]; then
  echo "SEOUL_OPENAPI_KEY 에 열린데이터광장 '일반 인증키'를 넣어주세요."
  echo "(실시간 지하철 인증키와 다른 키입니다)"
  exit 1
fi
KEY="$SEOUL_OPENAPI_KEY"
BASE="http://openapi.seoul.go.kr:8088"
DT_RAW="$(date '+%Y-%m-%d %H:00:00')"
DT="$(printf '%s' "$DT_RAW" | sed 's/ /%20/')"
OUT="./probe-out"
mkdir -p "$OUT"

enc() { printf '%s' "$1" | od -An -tx1 -v | tr -d '\n ' | sed 's/\(..\)/%\1/g'; }

# 응답은 공백을 포함해 예쁘게 출력된다("resultCode" : "00") — grep 패턴에 공백 허용 필수.
field() { grep -o "\"$2\"[[:space:]]*:[[:space:]]*[^,}]*" "$1" | head -1 | sed 's/.*:[[:space:]]*//' | tr -d '"'; }

probe() {
  local dep="$1" arv="$2" type="${3:-duration}" tag="$4"
  local url="$BASE/$KEY/json/getShtrmPath/1/200/$(enc "$dep")/$(enc "$arv")/$DT/$type"
  local file="$OUT/$tag.json"
  curl -s --max-time 25 "$url" -o "$file"

  printf '%-22s ' "$dep→$arv[$type]"
  if [ ! -s "$file" ]; then echo "응답 없음 (네트워크/포트 8088 확인)"; return; fi

  local code msg stops dstc hr crg trs lines
  code="$(field "$file" resultCode)"
  msg="$(field "$file" resultMsg)"
  stops="$(grep -o '"dptreStn"' "$file" | wc -l | tr -d ' ')"
  dstc="$(field "$file" totalDstc)"
  hr="$(field "$file" totalReqHr)"
  crg="$(field "$file" totalCardCrg)"
  trs="$(field "$file" trsitNmtm)"
  lines="$(grep -o "\"lineNm\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" | sed 's/.*"\([^"]*\)"$/\1/' | sort -u | tr '\n' ',' | sed 's/,$//')"

  if [ "$code" != "00" ]; then
    echo "실패 code=$code $msg"
  elif [ "$stops" = "0" ]; then
    echo "경로 없음 (code=00 이지만 paths 가 빔) ← 커버리지 밖"
  else
    printf '구간 %-3s 환승 %-2s %sm %s초 %s원 | %s\n' "$stops" "$trs" "$dstc" "$hr" "$crg" "$lines"
  fi
}

if [ $# -ge 2 ]; then
  probe "$1" "$2" "${3:-duration}" custom
  echo "저장: $OUT/custom.json"
  exit 0
fi

echo "기준일시: $DT_RAW"
echo
echo "== 기준선 =="
probe 답십리 역삼 duration base
echo
echo "== searchType 3종 =="
probe 강남 잠실 duration type-duration
probe 강남 잠실 distance type-distance
probe 강남 잠실 transfer type-transfer
echo
echo "== 서울 1~8호선 =="
probe 방화 상일동 duration seoul-long
probe 오금 장암   duration seoul-mixed
echo
echo "== 수도권 타 운영사 =="
probe 강남 판교         duration metro-shinbundang
probe 서울역 인천       duration metro-line1
probe 김포공항 마곡나루 duration metro-airport
probe 왕십리 청량리     duration metro-gyeongui
probe 인천시청 부평     duration metro-incheon1
probe 왕십리 평내호평   duration metro-gyeongchun
probe 서울역 수원       duration metro-line1-suwon
echo
echo "─────────────────────────────────────────"
echo "원본 JSON: $OUT/"
echo "경로 없음(빈 paths)이 나온 조합이 커버리지 구멍입니다."
