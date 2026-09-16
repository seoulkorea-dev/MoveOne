import { log } from "@/lib/logger";
import { coordsMapForStationNames } from "@/lib/routing/stations";
import {
  SEOUL_BASE,
  SEOUL_SERVICE,
  describeResult,
  isY,
  num,
  str,
  unwrap,
  type ResultFailureKind,
  type SeoulRawPath,
  type SeoulRawStation,
} from "./seoul-contract";

/**
 * seoul 엔진 — 서울교통공사 지하철역 최단경로이동정보 (서울 열린데이터광장).
 *
 * 2026-09-15 실측 커버리지: 서울 1~8호선에 더해 수인분당선·경의선·공항철도·
 * 신분당선까지 탐색됩니다. 이름과 달리 서울교통공사 노선 전용이 아닙니다.
 * 다만 모든 구간이 되는 것은 아니어서(서울역→인천은 빈 경로), 경로 없음
 * 처리가 중요합니다. seoul-contract.ts 의 주석을 함께 보세요.
 *
 * ODsay 엔진과 다른 점:
 *   - 좌표가 아니라 한글 역명으로 호출합니다
 *   - 노선 그래픽(loadLane)이 없어 폴리라인은 정차역을 이은 선입니다
 *   - 대신 요금·급행·무정차·열차번호·절대시각을 줍니다
 */

export type SeoulSearchType = "duration" | "distance" | "transfer";

export type SeoulStationRef = {
  stationName: string;
  stationCode: string | null;
  stationNo: string | null;
  lineName: string | null;
  branchLineName: string | null;
};

/** paths[] 한 칸 = 이웃한 두 역 사이 구간 */
export type SeoulSegment = {
  order: number;
  from: SeoulStationRef;
  to: SeoulStationRef;
  distanceM: number | null;
  travelSec: number | null;
  waitSec: number | null;
  terminalStationName: string | null;
  terminalStationCode: string | null;
  upDown: string | null;
  trainNo: string | null;
  departAt: string | null;
  arriveAt: string | null;
  isTransfer: boolean;
  isExpress: boolean;
  isNonstop: boolean;
};

/** 폴리라인과 상세 타임라인이 함께 쓰는 정차역. lib/routes 의 RouteStop 과 같은 모양입니다. */
export type SeoulStop = {
  name: string;
  lat: number;
  lng: number;
};

/** 같은 노선을 연속으로 타는 구간들을 하나로 묶은 것 — 화면 표시 단위 */
export type SeoulLeg = {
  order: number;
  lineName: string | null;
  boardStation: string;
  alightStation: string;
  /** 정거장 수 (구간 개수) */
  stops: number;
  distanceM: number;
  travelSec: number;
  waitSec: number;
  trainNo: string | null;
  departAt: string | null;
  arriveAt: string | null;
  terminalStationName: string | null;
  upDown: string | null;
  isExpress: boolean;
  /** 승차역부터 하차역까지, 좌표를 찾은 역만. 지도 폴리라인의 원천입니다. */
  stopList: SeoulStop[];
  /** stopList 의 좌표만 [위도, 경도] 로. 카카오맵에 그대로 넣을 수 있습니다. */
  path: Array<[number, number]>;
};

export type SeoulTransfer = {
  stationName: string;
  fromLine: string | null;
  toLine: string | null;
};

export type SeoulRoute = {
  engine: "seoul";
  searchType: SeoulSearchType;
  departureStation: string;
  arrivalStation: string;
  totalDistanceM: number | null;
  totalSec: number | null;
  totalFareCard: number | null;
  transferCount: number | null;
  transfers: SeoulTransfer[];
  segments: SeoulSegment[];
  legs: SeoulLeg[];
  /** 출발역부터 도착역까지 역 이름 순서 */
  stationSequence: string[];
  /** 전체 폴리라인. [위도, 경도] */
  path: Array<[number, number]>;
  /** 실제 선형이 아니라 역을 직선으로 이은 근사입니다. 화면에 표시할 것. */
  pathIsApproximate: true;
  /** 역 마스터에 좌표가 없어 폴리라인에서 빠진 역. 비어 있어야 정상입니다. */
  missingCoordStations: string[];
};

