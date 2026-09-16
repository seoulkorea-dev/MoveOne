import { log } from "@/lib/logger";
import {
  TOPIS_BASE,
  describeTopis,
  tcoord,
  tnum,
  tstr,
  unwrapTopis,
  type TopisFailureKind,
  type TopisItem,
} from "./seoul-bus-contract";

/**
 * seoul-bus 엔진 — 서울시 TOPIS 버스 경로·노선 API.
 *
 * 응답 구조와 함정은 전부 seoul-bus-contract.ts 주석에 있습니다.
 * 이 파일은 "호출하고 타입을 붙이는" 일만 합니다.
 *
 * ODsay 와 다른 점:
 *   - 좌표로 묻는 것은 같지만, 구간별 소요시간·요금을 주지 않습니다
 *   - 경유 정류장이 응답에 없어 노선정보 API 를 한 번 더 부릅니다(lib/routing/bus-stops.ts)
 *   - 대신 호출 한도가 명시돼 있고(1일 1,000회) 수도권 전역이 됩니다
 *
 * 2026-09-16 실측 커버리지: 서울 내부 · 서울↔경기(판교) · 서울↔인천(부평) ·
 * 경기↔인천(판교→부평) 전부 경로를 돌려줍니다.
 */

export type BusSearchOp = "getPathInfoByBus" | "getPathInfoByBusNSub";

export type BusEngineErrorKind = TopisFailureKind | "no_key" | "http";

export class BusEngineError extends Error {
  constructor(
    message: string,
    readonly kind: BusEngineErrorKind,
    readonly code: string,
  ) {
    super(message);
    this.name = "BusEngineError";
  }
}

/**
 * 탑승 구간 한 칸.
 *
 * ★ 버스와 지하철이 **같은 모양**으로 옵니다. (2026-09-16 실측)
 *
 *   버스   { routeNm:"604",   routeId:"100100089", ..., railLinkList:null }
 *   지하철 { routeNm:"1호선", routeId:null,        ..., railLinkList:[...] }
 *
 * 구분 기준은 **routeId 가 null 인가** 입니다. 지하철은 노선ID 가 없고 대신
 * railLinkList 가 채워집니다. fid/tid 도 버스 정류소ID 가 아니라 지하철역
 * 코드(5자리)라, 노선정보 API(getStaionByRoute)로 조회하면 안 됩니다.
 *
 * 처음에는 railLinkList 가 있는 경로를 통째로 버렸습니다. 구조를 못 봤기
 * 때문인데, 그 결과 양주→광화문처럼 **지하철이 필수인 장거리 구간이 전부
 * 422** 가 됐습니다. 수도권 광역 이동에서는 지하철이 섞인 쪽이 오히려
 * 기본입니다. 표본이 서울 시내에 치우쳐 있어 놓친 판단이었습니다.
 */
export type BusRide = {
  /** "bus" 면 routeId 로 정류장을 조회합니다. "subway" 는 조회하지 않습니다. */
  kind: "bus" | "subway";
  /** 지하철은 null 입니다. */
  routeId: string | null;
  routeName: string;
  boardStationId: string;
  boardName: string;
  board: { lat: number; lng: number };
  alightStationId: string;
  alightName: string;
  alight: { lat: number; lng: number };
};

export type BusPath = {
  /** API 가 준 총 소요시간(분). 구간별로는 주지 않습니다. */
  totalTimeMin: number;
  /** API 가 준 총 거리(m). ★ 신뢰하지 않습니다 — 아래 rawDistanceM 주석 참고. */
  rawDistanceM: number | null;
  rides: BusRide[];
};

export type BusRouteStation = {
  seq: number;
  stationId: string;
  arsId: string | null;
  stationName: string;
  lat: number;
  lng: number;
};

const TIMEOUT_MS = 12_000;

/**
 * 공공데이터포털 인증키.
 *
 * 포털은 같은 키를 Encoding 형(%2B·%2F·%3D 포함)과 Decoding 형 두 가지로 보여줍니다.
 * 어느 쪽을 .env 에 넣어도 동작하도록 여기서 한 형태로 맞춥니다.
 * 이미 인코딩된 키를 한 번 더 인코딩하면 %2B 가 %252B 가 되어 401 이 납니다.
 */
function apiKey(): string {
  const raw = (process.env.DATA_GO_KR_SERVICE_KEY ?? "").trim();
  if (raw === "") {
    throw new BusEngineError(
      "공공데이터포털 인증키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않았습니다.",
      "no_key",
      "",
    );
  }

  const looksEncoded = /%2B|%2F|%3D/i.test(raw);
  let decoded = raw;
  if (looksEncoded) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // 디코딩이 안 되면 이미 평문이거나 형식이 다른 것입니다. 원본을 씁니다.
      decoded = raw;
    }
  }
  return encodeURIComponent(decoded);
}

