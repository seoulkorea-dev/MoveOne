import type { Place, RouteSegment, RouteStop, TransitRoute } from "@/lib/routes";
import { subwayColor } from "@/lib/routing/line-colors";
import type { ResolvedEndpoint } from "@/lib/routing/resolve-endpoint";
import type { SeoulLeg, SeoulRoute } from "./seoul";

/**
 * seoul 엔진 결과 → 화면이 쓰는 도메인 타입.
 *
 * lib/odsay/normalize.ts 와 같은 역할입니다. 이 파일이 완충 지대라서,
 * 공공 API 응답이 바뀌어도 화면은 그대로입니다.
 *
 * ODsay 결과와 **같은 모양**으로 만드는 것이 목적입니다. 결과 목록·상세
 * 화면이 두 엔진을 구분하지 않아도 되도록 하려는 것이고, 그래서
 * result-view.tsx 와 detail-view.tsx 는 손대지 않았습니다.
 *
 * 맞춘 규칙 세 가지:
 *   1. ODsay 경로는 도보로 시작해 도보로 끝납니다. 공공 API 는 역~역만 주므로
 *      출발지→승차역, 하차역→도착지 도보 구간을 여기서 만들어 붙입니다.
 *      이걸 빼면 "역까지 900m 걸어야 한다"는 사실이 화면에서 사라집니다.
 *   2. 소요시간에도 그 도보 시간을 더합니다. 안 더하면 ODsay 결과와
 *      나란히 놓았을 때 공공 API 쪽이 부당하게 빨라 보입니다.
 *   3. mapObj 는 채우지 않습니다. RouteMap 이 mapObj 가 없으면
 *      segment.stops 로 선을 그리도록 이미 되어 있습니다.
 */

/** 도보 4km/h = 약 67m/분. ODsay 의 도보 추정과 비슷한 값입니다. */
const WALK_M_PER_MIN = 67;

export function walkMinutes(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return Math.max(1, Math.round(meters / WALK_M_PER_MIN));
}

function toStops(leg: SeoulLeg): RouteStop[] | undefined {
  if (leg.stopList.length === 0) return undefined;
  return leg.stopList.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng }));
}

function legToSegment(leg: SeoulLeg, index: number): RouteSegment {
  const first = leg.stopList[0];
  const last = leg.stopList[leg.stopList.length - 1];

  return {
    index,
    type: "subway",
    // 노선명은 경로 API 가 준 값을 씁니다. 역 마스터의 노선명("분당선")과
    // 경로 API 의 노선명("수인분당선")이 다르기 때문입니다.
    laneName: leg.lineName ?? undefined,
    startName: leg.boardStation,
    endName: leg.alightStation,
    start: first ? { lat: first.lat, lng: first.lng } : undefined,
    end: last ? { lat: last.lat, lng: last.lng } : undefined,
    // 대기시간을 포함합니다. 환승 대기가 빠지면 총합이 맞지 않습니다.
    durationMin: Math.max(1, Math.round((leg.travelSec + leg.waitSec) / 60)),
    distanceM: leg.distanceM > 0 ? leg.distanceM : undefined,
    stationCount: leg.stops > 0 ? leg.stops : undefined,
    stops: toStops(leg),
    // 노선별 실제 색. 지도에서 1호선과 4호선이 구분됩니다.
    color: subwayColor(leg.lineName),
  };
}

function walkSegment(
  index: number,
  from: { lat: number; lng: number; name?: string },
  to: { lat: number; lng: number; name?: string },
  meters: number,
): RouteSegment {
  return {
    index,
    type: "walk",
    startName: from.name,
    endName: to.name,
    start: { lat: from.lat, lng: from.lng },
    end: { lat: to.lat, lng: to.lng },
    durationMin: walkMinutes(meters),
    distanceM: Math.round(meters),
  };
}

export type AdaptContext = {
  /** 사용자가 고른 출발지 (역이 아니라 장소) */
  origin: Place;
  /** 사용자가 고른 도착지 */
  dest: Place;
  /** origin 에서 가장 가까운 역 */
  from: ResolvedEndpoint;
  /** dest 에서 가장 가까운 역 */
  to: ResolvedEndpoint;
};

export function toTransitRoute(route: SeoulRoute, index: number, ctx: AdaptContext): TransitRoute {
  const segments: RouteSegment[] = [];

  // 출발지 → 승차역 도보. 0m(역명을 직접 입력한 경우)면 만들지 않습니다.
  if (ctx.from.walkDistanceM > 0) {
    segments.push(
      walkSegment(
        segments.length,
        { lat: ctx.origin.lat, lng: ctx.origin.lng, name: ctx.origin.name ?? ctx.origin.address },
        { lat: ctx.from.lat, lng: ctx.from.lng, name: ctx.from.displayName },
        ctx.from.walkDistanceM,
      ),
    );
  }

  for (const leg of route.legs) {
    segments.push(legToSegment(leg, segments.length));
  }

  // 하차역 → 도착지 도보
  if (ctx.to.walkDistanceM > 0) {
    segments.push(
      walkSegment(
        segments.length,
        { lat: ctx.to.lat, lng: ctx.to.lng, name: ctx.to.displayName },
        { lat: ctx.dest.lat, lng: ctx.dest.lng, name: ctx.dest.name ?? ctx.dest.address },
        ctx.to.walkDistanceM,
      ),
    );
  }

  const totalWalkM = Math.round(ctx.from.walkDistanceM + ctx.to.walkDistanceM);
  const rideMin = Math.round((route.totalSec ?? 0) / 60);
  const totalTimeMin = rideMin + walkMinutes(ctx.from.walkDistanceM) + walkMinutes(ctx.to.walkDistanceM);

  return {
    index,
    totalTimeMin,
    totalFare: route.totalFareCard ?? null,
    transferCount: route.transferCount ?? Math.max(0, route.legs.length - 1),
    totalWalkM,
    totalDistanceM: route.totalDistanceM ?? null,
    segments,
    // odsayPathType 은 ODsay 원본 값이라 채우지 않습니다. 채우면 로그를
    // 읽을 때 ODsay 결과인지 공공 API 결과인지 구분이 사라집니다.
    // mapObj 도 없습니다 — RouteMap 이 segment.stops 로 그립니다.
  };
}

export function toTransitRoutes(routes: SeoulRoute[], ctx: AdaptContext): TransitRoute[] {
  return routes
    .map((r, i) => toTransitRoute(r, i, ctx))
    // 시간이 0인 경로는 화면에 쓸 수 없습니다. normalize.ts 와 같은 규칙입니다.
    .filter((r) => r.totalTimeMin > 0);
}

/**
 * 최근접역으로 바꿔 검색했다는 사실을 화면에 알려줄 문구.
 * 사용자가 "강남 스타벅스"를 넣었는데 결과가 "역삼역 기준"이면 혼란스럽습니다.
 * null 이면 알릴 것이 없다는 뜻입니다.
 */
export function substitutionNotice(ctx: AdaptContext): string | null {
  const parts: string[] = [];
  if (ctx.from.substituted && ctx.from.walkDistanceM > 0) {
    parts.push(`출발 ${ctx.from.displayName}`);
  }
  if (ctx.to.substituted && ctx.to.walkDistanceM > 0) {
    parts.push(`도착 ${ctx.to.displayName}`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" · ")} 기준으로 찾았습니다.`;
}
