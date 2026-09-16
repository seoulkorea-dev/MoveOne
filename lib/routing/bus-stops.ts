import "server-only";
import { query } from "@/lib/db";
import { log } from "@/lib/logger";
import type { RouteStop } from "@/lib/routes";
import { fetchRouteStations, type BusRouteStation } from "./engines/seoul-bus";

/**
 * 노선 경유 정류장 캐시.
 *
 * 왜 필요한가
 *   환승경로 API 는 탑승 구간마다 승차·하차 두 점만 줍니다. 그 두 점만 이으면
 *   지도에 직선이 그려지고, 그건 "여기서 타서 저기서 내린다" 외에는 아무것도
 *   알려주지 않습니다. 실제 노선 모양을 그리려면 경유 정류장이 필요합니다.
 *
 * 왜 DB 에 두는가
 *   노선정보 API 는 1일 1,000회 한도를 씁니다. 경로 한 건에 탑승 구간이 2~3개면
 *   검색 한 번에 3회입니다. 노선 정류장 목록은 거의 바뀌지 않으므로 한 번 받아
 *   두고 다음부터는 DB 에서 읽습니다.
 *
 * 실패해도 경로는 보여줍니다
 *   정류장을 못 받으면 stops 없이 승차·하차 두 점만 들어갑니다. 지도가 직선이
 *   될 뿐 경로 안내 자체는 그대로입니다. 지도 때문에 검색이 실패하면 안 됩니다.
 */

/** 노선 정류장 목록은 거의 안 바뀝니다. 한 달이면 충분히 짧습니다. */
const REFRESH_DAYS = 30;

type StopRow = {
  seq: number;
  station_id: string;
  station_name: string;
  lat: number;
  lng: number;
};

/** 노선 하나에 대해 화면·요금이 필요로 하는 것 전부 */
export type RouteInfo = {
  stops: BusRouteStation[];
  /** TOPIS 노선유형. 요금과 노선색에 씁니다. 모르면 null */
  routeType: number | null;
};

async function readCached(routeId: string): Promise<RouteInfo | null> {
  const meta = await query<{ ok: boolean; route_type: number | null }>(
    `select (fetched_at > now() - ($2 || ' days')::interval) as ok, route_type
       from bus_route_meta where route_id = $1`,
    [routeId, String(REFRESH_DAYS)],
  );
  if (meta.length === 0 || meta[0].ok !== true) return null;

  const rows = await query<StopRow>(
    `select seq, station_id, station_name, lat, lng
       from bus_route_stop where route_id = $1 order by seq`,
    [routeId],
  );
  if (rows.length === 0) return null;

  return {
    routeType: meta[0].route_type === null ? null : Number(meta[0].route_type),
    stops: rows.map((r) => ({
      seq: Number(r.seq),
      stationId: r.station_id,
      arsId: null,
      stationName: r.station_name,
      lat: Number(r.lat),
      lng: Number(r.lng),
    })),
  };
}

async function writeCached(
  routeId: string,
  routeName: string | null,
  routeType: number | null,
  stations: BusRouteStation[],
): Promise<void> {
  // 노선 하나를 통째로 갈아끼웁니다. seq 가 바뀌었을 때 옛 행이 남으면
  // 구간을 자를 때 엉뚱한 곳을 집습니다.
  await query(`delete from bus_route_stop where route_id = $1`, [routeId]);

  for (const s of stations) {
    await query(
      `insert into bus_route_stop
         (route_id, seq, station_id, ars_id, station_name, lat, lng)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (route_id, seq) do update
         set station_id = excluded.station_id,
             ars_id = excluded.ars_id,
             station_name = excluded.station_name,
             lat = excluded.lat,
             lng = excluded.lng`,
      [routeId, s.seq, s.stationId, s.arsId, s.stationName, s.lat, s.lng],
    );
  }

  await query(
    `insert into bus_route_meta (route_id, route_name, route_type, stop_count, fetched_at)
     values ($1, $2, $3, $4, now())
     on conflict (route_id) do update
       set route_name = excluded.route_name,
           route_type = excluded.route_type,
           stop_count = excluded.stop_count,
           fetched_at = now()`,
    [routeId, routeName, routeType, stations.length],
  );
}

