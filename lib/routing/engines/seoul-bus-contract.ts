/**
 * ====================================================================
 * 서울시 TOPIS 버스 API 응답 계약.
 * 2026-09-16 실제 응답으로 검증함. 추정으로 쓴 필드는 하나도 없습니다.
 * ====================================================================
 *
 * 두 서비스를 씁니다. 호스트는 같고 경로만 다릅니다.
 *
 *   ① 대중교통환승경로 (data.go.kr 15000414)
 *      http://ws.bus.go.kr/api/rest/pathinfo/getPathInfoByBus
 *      http://ws.bus.go.kr/api/rest/pathinfo/getPathInfoByBusNSub
 *      파라미터: serviceKey, startX, startY, endX, endY, resultType=json
 *      좌표계: WGS84 십진도. X=경도, Y=위도. (뒤집으면 응답이 깨집니다)
 *
 *   ② 노선정보조회 (data.go.kr 15000193)
 *      http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute
 *      파라미터: serviceKey, busRouteId, resultType=json
 *
 * 응답 봉투 (둘 다 같음):
 *   {
 *     "comMsgHeader": { ... 전부 null ... },
 *     "msgHeader": { "headerMsg": "...", "headerCd": "0", "itemCount": 0 },
 *     "msgBody":   { "itemList": [ ... ] }
 *   }
 *
 * ★ itemCount 는 실제 개수와 무관하게 0 으로 옵니다. itemList.length 를 쓰세요.
 * ★ 모든 값이 문자열입니다. "39", "126.97271108072482" 처럼 옵니다.
 *
 * ① 환승경로 itemList[i]
 *     time     "39"     분
 *     distance "8013"   m — ★ 못 믿습니다. 서울역→판교가 "4164" 로 옵니다(실제 약 20km).
 *                          거리는 정류장 좌표로 직접 계산합니다.
 *     pathList [ ... ]  탑승 구간. 한 칸이 "버스 한 번 타기".
 *        routeNm  "9000-1성남"   routeId "234001574"
 *        fname/fid/fx/fy         승차 정류소 이름·ID·경도·위도
 *        tname/tid/tx/ty         하차 정류소
 *        railLinkList            지하철 구간의 링크 목록. 버스 구간은 null 입니다.
 *
 *     ★ 지하철 구간도 같은 pathList 안에 **같은 모양**으로 옵니다. (2026-09-16 실측)
 *         { "routeNm":"1호선", "routeId":null,
 *           "fname":"주내역","fid":"19090","fx":"127.0447","fy":"37.7741",
 *           "tname":"종각역","tid":"01520","tx":"126.9831","ty":"37.5701",
 *           "railLinkList":[ ... ] }
 *       구분 기준은 routeId 가 null 인가 입니다. fid/tid 도 버스 정류소ID 가
 *       아니라 지하철역 코드(5자리)라, 노선정보 API 로 조회하면 안 됩니다.
 *     ★ 구간별 소요시간은 주지 않습니다. 총 time 하나뿐입니다.
 *     ★ 요금 필드가 없습니다.
 *
 * ② 노선 정류장 itemList[i]
 *     busRouteId · busRouteNm · seq("1","2",…) · station(정류소 고유ID)
 *     arsId · stationNm · gpsX(경도) · gpsY(위도) · routeType · direction
 *     ★ station 값이 ①의 fid/tid 와 같은 체계입니다.
 *       근거: 9000-1(234001574)의 trnstnid 가 101000005 이고,
 *             ① 응답의 fid 101000005 = 서울역버스환승센터 로 일치.
 *       2026-09-16 대조 결과 25건 전건 매칭.
 *
 * headerCd 실측값
 *     "0"  정상
 *     "4"  경로가 존재하지 않습니다  ← 오류가 아니라 "없음"
 *
 * 게이트웨이 오류는 봉투 자체가 다릅니다. msgHeader 가 없습니다.
 *     {"error":"Unauthorized","message":"...등록되지 않은 서비스키","status":401}
 *     {"error":"Internal Server Error","message":"PUBC 인증 처리 중 오류...","status":500}
 *   401 은 키가 틀린 게 아니라 **그 서비스에 활용신청이 안 된** 상태입니다.
 */

export const TOPIS_BASE = "http://ws.bus.go.kr/api/rest";

export type TopisItem = Record<string, unknown>;