async function callTopis(path: string, params: Record<string, string>): Promise<TopisItem[]> {
  const key = apiKey();
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  // serviceKey 는 이미 인코딩된 상태라 다시 encodeURIComponent 하지 않습니다.
  const url = `${TOPIS_BASE}/${path}?serviceKey=${key}&${qs}&resultType=json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, cache: "no-store" });
  } catch (cause) {
    throw new BusEngineError(
      `버스 API 호출에 실패했습니다: ${String(cause).slice(0, 120)}`,
      "http",
      "",
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // resultType 이 무시되고 XML 이 오는 경우를 여기서 잡습니다.
    throw new BusEngineError(
      `버스 API 응답을 해석할 수 없습니다: ${text.slice(0, 120)}`,
      "server",
      String(response.status),
    );
  }

  const unwrapped = unwrapTopis(json);
  const verdict = describeTopis(unwrapped);
  if (!verdict.ok) {
    throw new BusEngineError(verdict.hint, verdict.kind, unwrapped.code);
  }
  return unwrapped.items;
}

/**
 * pathList 한 칸 → BusRide. 좌표나 승·하차 지점 ID 가 깨진 칸만 버립니다.
 *
 * routeId 는 지하철에서 null 이므로 **필수 조건에서 뺐습니다.**
 * 여기에 null 검사를 두면 지하철 구간이 통째로 사라집니다.
 */
function toRide(raw: unknown): BusRide | null {
  const p = (raw ?? {}) as Record<string, unknown>;

  const routeId = tstr(p.routeId);
  const boardStationId = tstr(p.fid);
  const alightStationId = tstr(p.tid);
  const board = tcoord(p.fy, p.fx);
  const alight = tcoord(p.ty, p.tx);

  if (boardStationId === null || alightStationId === null) return null;
  if (board === null || alight === null) return null;

  const rail = p.railLinkList;
  const hasRail = Array.isArray(rail) && rail.length > 0;
  // 둘 다 같은 것을 가리키지만, 한쪽만 보면 API 가 형태를 조금 바꿨을 때 오판합니다.
  const kind: BusRide["kind"] = routeId === null || hasRail ? "subway" : "bus";

  return {
    kind,
    routeId,
    routeName: tstr(p.routeNm) ?? routeId ?? "",
    boardStationId,
    boardName: tstr(p.fname) ?? "",
    board,
    alightStationId,
    alightName: tstr(p.tname) ?? "",
    alight,
  };
}

/**
 * 경로 검색.
 *
 * 지하철이 섞인 경로도 그대로 받습니다. 버스 구간과 같은 모양으로 오기
 * 때문에(BusRide 주석 참고) 따로 다룰 것이 없습니다.
 *
 * ★ railLinkList 안쪽(중간역)은 아직 쓰지 않습니다.
 *   구조를 확인하지 못했습니다. 그래서 지하철 구간은 승차역~하차역 두 점만
 *   그립니다. 지도에서 그 구간만 직선이 되지만, **경로 안내 자체는
 *   정확합니다** — 몇 호선을 어디서 타고 어디서 내리는지가 다 있습니다.
 *   구조를 모르는 채 추측해 파싱하면 조용히 틀린 선이 그려집니다.
 */
export async function searchBusPaths(
  op: BusSearchOp,
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): Promise<{ paths: BusPath[]; elapsedMs: number; railLegs: number }> {
  const began = Date.now();

  const items = await callTopis(`pathinfo/${op}`, {
    startX: String(origin.lng),
    startY: String(origin.lat),
    endX: String(dest.lng),
    endY: String(dest.lat),
  });

  const paths: BusPath[] = [];
  let railLegs = 0;
  let sampled = false;

  for (const item of items) {
    const rawList = Array.isArray(item.pathList) ? item.pathList : [];

    const rides = rawList.map(toRide).filter((r): r is BusRide => r !== null);
    if (rides.length === 0) continue;

    railLegs += rides.filter((r) => r.kind === "subway").length;

    if (!sampled && rides.some((r) => r.kind === "subway")) {
      sampled = true;
      // railLinkList 구조를 확보하기 위한 표본입니다. 한 번만 남깁니다.
      // 중간역을 채우게 되면 이 로그는 지웁니다.
      const raw = rawList.find((x) => {
        const rl = (x as Record<string, unknown>).railLinkList;
        return Array.isArray(rl) && rl.length > 0;
      });
      log.debug("지하철 구간 표본 (railLinkList 는 아직 미사용)", {
        sample: JSON.stringify(raw ?? {}).slice(0, 700),
      });
    }

    const totalTimeMin = tnum(item.time);
    if (totalTimeMin === null || totalTimeMin <= 0) continue;

    paths.push({
      totalTimeMin,
      // API 의 distance 는 광역노선에서 크게 어긋납니다(서울역→판교 "4164").
      // 값은 들고만 있고 화면에는 쓰지 않습니다 — 어댑터에서 좌표로 계산합니다.
      rawDistanceM: tnum(item.distance),
      rides,
    });
  }

  return { paths, elapsedMs: Date.now() - began, railLegs };
}

export type BusRouteFetch = {
  stations: BusRouteStation[];
  routeName: string | null;
  routeType: number | null;
};

/** 노선별 경유 정류장. 호출 한도를 쓰므로 반드시 캐시를 거쳐 부르세요. */
export async function fetchRouteStations(routeId: string): Promise<BusRouteFetch> {
  const items = await callTopis("busRouteInfo/getStaionByRoute", { busRouteId: routeId });

  const stations: BusRouteStation[] = [];
  for (const item of items) {
    const seq = tnum(item.seq);
    const stationId = tstr(item.station);
    const point = tcoord(item.gpsY, item.gpsX);
    if (seq === null || stationId === null || point === null) continue;

    stations.push({
      seq,
      stationId,
      arsId: tstr(item.arsId),
      stationName: tstr(item.stationNm) ?? "",
      lat: point.lat,
      lng: point.lng,
    });
  }

  stations.sort((a, b) => a.seq - b.seq);

  const first = items[0];
  return {
    stations,
    routeName: first ? tstr(first.busRouteNm) : null,
    routeType: first ? tnum(first.routeType) : null,
  };
}
