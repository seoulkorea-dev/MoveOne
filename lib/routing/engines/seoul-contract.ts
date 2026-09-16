/**
 * ====================================================================
 * 서울교통공사 최단경로 API 응답 계약.
 * 2026-09-15 실제 응답으로 검증함 (번들 29의 추정은 전부 틀렸었다).
 * ====================================================================
 *
 * 호출:
 *   http://openapi.seoul.go.kr:8088
 *     /{KEY}/{TYPE}/getShtrmPath/{START_INDEX}/{END_INDEX}
 *     /{출발역명}/{도착역명}/{검색일시}[/{searchType}]
 *
 * 응답 봉투 — 열린데이터광장 공통형식(RESULT.CODE/row)이 아니다:
 *   {
 *     "header": { "resultCode": "00", "resultMsg": "성공" },
 *     "body": {
 *       "searchType": "duration",
 *       "totalDstc": 9990,        // m
 *       "totalReqHr": 1670,       // 초
 *       "totalCardCrg": 1550,     // 원
 *       "trsitNmtm": 2,           // 환승 횟수
 *       "trfstnNms": [ { stnNm, dptreLineNm, arvlLineNm } ],
 *       "exclTrfstns": [], "thrghStns": [], "schInclYn": "Y",
 *       "paths": [ {
 *         "dptreStn": { stnCd, stnNo, stnNm, lineNm, brlnNm },
 *         "arvlStn":  { stnCd, stnNo, stnNm, lineNm, brlnNm },
 *         stnSctnDstc, reqHr, wtngHr,
 *         tmnlStnNm, tmnlStnCd, upbdnbSe,
 *         trainno, trainDptreTm, trainArvlTm,
 *         trsitYn, etrnYn, nonstopYn
 *       } ]
 *     }
 *   }
 *
 * ★ paths 는 역 목록이 아니라 "역과 역 사이 구간" 배열이다.
 * ★ 환승역은 구간이 아니라 body.trfstnNms 배열에 따로 온다.
 *
 * ★★ 가장 중요한 함정:
 *    경로를 못 찾아도 resultCode 는 "00"(성공)이고, body 의 숫자가 전부 0,
 *    paths 가 빈 배열로 온다. 실제 사례: 서울→인천.
 *    그래서 코드만 보고 성공 판정하면 화면에 빈 결과가 뜬다.
 */

export const SEOUL_BASE = "http://openapi.seoul.go.kr:8088"
export const SEOUL_SERVICE = "getShtrmPath"

export type SeoulRawStation = {
  stnCd?: unknown
  stnNo?: unknown
  stnNm?: unknown
  lineNm?: unknown
  brlnNm?: unknown
}

export type SeoulRawPath = {
  dptreStn?: SeoulRawStation
  arvlStn?: SeoulRawStation
  [k: string]: unknown
}

export type SeoulRawBody = {
  searchType?: unknown
  totalDstc?: unknown
  totalReqHr?: unknown
  totalCardCrg?: unknown
  trsitNmtm?: unknown
  trfstnNms?: Array<Record<string, unknown>>
  paths?: SeoulRawPath[]
  [k: string]: unknown
}

export type Unwrapped = {
  code: string
  message: string
  body: SeoulRawBody
}

/** header/body 봉투를 벗긴다. 봉투가 없는 응답도 최대한 견딘다. */
export function unwrap(json: unknown): Unwrapped {
  const obj = (json ?? {}) as Record<string, unknown>
  const header = (obj.header ?? {}) as Record<string, unknown>
  const body = (obj.body ?? {}) as SeoulRawBody

  // 봉투 없이 곧바로 body 만 오는 변형에 대비.
  const hasEnvelope = "header" in obj || "body" in obj
  return {
    code: String(header.resultCode ?? obj.resultCode ?? (hasEnvelope ? "" : "00")),
    message: String(header.resultMsg ?? obj.resultMsg ?? ""),
    body: hasEnvelope ? body : (obj as SeoulRawBody),
  }
}

export type ResultKind =
  | "ok"
  /** 경로 없음. code 00 인데 paths 가 빈 경우도 포함됩니다. */
  | "no_data"
  /**
   * 그런 역명이 없음 (code 10).
   * 실측 메시지: "출발역명 또는 도착역명이 존재하지 않습니다."
   * 어느 쪽이 틀렸는지는 알려주지 않으므로, 호출한 쪽에서 후보를 바꿔 다시 물어야 합니다.
   */
  | "unknown_station"
  | "bad_key"
  | "bad_param"
  | "quota"
  | "server"
  | "unknown"

/**
 * 성공 판정. code 와 body 를 함께 본다.
 * code 가 "00" 이어도 paths 가 비면 no_data 다 — 이 API 의 정상적인 "경로 없음" 표현.
 */
export type ResultFailureKind = Exclude<ResultKind, "ok">

/** ok 여부로 갈리는 판별 유니온이라, 호출한 쪽에서 !ok 분기에 들어가면 kind 가 실패 종류로 좁혀진다. */
export type ResultVerdict =
  | { ok: true; kind: "ok"; hint: "" }
  | { ok: false; kind: ResultFailureKind; hint: string }

export function describeResult(u: Unwrapped): ResultVerdict {
  const code = u.code
  if (code === "00" || code === "0" || code === "") {
    const paths = Array.isArray(u.body.paths) ? u.body.paths : []
    if (paths.length === 0) {
      return {
        ok: false,
        kind: "no_data",
        hint: "경로를 찾지 못했습니다. 역명이 정확한지, 이 API가 다루는 노선인지 확인하세요.",
      }
    }
    return { ok: true, kind: "ok", hint: "" }
  }
  // data.go.kr 계열 공통 코드. 문서에 없는 코드는 resultMsg 를 그대로 보여준다.
  switch (code) {
    case "01":
    case "20":
    case "30":
      return { ok: false, kind: "bad_key", hint: "인증키를 확인하세요." }
    case "10":
      // 2026-09-16 실측: "사당역" 처럼 없는 역명을 주면 이 코드가 옵니다.
      // 메시지: "출발역명 또는 도착역명이 존재하지 않습니다."
      // 서버 오류가 아니라 이름 문제이므로, 호출한 쪽에서 다른 후보로 다시 물어야 합니다.
      // 어느 쪽 역이 틀렸는지는 알려주지 않습니다.
      return {
        ok: false,
        kind: "unknown_station",
        hint: "그 역명을 찾지 못했습니다. 다른 표기로 다시 시도해 보세요.",
      }
    case "11":
    case "12":
      return { ok: false, kind: "bad_param", hint: "요청 파라미터를 확인하세요." }
    case "22":
      return { ok: false, kind: "quota", hint: "호출 한도를 초과했습니다." }
    case "02":
    case "04":
    case "05":
      return { ok: false, kind: "server", hint: "제공처 서버 오류입니다." }
    default:
      return { ok: false, kind: "unknown", hint: u.message || `알 수 없는 코드: ${code}` }
  }
}

export function str(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === "" || s === "null" ? null : s
}

export function num(v: unknown): number | null {
  const s = str(v)
  if (s === null) return null
  const n = Number(s.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

export function isY(v: unknown): boolean {
  const s = str(v)
  return s === "Y" || s === "y"
}
