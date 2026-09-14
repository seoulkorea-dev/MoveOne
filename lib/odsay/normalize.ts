import type { LanePath, RouteSegment, RouteStop, SegmentType, TransitRoute } from "@/lib/routes";
import {
  ODSAY_TRAFFIC_TYPE,
  type OdsayLoadLaneResponse,
  type OdsayPath,
  type OdsaySubPath,
} from "./types";

/**
 * ODsay 원본 → MoveOne 도메인 타입.
 *
 * 이 파일이 MoveOne의 완충 지대입니다. ODsay가 바뀌면 여기만 고칩니다.
 * 원칙: 어떤 필드가 없어도 절대 예외를 던지지 않습니다.
 * 외부 API는 언제든 예상과 다른 것을 보냅니다.
 */

function toSegmentType(trafficType: number | undefined): SegmentType {
  switch (trafficType) {
    case ODSAY_TRAFFIC_TYPE.SUBWAY:
      return "subway";
    case ODSAY_TRAFFIC_TYPE.BUS:
      return "bus";
    case ODSAY_TRAFFIC_TYPE.WALK:
    default:
      return "walk";
  }
}

/** 지하철은 lane[].name, 버스는 lane[].busNo 에 들어옵니다. */
function toLaneName(sub: OdsaySubPath): string | undefined {
  const lane = sub.lane?.[0];
  if (!lane) return undefined;
  return lane.name ?? lane.busNo ?? undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * 소요시간·거리·정거장 수처럼 **음수가 될 수 없는** 값.
 *
 * ODsay 는 "모름" 을 -1 로 표현합니다 (실제 응답의 totalWalkTime: -1).
 * 그대로 두면 화면에 "-1분" 이 찍히고 진행 바 계산도 어긋납니다.
 * 0 은 정상값이라(환승 0회, 도보 0m) 음수만 걸러냅니다.
 */
function nonNegative(value: unknown): number | undefined {
  const parsed = num(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

/**
 * 좌표 하나를 숫자로. ODsay 는 정류장·선형 좌표를 문자열로 주기도 합니다.
 *
 * Number("") 가 NaN 이 아니라 **0** 이라는 점이 함정입니다. 빈 문자열을
 * 그냥 Number() 에 넣으면 (0, 0) — 기니만 앞바다 — 이 유효한 좌표로
 * 살아남아, 지도에 한국에서 아프리카까지 선이 그려집니다.
 */
function coordNum(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (trimmed === "") return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 위도·경도 쌍. 범위를 벗어나거나 (0, 0) 이면 버립니다.
 * 수도권 서비스에서 (0, 0) 은 어떤 경우에도 정상 값이 아닙니다.
 */
function toPoint(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const y = coordNum(lat);
  const x = coordNum(lng);
  if (y === undefined || x === undefined) return null;
  if (y < -90 || y > 90 || x < -180 || x > 180) return null;
  if (y === 0 && x === 0) return null;
  return { lat: y, lng: x };
}

/** 구간의 승·하차 지점. 같은 검증을 거칩니다. */
function coord(lat: unknown, lng: unknown) {
  return toPoint(lat, lng) ?? undefined;
}

/**
 * 정차역 좌표.
 * ODsay 는 정차역 x/y 를 **문자열**로 줍니다 ("127.027621"). 위 num() 은
 * 숫자만 받으므로 여기서 따로 변환합니다. 변환에 실패한 역은 버립니다 —
 * 좌표가 깨진 역 하나 때문에 폴리라인이 엉뚱한 곳으로 튀는 편이 더 나쁩니다.
 */
function toStops(sub: OdsaySubPath): RouteStop[] | undefined {
  const stations = sub.passStopList?.stations;
  if (!Array.isArray(stations) || stations.length === 0) return undefined;

  const stops = stations
    .map((station): RouteStop | null => {
      const point = toPoint(station.y, station.x);
      return point ? { name: station.stationName, ...point } : null;
    })
    .filter((stop): stop is RouteStop => stop !== null);

  return stops.length > 0 ? stops : undefined;
}

export function normalizeSegment(sub: OdsaySubPath, index: number): RouteSegment {
  const type = toSegmentType(sub.trafficType);

  return {
    index,
    type,
    laneName: toLaneName(sub),
    startName: sub.startName,
    endName: sub.endName,
    start: coord(sub.startY, sub.startX),
    end: coord(sub.endY, sub.endX),
    durationMin: nonNegative(sub.sectionTime),
    distanceM: nonNegative(sub.distance),
    stationCount: nonNegative(sub.stationCount),
    stops: toStops(sub),
    // 숫자 ID를 문자열로 보관합니다. 기관마다 ID 형식이 달라
    // (공공데이터포털은 영문이 섞입니다) 문자열이 안전합니다.
    odsayStartStationId: sub.startID !== undefined ? String(sub.startID) : undefined,
    odsayEndStationId: sub.endID !== undefined ? String(sub.endID) : undefined,
  };
}

export function normalizePath(path: OdsayPath, index: number): TransitRoute {
  const info = path.info ?? {};
  const segments = (path.subPath ?? []).map(normalizeSegment);

  // 환승 횟수: ODsay는 버스/지하철 환승을 따로 셉니다.
  // 두 값을 더하면 "탑승 횟수"가 되므로, 환승 횟수는 거기서 1을 뺍니다.
  const rides = (num(info.busTransitCount) ?? 0) + (num(info.subwayTransitCount) ?? 0);
  const transferCount = Math.max(0, rides - 1);

  return {
    index,
    totalTimeMin: nonNegative(info.totalTime) ?? 0,
    totalFare: nonNegative(info.payment) ?? null,
    transferCount,
    totalWalkM: nonNegative(info.totalWalk) ?? 0,
    totalDistanceM: nonNegative(info.totalDistance) ?? null,
    segments,
    odsayPathType: num(path.pathType),
    mapObj: typeof info.mapObj === "string" && info.mapObj.length > 0 ? info.mapObj : undefined,
  };
}

export function normalizePaths(paths: OdsayPath[] | undefined): TransitRoute[] {
  if (!Array.isArray(paths)) return [];
  return paths
    .map(normalizePath)
    // 총 소요 시간이 없는 경로는 화면에 쓸 수 없으므로 버립니다.
    .filter((route) => route.totalTimeMin > 0);
}

/**
 * loadLane 응답 → 지도에 그릴 좌표열 목록.
 *
 * lane[i].section[j].graphPos 가 실제 선형입니다. ODsay 가 x/y 를 숫자로
 * 줄 때도 문자열로 줄 때도 있어 둘 다 받습니다. 좌표가 깨진 점은 버리고,
 * 점이 둘 미만인 구간은 선이 되지 않으므로 통째로 버립니다.
 *
 * 주의: x 가 경도, y 가 위도입니다. 지도 라이브러리는 대개 (위도, 경도)
 * 순서라 여기서 뒤집어 둡니다.
 */
export function normalizeLanes(response: OdsayLoadLaneResponse | undefined): LanePath[] {
  const lanes = response?.result?.lane;
  if (!Array.isArray(lanes)) return [];

  const paths: LanePath[] = [];

  for (const lane of lanes) {
    for (const section of lane?.section ?? []) {
      const points = (section?.graphPos ?? [])
        .map((pos) => toPoint(pos?.y, pos?.x))
        .filter((point): point is { lat: number; lng: number } => point !== null);

      if (points.length >= 2) paths.push(points);
    }
  }

  return paths;
}
