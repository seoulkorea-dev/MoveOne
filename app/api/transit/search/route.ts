import { NextResponse } from "next/server";
import { buildCacheKey, logApiCall, readCache, writeCache } from "@/lib/cache";
import { query } from "@/lib/db";
import { OdsayError, odsayErrorMessage, searchPubTransPath } from "@/lib/odsay/client";
import { normalizePaths } from "@/lib/odsay/normalize";
import { checkRegion } from "@/lib/region";
import type { Place, RouteSearchResult, TransitRoute } from "@/lib/routes";
import { getSession } from "@/lib/session";
import { log, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 경로 검색 프록시.
 *
 * 브라우저 → 이 라우트 → ODsay 순서로 호출합니다. 브라우저가 ODsay를
 * 직접 부르지 않으므로 API 키가 노출되지 않습니다.
 *
 * 처리 순서에 이유가 있습니다:
 *   1. 입력 검증    — 잘못된 요청으로 ODsay 호출을 쓰지 않는다
 *   2. 지역 판정    — 수도권 밖이면 호출하지 않고 바로 안내한다
 *   3. 캐시 조회    — 같은 구간 반복 검색은 ODsay를 부르지 않는다
 *   4. ODsay 호출
 *   5. 정규화
 *   6. 기록         — KPI(검색 완료율·선택률)의 원천
 */

type SearchBody = {
  departure?: Partial<Place>;
  arrival?: Partial<Place>;
  sessionId?: string;
  mode?: string;
};

/**
 * 교통수단.
 * ODsay SearchPathType — 0:전체 1:지하철 2:버스.
 * 수단을 좁히면 호출 결과가 달라지므로 캐시 키에도 함께 넣어야 합니다.
 * 안 넣으면 "지하철만" 검색이 직전의 "전체" 결과를 그대로 돌려줍니다.
 */
export const SEARCH_MODES = ["all", "subway", "bus"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

const SEARCH_PATH_TYPE: Record<SearchMode, 0 | 1 | 2> = { all: 0, subway: 1, bus: 2 };

function toMode(value: unknown): SearchMode {
  return SEARCH_MODES.includes(value as SearchMode) ? (value as SearchMode) : "all";
}

function isPlace(value: Partial<Place> | undefined): value is Place {
  return (
    !!value &&
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng)
  );
}

function fail(message: string, status: number, code?: string, detail?: string) {
  return NextResponse.json(
    {
      error: {
        message,
        code,
        // 원인은 개발 중에만 화면까지 올려 보냅니다.
        detail: process.env.NODE_ENV === "production" ? undefined : detail,
      },
    },
    { status },
  );
}

export async function POST(request: Request) {
  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return fail("요청 형식이 올바르지 않습니다.", 400, "bad_json");
  }

  // --- 1. 입력 검증 ---
  if (!isPlace(body.departure) || !isPlace(body.arrival)) {
    return fail("출발지와 도착지를 모두 선택해 주세요.", 400, "missing_place");
  }
  const departure = body.departure;
  const arrival = body.arrival;

  // --- 2. 지역 판정 (ODsay를 부르기 전에) ---
  const region = checkRegion(departure, arrival);
  if (!region.ok) {
    log.info("수도권 밖 — ODsay 호출 생략");
    return fail(region.message, 422, "out_of_service_area");
  }

  const mode = toMode(body.mode);
  const done = startTimer("api.transit.search", { mode });

  const session = await getSession();
  const userId = session?.uid ?? null;
  const cacheKey = buildCacheKey(departure, arrival, { m: mode });
  const startedAt = Date.now();

  let routes: TransitRoute[];
  let fromCache = false;
  let fetchedAt: string;

  // --- 3. 캐시 ---
  const cached = await readCache(cacheKey).catch(() => null);

  if (cached) {
    routes = cached.routes;
    fetchedAt = cached.fetchedAt;
    fromCache = true;
    log.debug("캐시 적중 — ODsay 호출 없음", { routes: routes.length });
    await logApiCall({
      provider: "odsay",
      endpoint: "/v1/api/searchPubTransPathT",
      cacheHit: true,
      responseTimeMs: Date.now() - startedAt,
      userId,
    });
  } else {
    // --- 4. ODsay 호출 ---
    try {
      const { data, elapsedMs } = await searchPubTransPath({
        sx: departure.lng,
        sy: departure.lat,
        ex: arrival.lng,
        ey: arrival.lat,
        searchPathType: SEARCH_PATH_TYPE[mode],
      });

      // --- 5. 정규화 ---
      routes = normalizePaths(data.result?.path);
      fetchedAt = new Date().toISOString();

      await logApiCall({
        provider: "odsay",
        endpoint: "/v1/api/searchPubTransPathT",
        statusCode: 200,
        responseTimeMs: elapsedMs,
        cacheHit: false,
        userId,
      });

      if (routes.length > 0) {
        await writeCache(cacheKey, { routes, fetchedAt }).catch(() => {});
      }
    } catch (cause) {
      const error = cause instanceof OdsayError ? cause : new OdsayError("unknown", "");
      await logApiCall({
        provider: "odsay",
        endpoint: "/v1/api/searchPubTransPathT",
        statusCode: error.status,
        responseTimeMs: Date.now() - startedAt,
        errorMessage: `${error.code}: ${error.message}`,
        userId,
      });
      // ODsay 가 실제로 보낸 본문까지 남깁니다. 이게 없으면 code:'unknown' 만
      // 보고 원인을 추측하게 됩니다.
      log.error("ODsay 호출 실패", {
        code: error.code,
        status: error.status,
        message: error.message,
        detail: error.detail,
      });
      done({ code: error.code }, "error");
      return fail(odsayErrorMessage(error), 502, error.code, error.detail);
    }
  }

  // --- 6. 검색 기록 (KPI 원천) ---
  let searchId: string | null = null;
  try {
    searchId = await persistSearch({
      userId,
      sessionId: body.sessionId ?? null,
      departure,
      arrival,
      routes,
      durationMs: Date.now() - startedAt,
      cacheHit: fromCache,
    });
  } catch (cause) {
    // 기록 실패가 검색 결과를 못 보게 만들면 안 됩니다.
    log.error("검색 기록 실패", { message: String(cause).slice(0, 160) });
  }

  const payload: RouteSearchResult & { searchId: string | null; mode: SearchMode } = {
    routes,
    fromCache,
    fetchedAt,
    searchId,
    mode,
  };
  done({ routes: routes.length, fromCache, searchId: searchId ? "기록됨" : "없음" });
  return NextResponse.json(payload);
}