export type SeoulErrorKind = ResultFailureKind | "no_key" | "http";

export class SeoulEngineError extends Error {
  constructor(
    message: string,
    readonly kind: SeoulErrorKind,
    readonly code: string,
  ) {
    super(message);
    this.name = "SeoulEngineError";
  }
}

function apiKey(): string {
  const k = process.env.SEOUL_OPENAPI_KEY || process.env.SEOUL_OPEN_API_KEY || "";
  if (!k) {
    throw new SeoulEngineError(
      "열린데이터광장 일반 인증키(SEOUL_OPENAPI_KEY)가 설정되지 않았습니다.",
      "no_key",
      "",
    );
  }
  return k;
}

/** yyyy-MM-dd HH:mm:ss (KST) */
export function formatSearchDt(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ` +
    `${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:${p(kst.getUTCSeconds())}`
  );
}

/**
 * 경로 세그먼트 인코딩.
 * encodeURIComponent 는 ( ) ! ' * 를 그대로 둡니다. "총신대입구(이수)" 처럼
 * 괄호가 든 역명이 있어 경로에 원문자가 남지 않도록 직접 인코딩합니다.
 */
export function encodeSegment(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function buildUrl(opts: {
  key: string;
  departure: string;
  arrival: string;
  searchDt: string;
  searchType?: SeoulSearchType;
  start?: number;
  end?: number;
}): string {
  const parts = [
    opts.key,
    "json",
    SEOUL_SERVICE,
    String(opts.start ?? 1),
    String(opts.end ?? 200),
    encodeSegment(opts.departure),
    encodeSegment(opts.arrival),
    encodeSegment(opts.searchDt),
  ];
  // 선택 파라미터는 순서대로 이어붙습니다. searchType 이 첫 번째라 단독 추가가 됩니다.
  if (opts.searchType) parts.push(encodeSegment(opts.searchType));
  return `${SEOUL_BASE}/${parts.join("/")}`;
}

function toStationRef(raw: SeoulRawStation | undefined): SeoulStationRef {
  return {
    stationName: str(raw?.stnNm) ?? "",
    stationCode: str(raw?.stnCd),
    stationNo: str(raw?.stnNo),
    lineName: str(raw?.lineNm),
    branchLineName: str(raw?.brlnNm),
  };
}

function toSegment(p: SeoulRawPath, order: number): SeoulSegment {
  return {
    order,
    from: toStationRef(p.dptreStn),
    to: toStationRef(p.arvlStn),
    distanceM: num(p.stnSctnDstc),
    travelSec: num(p.reqHr),
    waitSec: num(p.wtngHr),
    terminalStationName: str(p.tmnlStnNm),
    terminalStationCode: str(p.tmnlStnCd),
    upDown: str(p.upbdnbSe),
    trainNo: str(p.trainno) ?? str(p.trainNo),
    departAt: str(p.trainDptreTm),
    arriveAt: str(p.trainArvlTm),
    isTransfer: isY(p.trsitYn),
    isExpress: isY(p.etrnYn),
    isNonstop: isY(p.nonstopYn),
  };
}

/** 구간의 노선. 출발역 기준이되 없으면 도착역 기준. */
function segmentLine(s: SeoulSegment): string | null {
  return s.from.lineName ?? s.to.lineName;
}

/** 연속된 같은 노선 구간을 하나의 leg 로 묶습니다. */
function groupIntoLegs(
  segments: SeoulSegment[],
  coords: Map<string, [number, number]>,
): SeoulLeg[] {
  const legs: SeoulLeg[] = [];
  let current: SeoulSegment[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];

    const names = [first.from.stationName, ...current.map((s) => s.to.stationName)];
    const stopList: SeoulStop[] = [];
    for (const name of names) {
      const c = coords.get(name);
      if (c) stopList.push({ name, lat: c[0], lng: c[1] });
    }

    legs.push({
      order: legs.length,
      lineName: segmentLine(first),
      boardStation: first.from.stationName,
      alightStation: last.to.stationName,
      stops: current.length,
      distanceM: current.reduce((a, s) => a + (s.distanceM ?? 0), 0),
      travelSec: current.reduce((a, s) => a + (s.travelSec ?? 0), 0),
      waitSec: current.reduce((a, s) => a + (s.waitSec ?? 0), 0),
      trainNo: first.trainNo,
      departAt: first.departAt,
      arriveAt: last.arriveAt,
      terminalStationName: first.terminalStationName,
      upDown: first.upDown,
      isExpress: current.some((s) => s.isExpress),
      stopList,
      path: stopList.map((s): [number, number] => [s.lat, s.lng]),
    });
    current = [];
  };

  for (const s of segments) {
    if (current.length > 0 && segmentLine(current[current.length - 1]) !== segmentLine(s)) flush();
    current.push(s);
  }
  flush();
  return legs;
}

/** 경로 1건 조회. 응답 원본이 필요하면 raw 를 함께 받습니다. */
export async function searchSeoulPath(opts: {
  departure: string;
  arrival: string;
  searchType?: SeoulSearchType;
  searchDt?: string;
  signal?: AbortSignal;
}): Promise<{ route: SeoulRoute; raw: unknown; elapsedMs: number }> {
  const key = apiKey();
  const searchDt = opts.searchDt ?? formatSearchDt();
  const searchType = opts.searchType ?? "duration";
  const url = buildUrl({
    key,
    departure: opts.departure,
    arrival: opts.arrival,
    searchDt,
    searchType,
  });

  log.debug("seoul 엔진 요청", {
    departure: opts.departure,
    arrival: opts.arrival,
    searchType,
    searchDt,
  });

  const began = Date.now();
  const res = await fetch(url, { signal: opts.signal, cache: "no-store" });
  const elapsedMs = Date.now() - began;

  if (!res.ok) throw new SeoulEngineError(`HTTP ${res.status}`, "http", String(res.status));

  const json = (await res.json()) as unknown;
  const u = unwrap(json);
  const verdict = describeResult(u);

  if (!verdict.ok) {
    log.debug("seoul 엔진 결과 없음", {
      code: u.code,
      message: u.message,
      kind: verdict.kind,
      departure: opts.departure,
      arrival: opts.arrival,
      searchType,
    });
    // 경로 없음일 때 resultMsg 는 "성공" 입니다(코드가 00 이므로).
    // 그대로 쓰면 로그에 "SeoulEngineError: 성공" 이 남아 원인을 가립니다.
    const reason = verdict.kind === "no_data" ? verdict.hint : u.message || verdict.hint;
    throw new SeoulEngineError(reason, verdict.kind, u.code);
  }

  const body = u.body;
  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  const segments = rawPaths.map((p, i) => toSegment(p, i));

  const stationSequence = [
    segments[0]?.from.stationName ?? opts.departure,
    ...segments.map((s) => s.to.stationName),
  ].filter(Boolean);

  const coords = await coordsMapForStationNames(stationSequence);
  const missingCoordStations = [...new Set(stationSequence.filter((n) => !coords.has(n)))];

  const legs = groupIntoLegs(segments, coords);

  const path: Array<[number, number]> = [];
  for (const n of stationSequence) {
    const c = coords.get(n);
    if (c) path.push(c);
  }

  const transfers: SeoulTransfer[] = (Array.isArray(body.trfstnNms) ? body.trfstnNms : []).map(
    (t) => ({
      stationName: str(t.stnNm) ?? "",
      fromLine: str(t.dptreLineNm),
      toLine: str(t.arvlLineNm),
    }),
  );

  if (missingCoordStations.length > 0) {
    log.debug("역 마스터에 좌표가 없는 역", {
      count: missingCoordStations.length,
      stations: missingCoordStations.slice(0, 10),
    });
  }

  const route: SeoulRoute = {
    engine: "seoul",
    searchType,
    departureStation: opts.departure,
    arrivalStation: opts.arrival,
    totalDistanceM: num(body.totalDstc),
    totalSec: num(body.totalReqHr),
    totalFareCard: num(body.totalCardCrg),
    transferCount: num(body.trsitNmtm),
    transfers,
    segments,
    legs,
    stationSequence,
    path,
    pathIsApproximate: true,
    missingCoordStations,
  };
  return { route, raw: json, elapsedMs };
}

/** 후보를 바꿔 다시 물어볼 만한 실패인지. 그 외(인증키·한도·장애)는 바꿔도 같습니다. */
function worthAnotherName(kind: SeoulErrorKind): boolean {
  return kind === "no_data" || kind === "unknown_station";
}

export type NamePair = { departure: string; arrival: string };

/**
 * 역명 후보를 순서대로 시험해 통하는 짝을 찾습니다.
 *
 * 왜 필요한가 — 2026-09-16 실측:
 *   "서울"   → code 00 인데 paths 가 빔 (오류 없이 조용히 실패)
 *   "서울역" → 성공
 *   "사당"   → 성공
 *   "사당역" → code 10 "출발역명 또는 도착역명이 존재하지 않습니다"
 *
 * 두 실패가 코드부터 다르고, 어느 쪽 역이 틀렸는지도 알려주지 않습니다.
 * 그래서 짝 단위로 시험합니다.
 *
 * 호출을 아끼려고 **duration 하나로만** 시험하고, 통하는 짝을 찾은 뒤에
 * 나머지 검색유형을 부릅니다. 후보 색인의 합이 작은 순서로 도니
 * "가장 그럴듯한 조합"부터 시도합니다.
 */
export async function findWorkingNamePair(opts: {
  departureCandidates: string[];
  arrivalCandidates: string[];
  searchDt?: string;
  signal?: AbortSignal;
  /** 시도 상한. 호출 낭비를 막습니다. */
  maxAttempts?: number;
}): Promise<{ pair: NamePair; attempts: number }> {
  const deps = opts.departureCandidates.filter(Boolean);
  const arrs = opts.arrivalCandidates.filter(Boolean);
  if (deps.length === 0 || arrs.length === 0) {
    throw new SeoulEngineError("시도할 역명이 없습니다.", "unknown_station", "");
  }

  const pairs: NamePair[] = [];
  for (let sum = 0; sum <= deps.length + arrs.length - 2; sum++) {
    for (let i = 0; i < deps.length; i++) {
      const j = sum - i;
      if (j >= 0 && j < arrs.length) pairs.push({ departure: deps[i], arrival: arrs[j] });
    }
  }

  const limit = opts.maxAttempts ?? 6;
  let attempts = 0;
  let lastError: unknown = null;

  for (const pair of pairs) {
    if (attempts >= limit) break;
    attempts++;
    try {
      await searchSeoulPath({ ...pair, searchType: "duration", searchDt: opts.searchDt, signal: opts.signal });
      if (attempts > 1) {
        log.info("역명 후보 교체로 경로를 찾았습니다", { pair, attempts });
      }
      return { pair, attempts };
    } catch (cause) {
      lastError = cause;
      if (!(cause instanceof SeoulEngineError) || !worthAnotherName(cause.kind)) throw cause;
      log.debug("역명 후보 실패 — 다음 후보", { pair, kind: cause.kind });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new SeoulEngineError("경로를 찾지 못했습니다.", "no_data", "00");
}

/** 최소시간·최단거리·최소환승 3건을 동시에 조회해 대안 경로로 돌려줍니다. */
export async function searchSeoulAlternatives(opts: {
  departure: string;
  arrival: string;
  searchDt?: string;
  signal?: AbortSignal;
}): Promise<{ routes: SeoulRoute[]; elapsedMs: number }> {
  const types: SeoulSearchType[] = ["duration", "distance", "transfer"];
  const began = Date.now();
  const settled = await Promise.allSettled(
    types.map((t) => searchSeoulPath({ ...opts, searchType: t })),
  );
  const elapsedMs = Date.now() - began;

  const routes: SeoulRoute[] = [];
  for (const [i, s] of settled.entries()) {
    if (s.status === "fulfilled") routes.push(s.value.route);
    else log.debug("대안 경로 실패", { searchType: types[i], error: String(s.reason).slice(0, 160) });
  }

  if (routes.length === 0) {
    const rejected = settled.find((s) => s.status === "rejected");
    if (rejected && rejected.status === "rejected") throw rejected.reason;
    throw new SeoulEngineError("경로를 찾지 못했습니다.", "no_data", "00");
  }

  // 역 순서가 같으면 같은 경로로 봅니다.
  const seen = new Set<string>();
  const unique = routes.filter((r) => {
    const sig = r.stationSequence.join(">");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  return { routes: unique, elapsedMs };
}