/**
 * 노선 정보. 캐시에 있으면 DB 에서, 없으면 API 에서 받아 채웁니다.
 * 어떤 이유로든 못 구하면 빈 목록입니다 — 예외를 던지지 않습니다.
 *
 * routeType 이 null 로 남으면 요금을 계산하지 않습니다(lib/routing/bus-fare.ts).
 * 틀린 요금보다 "요금 정보 없음" 이 낫습니다.
 */
export async function routeInfo(routeId: string): Promise<RouteInfo> {
  try {
    const cached = await readCached(routeId);
    if (cached !== null) return cached;
  } catch (cause) {
    log.error("정류장 캐시 조회 실패 — API 로 우회", {
      routeId,
      message: String(cause).slice(0, 160),
    });
  }

  try {
    const { stations, routeName, routeType } = await fetchRouteStations(routeId);
    if (stations.length === 0) {
      log.info("노선 정류장이 비어 있습니다", { routeId });
      return { stops: [], routeType };
    }
    // 적재 실패는 다음 검색에서 한 번 더 부르게 될 뿐이므로 무시합니다.
    await writeCached(routeId, routeName, routeType, stations).catch((cause) => {
      log.error("정류장 캐시 적재 실패", {
        routeId,
        message: String(cause).slice(0, 160),
      });
    });
    log.debug("노선 정류장 적재", { routeId, routeName, routeType, stops: stations.length });
    return { stops: stations, routeType };
  } catch (cause) {
    log.error("노선 정보 조회 실패 — 직선·요금없음으로 대체", {
      routeId,
      message: String(cause).slice(0, 160),
    });
    return { stops: [], routeType: null };
  }
}

/**
 * 승차 정류소 ~ 하차 정류소 사이를 잘라냅니다.
 *
 * ★ 같은 정류소가 두 번 나오는 노선이 있습니다.
 *   getStaionByRoute 는 왕복 노선의 상행·하행을 **한 목록**으로 줍니다.
 *   2026-09-16 실측: 1400인천 36개 중 1건이 중복이었습니다.
 *
 *   그래서 "처음 찾은 seq" 를 쓰면 반대 방향을 집어 노선이 거꾸로 그려질 수
 *   있습니다. 승차 seq < 하차 seq 인 짝 중 **간격이 가장 짧은** 것을 씁니다.
 *   실제로 탄 구간이 가장 짧은 구간이라는 가정인데, 왕복 노선에서 반대 방향을
 *   집으면 간격이 노선 길이만큼 벌어지므로 이 규칙으로 걸러집니다.
 */
export function sliceRide(
  stops: BusRouteStation[],
  boardStationId: string,
  alightStationId: string,
): BusRouteStation[] {
  if (stops.length === 0) return [];

  const boardSeqs = stops.filter((s) => s.stationId === boardStationId).map((s) => s.seq);
  const alightSeqs = stops.filter((s) => s.stationId === alightStationId).map((s) => s.seq);
  if (boardSeqs.length === 0 || alightSeqs.length === 0) return [];

  let best: { from: number; to: number } | null = null;
  for (const from of boardSeqs) {
    for (const to of alightSeqs) {
      if (to <= from) continue;
      if (best === null || to - from < best.to - best.from) best = { from, to };
    }
  }
  if (best === null) return [];

  const picked = best;
  return stops.filter((s) => s.seq >= picked.from && s.seq <= picked.to);
}

export function toRouteStops(stations: BusRouteStation[]): RouteStop[] {
  return stations.map((s) => ({ name: s.stationName, lat: s.lat, lng: s.lng }));
}
