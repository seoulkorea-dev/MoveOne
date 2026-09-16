import type { Place, RouteSegment, RouteStop, TransitRoute } from "@/lib/routes";
import { haversineKm } from "@/lib/routing/stations";
import { routeInfo, sliceRide, toRouteStops } from "@/lib/routing/bus-stops";
import { computeBusFare } from "@/lib/routing/bus-fare";
import { busColor, subwayColor } from "@/lib/routing/line-colors";
import type { BusPath, BusRide, BusRouteStation } from "./seoul-bus";

/**
 * seoul-bus 결과 → 화면이 쓰는 도메인 타입.
 *
 * lib/odsay/normalize.ts · seoul-adapter.ts 와 같은 역할입니다.
 * 이 파일이 완충 지대라서 result-view.tsx · detail-view.tsx 는 손대지 않습니다.
 *
 * 맞춰야 하는 것 네 가지:
 *
 *  1. 도보 구간을 만들어 붙입니다.
 *     API 는 정류장~정류장만 줍니다. 출발지→승차정류장, 하차정류장→도착지,
 *     그리고 환승 사이의 도보를 여기서 만듭니다. 환승 도보가 없으면 지도에서
 *     선이 끊겨 보입니다(내린 곳과 다음에 탄 곳이 다른 정류장이라서).
 *
 *  2. 구간별 소요시간을 나눕니다.
 *     API 는 경로 전체의 time 하나만 줍니다. 구간별로는 주지 않습니다.
 *     그래서 환승 도보 시간을 먼저 빼고, 남은 시간을 각 탑승 구간의 **거리 비율**로
 *     나눕니다. 합계는 API 값과 정확히 일치합니다. 추정이라는 점을 잊지 마세요.
 *
 *  3. 거리는 좌표로 직접 계산합니다.
 *     API 의 distance 는 광역노선에서 크게 어긋납니다. 2026-09-16 실측:
 *     서울역→판교가 "4164"m (실제 약 20km). 정류장 좌표를 이어 잰 길이를 씁니다.
 *
 *  4. 요금은 우리가 계산합니다.
 *     응답에 요금 필드가 없습니다. 수도권 통합환승 거리비례 규칙으로 계산하되
 *     (lib/routing/bus-fare.ts), 노선 유형을 모르면 null 로 둡니다.
 *     화면은 formatFare(null) 로 "요금 정보 없음" 을 표시합니다.
 *     있는 척하는 숫자를 넣지 않습니다.
 *
 *  5. ★ 지하철 구간도 이 어댑터가 다룹니다.
 *     '전체' 검색(getPathInfoByBusNSub)은 지하철이 섞인 경로를 돌려줍니다.
 *     버스 구간과 **같은 모양**으로 오므로 여기서 함께 처리합니다.
 *     다른 점은 두 가지뿐입니다.
 *       - 노선정보 API 를 부르지 않습니다. fid/tid 가 지하철역 코드라
 *         버스 정류소로 조회하면 엉뚱한 결과가 나옵니다.
 *       - 그래서 경유역이 없어 승차역~하차역 두 점만 그립니다.
 *     지하철 구간이 하나라도 있으면 routeType 이 null 이 되어 **요금도
 *     null** 이 됩니다. 지하철 기본요금·거리비례는 버스와 규칙이 달라
 *     지금 표로는 맞출 수 없습니다. 틀린 숫자보다 "요금 정보 없음"이 낫습니다.
 */

/** 도보 4km/h = 약 67m/분. seoul-adapter.ts 와 같은 값을 씁니다. */
const WALK_M_PER_MIN = 67;

export function walkMinutes(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return Math.max(1, Math.round(meters / WALK_M_PER_MIN));
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000);
}

/** 좌표열을 이어 잰 길이(m). 정류장이 없으면 두 끝점 사이 직선거리입니다. */
function pathLength(points: { lat: number; lng: number }[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += metersBetween(points[i - 1], points[i]);
  }
  return total;
}

function walkSegment(
  index: number,
  from: { lat: number; lng: number; name?: string },
  to: { lat: number; lng: number; name?: string },
  meters: number,
  minutes: number,
): RouteSegment {
  return {
    index,
    type: "walk",
    startName: from.name,
    endName: to.name,
    start: { lat: from.lat, lng: from.lng },
    end: { lat: to.lat, lng: to.lng },
    durationMin: minutes,
    distanceM: Math.round(meters),
  };
}

type RidePlan = {
  ride: BusRide;
  /** 승차~하차 경유 정류장. 못 받았으면 승차·하차 두 점만 */
  stops: RouteStop[];
  distanceM: number;
  /** TOPIS 노선유형. 요금과 노선색에 씁니다 */
  routeType: number | null;
};

/**
 * 탑승 구간마다 경유 정류장을 채웁니다.
 *
 * 노선정보 API 를 부를 수 있지만 캐시를 먼저 봅니다(lib/routing/bus-stops.ts).
 * 같은 노선이 여러 경로에 나오는 일이 흔해서, 노선 단위로 한 번만 받습니다.
 */
