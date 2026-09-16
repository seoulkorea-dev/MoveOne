#!/usr/bin/env bash
# 서울시 대중교통환승경로(15000414) 원본 응답 확인용.
# 파서를 쓰기 전에 좌표계·커버리지·응답구조·busRouteId 를 눈으로 봅니다.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/probe-out/bus"
mkdir -p "$OUT"

RAW="$(grep -E '^DATA_GO_KR_SERVICE_KEY=' "$ROOT/.env.local" | head -n1 \
        | cut -d= -f2- | tr -d '\r' | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
if [ -z "$RAW" ]; then
  echo "!! .env.local 에 DATA_GO_KR_SERVICE_KEY 가 없습니다."
  exit 1
fi

# Encoding 키(%2B·%2F·%3D 포함)면 그대로 쓰고, Decoding 키면 한 번만 인코딩합니다.
case "$RAW" in
  *%*) KEY="$RAW" ;;
  *)   KEY="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$RAW")" ;;
esac
echo "키 앞 4자리: ${KEY:0:4}…   (길이 ${#KEY})"
echo

BASE="http://ws.bus.go.kr/api/rest/pathinfo/getPathInfoByBusNSub"

call() { # $1=태그  $2=startX $3=startY $4=endX $5=endY  $6=설명
  local tag="$1" sx="$2" sy="$3" ex="$4" ey="$5" desc="$6"
  local url="$BASE?serviceKey=$KEY&startX=$sx&startY=$sy&endX=$ex&endY=$ey&resultType=json"
  local f="$OUT/$tag.txt"
  echo "<<< $tag  ($desc)"
  curl -sS --max-time 25 -o "$f" -w '  HTTP %{http_code}   %{size_download} bytes\n' "$url" \
    || echo "  curl 실패"
  head -c 700 "$f"; echo
  echo ">>> $tag"; echo
}

# X=경도 / Y=위도 (WGS84) 로 가정한 3건
call a-seoul   126.9707 37.5547 127.0276 37.4979 "서울역 -> 강남역 (서울 내부)"
call b-gyeonggi 126.9707 37.5547 127.1116 37.3948 "서울역 -> 판교역 (경기)"
call c-incheon  126.9707 37.5547 126.7249 37.4894 "서울역 -> 부평역 (인천)"

# X/Y 순서가 반대일 가능성 검증 (서울 내부 구간만)
call d-swapped  37.5547 126.9707 37.4979 127.0276 "서울역 -> 강남역 (X·Y 뒤바꿈)"

echo "<<< 필드이름-JSON"
cat "$OUT"/*.txt 2>/dev/null | grep -o '"[A-Za-z_][A-Za-z0-9_]*"[[:space:]]*:' | sort -u | head -60
echo ">>> 필드이름-JSON"
echo
echo "<<< 필드이름-XML"
cat "$OUT"/*.txt 2>/dev/null | grep -o '<[A-Za-z][A-Za-z0-9_]*>' | sort -u | head -60
echo ">>> 필드이름-XML"
echo
echo "<<< busRouteId"
grep -c 'busRouteId' "$OUT"/*.txt 2>/dev/null || echo "없음"
echo ">>> busRouteId"
