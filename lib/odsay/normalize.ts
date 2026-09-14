import type { RouteSegment, SegmentType, TransitRoute } from "@/lib/routes";
import { ODSAY_TRAFFIC_TYPE, type OdsayPath, type OdsaySubPath } from "./types";

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

function coord(lat: unknown, lng: unknown) {
  const y = num(lat);
  const x = num(lng);
  if (y === undefined || x === undefined) return undefined;
  return { lat: y, lng: x };
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
    durationMin: num(sub.sectionTime),
    distanceM: num(sub.distance),
    stationCount: num(sub.stationCount),
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
    totalTimeMin: num(info.totalTime) ?? 0,
    totalFare: num(info.payment) ?? null,
    transferCount,
    totalWalkM: num(info.totalWalk) ?? 0,
    totalDistanceM: num(info.totalDistance) ?? null,
    segments,
    odsayPathType: num(path.pathType),
  };
}

export function normalizePaths(paths: OdsayPath[] | undefined): TransitRoute[] {
  if (!Array.isArray(paths)) return [];
  return paths
    .map(normalizePath)
    // 총 소요 시간이 없는 경로는 화면에 쓸 수 없으므로 버립니다.
    .filter((route) => route.totalTimeMin > 0);
}