/** searches → search_routes → search_route_segments 순으로 저장합니다. */
async function persistSearch(input: {
  userId: string | null;
  sessionId: string | null;
  departure: Place;
  arrival: Place;
  routes: TransitRoute[];
  durationMs: number;
  cacheHit: boolean;
}): Promise<string> {
  const [search] = await query<{ id: string }>(
    `insert into searches
       (user_id, session_id, departure_location, arrival_location,
        result_count, search_duration_ms, cache_hit)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      input.userId,
      input.sessionId,
      JSON.stringify(input.departure),
      JSON.stringify(input.arrival),
      input.routes.length,
      input.durationMs,
      input.cacheHit,
    ],
  );

  for (const route of input.routes) {
    const [saved] = await query<{ id: string }>(
      `insert into search_routes
         (search_id, route_index, total_time, total_distance, total_walk,
          total_fare, transfer_count, odsay_path_type)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        search.id,
        route.index,
        route.totalTimeMin,
        route.totalDistanceM,
        route.totalWalkM,
        route.totalFare,
        route.transferCount,
        route.odsayPathType ?? null,
      ],
    );

    for (const segment of route.segments) {
      await query(
        `insert into search_route_segments
           (route_id, segment_index, segment_type, start_name, start_lat, start_lng,
            end_name, end_lat, end_lng, lane_name, duration, distance, station_count,
            odsay_start_station_id, odsay_end_station_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          saved.id,
          segment.index,
          segment.type,
          segment.startName ?? null,
          segment.start?.lat ?? null,
          segment.start?.lng ?? null,
          segment.endName ?? null,
          segment.end?.lat ?? null,
          segment.end?.lng ?? null,
          segment.laneName ?? null,
          segment.durationMin ?? null,
          segment.distanceM ?? null,
          segment.stationCount ?? null,
          segment.odsayStartStationId ?? null,
          segment.odsayEndStationId ?? null,
        ],
      );
    }
  }

  return search.id;
}