export type TopisUnwrapped = {
  /** msgHeader.headerCd. 게이트웨이 오류면 HTTP 상태를 문자열로 넣습니다. */
  code: string;
  message: string;
  items: TopisItem[];
  /** 봉투가 msgHeader/msgBody 형태였는지. 아니면 게이트웨이 오류 응답입니다. */
  envelope: boolean;
};

export function unwrapTopis(json: unknown): TopisUnwrapped {
  const obj = (json ?? {}) as Record<string, unknown>;

  // 게이트웨이 오류: {"error":..., "message":..., "status":401}
  if (typeof obj.status === "number" && typeof obj.error === "string") {
    return {
      code: String(obj.status),
      message: String(obj.message ?? obj.error),
      items: [],
      envelope: false,
    };
  }

  const header = (obj.msgHeader ?? {}) as Record<string, unknown>;
  const body = (obj.msgBody ?? {}) as Record<string, unknown>;
  const list = body.itemList;

  return {
    code: String(header.headerCd ?? ""),
    message: String(header.headerMsg ?? ""),
    items: Array.isArray(list) ? (list as TopisItem[]) : [],
    envelope: "msgHeader" in obj || "msgBody" in obj,
  };
}

export type TopisFailureKind =
  /** 경로·노선이 없음. headerCd 4, 또는 정상 코드인데 목록이 빈 경우 */
  | "no_data"
  /** 인증키 또는 활용신청 문제 (HTTP 401) */
  | "bad_key"
  | "bad_param"
  | "quota"
  | "server"
  | "unknown";

export type TopisVerdict =
  | { ok: true; kind: "ok"; hint: "" }
  | { ok: false; kind: TopisFailureKind; hint: string };

export function describeTopis(u: TopisUnwrapped): TopisVerdict {
  // 게이트웨이 오류 — msgHeader 가 없었던 경우
  if (!u.envelope) {
    switch (u.code) {
      case "401":
      case "403":
        return {
          ok: false,
          kind: "bad_key",
          hint:
            "이 서비스에 활용신청이 되어 있는지 확인하세요. " +
            "키가 맞아도 서비스별로 따로 신청해야 합니다.",
        };
      case "429":
        return { ok: false, kind: "quota", hint: "호출 한도를 초과했습니다." };
      default:
        return {
          ok: false,
          kind: "server",
          hint: u.message || `게이트웨이 오류 ${u.code}`,
        };
    }
  }

  switch (u.code) {
    case "0":
    case "00":
      // 정상 코드인데 목록이 비는 경우가 있습니다. 성공으로 보면 화면이 빕니다.
      if (u.items.length === 0) {
        return { ok: false, kind: "no_data", hint: "결과가 없습니다." };
      }
      return { ok: true, kind: "ok", hint: "" };
    case "4":
      // 2026-09-16 실측: getPathInfoBySubway 서울역→강남역이 이 코드였습니다.
      return { ok: false, kind: "no_data", hint: u.message || "경로가 존재하지 않습니다." };
    case "1":
    case "2":
      return { ok: false, kind: "bad_param", hint: u.message || "요청 파라미터를 확인하세요." };
    case "8":
      return { ok: false, kind: "quota", hint: u.message || "호출 한도를 초과했습니다." };
    default:
      return {
        ok: false,
        kind: "unknown",
        hint: u.message || `알 수 없는 코드: ${u.code}`,
      };
  }
}

/** 문자열 값. 빈 값·"null"·":" 는 없는 것으로 봅니다(beginTm 이 ":" 로 옵니다). */
export function tstr(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" || s === "null" || s === ":" ? null : s;
}

/** 숫자 값. 응답이 전부 문자열이라 반드시 거쳐야 합니다. */
export function tnum(v: unknown): number | null {
  const s = tstr(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 좌표 한 개.
 *
 * Number("") 가 NaN 이 아니라 0 이라는 함정은 여기서도 같습니다
 * (lib/odsay/normalize.ts 의 coordNum 주석 참고). (0,0) 은 기니만 앞바다라
 * 수도권 서비스에서는 어떤 경우에도 정상값이 아닙니다.
 */
export function tcoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const y = tnum(lat);
  const x = tnum(lng);
  if (y === null || x === null) return null;
  if (y < 30 || y > 45 || x < 120 || x > 135) return null;
  return { lat: y, lng: x };
}