async function planRides(rides: BusRide[]): Promise<RidePlan[]> {
  // 지하철 구간은 조회하지 않습니다. fid/tid 가 지하철역 코드라서
  // 버스 노선정보 API 에 넣으면 안 됩니다(호출만 낭비하고 결과도 틀립니다).
  const uniqueIds = [
    ...new Set(
      rides
        .filter((r) => r.kind === "bus" && r.routeId !== null)
        .map((r) => r.routeId as string),
    ),
  ];
  const loaded = await Promise.all(
    uniqueIds.map(async (id) => ({ id, info: await routeInfo(id) })),
  );
  const byRoute = new Map<string, { stops: BusRouteStation[]; routeType: number | null }>();
  for (const entry of loaded) {
    byRoute.set(entry.id, { stops: entry.info.stops, routeType: entry.info.routeType });
  }

  return rides.map((ride) => {
    const found = ride.routeId === null ? undefined : byRoute.get(ride.routeId);
    const all = found?.stops ?? [];
    const sliced = sliceRide(all, ride.boardStationId, ride.alightStationId);

    // 정류장을 못 구했으면 두 끝점만 둡니다. 지도는 직선이 되지만
    // 경로 안내(몇 번 버스를 어디서 타고 어디서 내리는지)는 그대로입니다.
    const stops: RouteStop[] =
      sliced.length >= 2
        ? toRouteStops(sliced)
        : [
            { name: ride.boardName, lat: ride.board.lat, lng: ride.board.lng },
            { name: ride.alightName, lat: ride.alight.lat, lng: ride.alight.lng },
          ];

    return { ride, stops, distanceM: pathLength(stops), routeType: found?.routeType ?? null };
  });
}

export type BusAdaptContext = {
  origin: Place;
  dest: Place;
};

export async function toTransitRoute(
  path: BusPath,
  index: number,
  ctx: BusAdaptContext,
): Promise<TransitRoute | null> {
  const plans = await planRides(path.rides);
  if (plans.length === 0) return null;

  const first = plans[0];
  const last = plans[plans.length - 1];

  const startWalkM = metersBetween(ctx.origin, first.ride.board);
  const endWalkM = metersBetween(last.ride.alight, ctx.dest);

  // 환승 도보: 앞 구간 하차 지점 → 다음 구간 승차 지점.
  // 같은 정류장에서 갈아타면 0m 이므로 구간을 만들지 않습니다.
  const transferWalkM: number[] = [];
  for (let i = 1; i < plans.length; i += 1) {
    transferWalkM.push(metersBetween(plans[i - 1].ride.alight, plans[i].ride.board));
  }
  const transferMin = transferWalkM.map((m) => (m >= 30 ? walkMinutes(m) : 0));
  const transferMinTotal = transferMin.reduce((a, b) => a + b, 0);

  // 구간별 소요시간 배분. 합계가 API 값과 어긋나지 않도록 마지막 구간에서 맞춥니다.
  const rideBudget = Math.max(plans.length, path.totalTimeMin - transferMinTotal);
  const distanceSum = plans.reduce((a, p) => a + p.distanceM, 0);
  const rideMin: number[] = plans.map((p, i) => {
    if (i === plans.length - 1) return 0; // 아래에서 나머지로 채웁니다
    const share = distanceSum > 0 ? p.distanceM / distanceSum : 1 / plans.length;
    return Math.max(1, Math.round(rideBudget * share));
  });
  rideMin[plans.length - 1] = Math.max(
    1,
    rideBudget - rideMin.slice(0, -1).reduce((a, b) => a + b, 0),
  );

  const segments: RouteSegment[] = [];

  if (startWalkM >= 30) {
    segments.push(
      walkSegment(
        segments.length,
        { lat: ctx.origin.lat, lng: ctx.origin.lng, name: ctx.origin.name ?? ctx.origin.address },
        { lat: first.ride.board.lat, lng: first.ride.board.lng, name: first.ride.boardName },
        startWalkM,
        walkMinutes(startWalkM),
      ),
    );
  }

  plans.forEach((plan, i) => {
    if (i > 0 && transferMin[i - 1] > 0) {
      segments.push(
        walkSegment(
          segments.length,
          {
            lat: plans[i - 1].ride.alight.lat,
            lng: plans[i - 1].ride.alight.lng,
            name: plans[i - 1].ride.alightName,
          },
          { lat: plan.ride.board.lat, lng: plan.ride.board.lng, name: plan.ride.boardName },
          transferWalkM[i - 1],
          transferMin[i - 1],
        ),
      );
    }

    segments.push({
      index: segments.length,
      // 지하철 구간은 지하철로 표시합니다. 아이콘·색·"N개 역" 표기가
      // 모두 이 값으로 갈립니다.
      type: plan.ride.kind,
      laneName: plan.ride.routeName,
      startName: plan.ride.boardName,
      endName: plan.ride.alightName,
      start: plan.ride.board,
      end: plan.ride.alight,
      durationMin: rideMin[i],
      distanceM: plan.distanceM > 0 ? plan.distanceM : undefined,
      stationCount: plan.stops.length > 1 ? plan.stops.length - 1 : undefined,
      stops: plan.stops,
      // 노선에 맞는 색. 지도와 진행 바가 같은 값을 씁니다.
      color:
        plan.ride.kind === "subway"
          ? subwayColor(plan.ride.routeName)
          : busColor(plan.routeType),
      // odsayStartStationId 는 채우지 않습니다. ODsay 위젯 전용 값이라,
      // 여기에 TOPIS 정류소 ID 를 넣으면 상세 화면이 엉뚱한 지도를 띄웁니다.
    });
  });

  if (endWalkM >= 30) {
    segments.push(
      walkSegment(
        segments.length,
        { lat: last.ride.alight.lat, lng: last.ride.alight.lng, name: last.ride.alightName },
        { lat: ctx.dest.lat, lng: ctx.dest.lng, name: ctx.dest.name ?? ctx.dest.address },
        endWalkM,
        walkMinutes(endWalkM),
      ),
    );
  }

  const totalWalkM =
    (startWalkM >= 30 ? startWalkM : 0) +
    (endWalkM >= 30 ? endWalkM : 0) +
    transferWalkM.reduce((a, m, i) => a + (transferMin[i] > 0 ? m : 0), 0);

  const totalTimeMin =
    rideBudget +
    transferMinTotal +
    (startWalkM >= 30 ? walkMinutes(startWalkM) : 0) +
    (endWalkM >= 30 ? walkMinutes(endWalkM) : 0);

  // 요금은 경로 전체로 한 번 계산합니다. 노선별로 더하면 환승 통행이 전부 틀립니다.
  // 거리는 탑승 구간만 씁니다 — 도보는 요금과 무관합니다.
  const totalFare = computeBusFare(
    plans.map((p) => ({ routeType: p.routeType })),
    distanceSum,
  );

  return {
    index,
    totalTimeMin,
    // 계산할 수 없으면 null 입니다. 0 을 넣으면 "무료"로 읽힙니다.
    totalFare,
    transferCount: Math.max(0, plans.length - 1),
    totalWalkM,
    totalDistanceM: distanceSum + totalWalkM,
    segments,
    // mapObj 없음 — RouteMap 이 segment.stops 로 그립니다.
    // odsayPathType 없음 — ODsay 원본 값이라 채우면 로그에서 엔진 구분이 사라집니다.
  };
}

