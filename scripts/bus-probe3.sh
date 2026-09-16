#!/usr/bin/env bash
# B안 전제 확인: 노선별 경유 정류장(getStaionByRoute) 을 쓸 수 있는가?
#   - 15000193 활용신청이 되어 있는가
#   - 경기·인천 면허 노선도 나오는가
#   - 환승경로의 fid/tid 와 매칭될 필드가 있는가
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/probe-out/bus"; mkdir -p "$OUT"

RAW="$(grep -E '^DATA_GO_KR_SERVICE_KEY=' "$ROOT/.env.local" | head -n1 \
        | cut -d= -f2- | tr -d '\r' | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
case "$RAW" in
  *%*) KEY="$RAW" ;;
  *)   KEY="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$RAW")" ;;
esac

route() { # $1=태그 $2=busRouteId $3=설명
  local url="http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?serviceKey=$KEY&busRouteId=$2&resultType=json"
  local f="$OUT/$1.txt"
  echo "<<< $1  ($3 / busRouteId=$2)"
  curl -sS --max-time 25 -o "$f" -w '  HTTP %{http_code}   %{size_download} bytes\n' "$url" || echo "  curl 실패"
  head -c 900 "$f"; echo
  echo ">>> $1"; echo
}

route h-seoul-route   100100089 "604번 (서울 면허)"
route i-gyeonggi-route 234001574 "9000-1성남 (경기 면허)"
route j-incheon-route  165000151 "1400인천 (인천 면허)"