/**
 * @param limit 화면에 보여줄 최대 경로 수. **채우기 전에** 줄이는 것이 핵심입니다.
 *
 *   경로마다 노선 정류장을 채우는데, 그게 노선정보 API 호출입니다(1일 1,000회).
 *   2026-09-16 실측: 서울시청→판교역 검색에서 경로가 20건 나왔고 조회가 11회
 *   나갔습니다. 어차피 5건만 보여줄 것이라 나머지는 한도만 쓰고 버려집니다.
 *
 *   API 가 준 time 으로 미리 정렬해 앞쪽만 채웁니다. 최종 정렬은 도보까지
 *   더한 시간으로 다시 하므로(app/api/transit/search/route.ts 의 trimRoutes),
 *   여기서는 여유를 조금 둡니다 — 도보 시간 때문에 순위가 뒤집힐 수 있습니다.
 */
export async function toTransitRoutes(
  paths: BusPath[],
  ctx: BusAdaptContext,
  limit?: number,
): Promise<TransitRoute[]> {
  const picked =
    limit === undefined
      ? paths
      : [...paths].sort((a, b) => a.totalTimeMin - b.totalTimeMin).slice(0, limit + 2);

  const built = await Promise.all(picked.map((p, i) => toTransitRoute(p, i, ctx)));
  return built
    .filter((r): r is TransitRoute => r !== null)
    .filter((r) => r.totalTimeMin > 0)
    // 인덱스를 다시 매깁니다. 중간에 버려진 경로가 있으면 번호가 비어
    // 상세 화면(?i=n)이 "경로를 찾을 수 없습니다" 가 됩니다.
    .map((r, i) => ({ ...r, index: i }));
}

/**
 * 지하철 구간이 섞였을 때의 안내.
 *
 * 그 구간은 경유역을 못 받아 지도에 직선으로 그립니다(railLinkList 구조
 * 미확인). 사용자가 "지하철이 저렇게 직선으로 간다"고 오해하지 않도록
 * 한 줄 알려 둡니다. 요금이 비는 이유도 같이 적습니다.
 */
export function railApproxNotice(railLegs: number): string | null {
  if (railLegs <= 0) return null;
  return "지하철 구간은 역 사이를 직선으로 표시합니다. 요금은 지하철이 섞이면 계산하지 않습니다.";
}
