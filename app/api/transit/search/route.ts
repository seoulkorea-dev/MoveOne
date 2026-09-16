import { NextResponse } from "next/server";
import { buildCacheKey, logApiCall, readCache, writeCache } from "@/lib/cache";
import { withUser } from "@/lib/db";
import { OdsayError, odsayErrorMessage, searchPubTransPath } from "@/lib/odsay/client";
import { normalizePaths } from "@/lib/odsay/normalize";
import { checkRegion } from "@/lib/region";
import { sortRoutes, type Place, type RouteSearchResult, type TransitRoute } from "@/lib/routes";
import { getSession } from "@/lib/session";
import { log, startTimer } from "@/lib/logger";
import {
  EndpointResolveError,
  resolveEndpoint,
  type ResolvedEndpoint,
} from "@/lib/routing/resolve-endpoint";
import { rememberApiName } from "@/lib/routing/stations";
import { stationToStation } from "@/lib/routing/station-pair";
import {
  SeoulEngineError,
  findWorkingNamePair,
  searchSeoulAlternatives,
} from "@/lib/routing/engines/seoul";
import { substitutionNotice, toTransitRoutes } from "@/lib/routing/engines/seoul-adapter";
import { BusEngineError, searchBusPaths, type BusSearchOp } from "@/lib/routing/engines/seoul-bus";
import {
  railApproxNotice,
  toTransitRoutes as toBusTransitRoutes,
} from "@/lib/routing/engines/seoul-bus-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 경로 검색 프록시.
 *
 * 브라우저 → 이 라우트 → 외부 API 순서로 호출합니다. 브라우저가 외부 API를
 * 직접 부르지 않으므로 API 키가 노출되지 않습니다.
 *
 * 처리 순서에 이유가 있습니다:
 *   1. 입력 검증    — 잘못된 요청으로 API 호출을 쓰지 않는다
 *   2. 지역 판정    — 수도권 밖이면 호출하지 않고 바로 안내한다
 *   3. 엔진 선택    — 전체·버스·지하철 모두 서울시 공공 API (ODsay 는 되돌림용)
 *   4. 캐시 조회    — 같은 구간 반복 검색은 외부 API를 부르지 않는다
 *   5. 호출 + 정규화
 *   6. 결과 정리    — 시간 오름차순으로 상위 5건만
 *   7. 기록         — KPI(검색 완료율·선택률)의 원천
 */

/**
 * 화면에 보여줄 경로의 최대 개수.
 *
 * 엔진마다 돌려주는 개수가 제각각입니다. 2026-09-16 실측 기준
 *   서울교통공사 최단경로 — 3건 (duration·distance·transfer 대안)
 *   ODsay                 — 7건
 *   TOPIS 버스            — 5~19건 (서울역→부평이 19건이었습니다)
 *
 * 19건을 늘어놓으면 고르는 일이 일이 됩니다. 뒤쪽 경로는 앞쪽보다
 * 느리면서 환승만 많은 경우가 대부분이라 실제로 쓰이지 않습니다.
 */
const MAX_ROUTES = 5;

/**
 * 시간 오름차순으로 자릅니다.
 *
 * 엔진 안에서 자르지 않고 여기서 하는 이유: 세 엔진이 각자 자르면 규칙이
 * 세 곳에 흩어지고, 캐시에서 꺼낸 결과에는 적용되지 않습니다.
 *
 * ★ 인덱스를 다시 매기는 것이 중요합니다.
 *   상세 화면은 /route/detail?i=<index> 로 열리고 stored.routes 에서
 *   같은 index 를 찾습니다. 잘라낸 뒤 번호가 비어 있으면 "이 경로를 찾을 수
 *   없습니다" 가 뜹니다.
 */
function trimRoutes(routes: TransitRoute[]): TransitRoute[] {
  return sortRoutes(routes, "fastest")
    .slice(0, MAX_ROUTES)
    .map((route, i) => ({ ...route, index: i }));
}

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

/**
 * 경로 엔진.
 *
 *   seoul     — 서울교통공사 최단경로 (열린데이터광장). 지하철 전용.
 *               요금·급행·무정차·열차번호까지 주고, 2026-09-15 실측 기준
 *               수인분당선·신분당선·공항철도·경의선까지 닿습니다.
 *   seoul-bus — 서울시 TOPIS 대중교통환승경로 (공공데이터포털 15000414).
 *               좌표로 묻습니다. 2026-09-16 실측 기준 서울·경기·인천이
 *               모두 되고, 경기↔인천 구간도 나옵니다.
 *   odsay     — 되돌림용으로만 남겨 둡니다. 코드는 그대로 두되 기본값이
 *               아닙니다. 일일 조회 한도가 있어 기본 경로로 쓰기 어렵습니다.
 *
 * 되돌리는 방법 (환경변수):
 *   ROUTING_ENGINE=odsay         전부 ODsay 로
 *   ROUTING_SUBWAY_ENGINE=odsay  지하철만 ODsay 로
 *   ROUTING_BUS_ENGINE=odsay     전체·버스만 ODsay 로
 *
 * **자동 폴백은 넣지 않습니다** — 조용히 다른 엔진 결과를 보여주면 어느 쪽이
 * 실패했는지 알 수 없습니다. 실패하면 실패한 그대로 안내합니다.
 */
export type RoutingEngine = "odsay" | "seoul" | "seoul-bus";

function pickEngine(mode: SearchMode): RoutingEngine {
  if (process.env.ROUTING_ENGINE === "odsay") return "odsay";
  if (mode === "subway") {
    return process.env.ROUTING_SUBWAY_ENGINE === "odsay" ? "odsay" : "seoul";
  }
  return process.env.ROUTING_BUS_ENGINE === "odsay" ? "odsay" : "seoul-bus";
}

/** 전체는 버스+지하철 복합, 버스는 버스 전용 오퍼레이션을 씁니다. */
const BUS_OP: Record<Exclude<SearchMode, "subway">, BusSearchOp> = {
  all: "getPathInfoByBusNSub",
  bus: "getPathInfoByBus",
};

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

  // --- 2. 지역 판정 (외부 API를 부르기 전에) ---
  const region = checkRegion(departure, arrival);
  if (!region.ok) {
    log.info("수도권 밖 — 경로 API 호출 생략");
    return fail(region.message, 422, "out_of_service_area");
  }

  const mode = toMode(body.mode);
  const session = await getSession();
  const userId = session?.uid ?? null;
  const startedAt = Date.now();

  // --- 3. 엔진 선택 ---
  //
  // ★ 역 ↔ 역이면 지하철을 먼저 씁니다. (2026-09-16 결정)
  //
  //   '전체' 로 검색했는데 출발·도착이 둘 다 지하철역이면 사람이 기대하는 답은
  //   지하철 경로입니다. 그런데 TOPIS 환승경로 API 는 버스를 우선해서,
  //   "서울역 → 사당" 같은 구간에도 버스를 갈아타는 경로를 앞에 내놓습니다.
  //
  //   판정은 lib/routing/station-pair.ts 가 합니다. 이름이 아니라 좌표가
  //   기준입니다 — 카카오 장소 이름이 "사당역 4호선"·"서울역 롯데리아"처럼
  //   제각각이라 이름 규칙만으로는 틀립니다.
  //
  //   ★ 여기서는 폴백을 **허용합니다.** 지하철로 못 찾으면 버스로 넓혀 다시
  //     찾습니다. '전체' 는 원래 수단을 가리지 않겠다는 뜻이기 때문입니다.
  //     '지하철' 칩은 다릅니다 — 후보가 하나뿐이라 실패하면 실패한 그대로
  //     안내합니다(조용히 다른 엔진 결과를 보여주면 원인을 알 수 없습니다).
  const pair =
    mode === "all" && pickEngine(mode) === "seoul-bus"
      ? await stationToStation(departure, arrival)
      : null;

  const candidates: RoutingEngine[] = pair ? ["seoul", "seoul-bus"] : [pickEngine(mode)];
  let engine: RoutingEngine = candidates[0];
  const done = startTimer("api.transit.search", { mode, engine: candidates.join(" > ") });

  let routes: TransitRoute[] = [];
  let fromCache = false;
  let fetchedAt = "";
  let notice: string | null = null;
  /** 한 엔진이라도 결과를 냈는가 */
  let settled = false;
  /** 마지막으로 실패한 이유. 후보를 다 써도 안 되면 이걸로 응답합니다. */
  let failure: { status: number; code: string; message: string; detail?: string } | null = null;

  // api_logs.provider 는 기존 제약(odsay/kakao/seoul/public)을 그대로 씁니다.
  // 버스도 'seoul' 로 남기고 endpoint 로 구분합니다 — 제약을 또 갈 이유가 없습니다.
  const providerOf = (e: RoutingEngine) => (e === "odsay" ? "odsay" : "seoul");
  const endpointOf = (e: RoutingEngine) => {
    if (e === "seoul") return "/getShtrmPath";
    if (e === "seoul-bus") return `/${BUS_OP[mode === "subway" ? "all" : mode]}`;
    return "/v1/api/searchPubTransPathT";
  };

  // --- 4~5. 엔진별 시도 ---
  //
  // 후보가 둘일 때(역↔역)는 앞엣것이 실패하면 다음으로 넘어갑니다.
  // 후보가 하나면 실패가 곧 응답입니다.
  for (const candidate of candidates) {
    engine = candidate;
    const last = candidate === candidates[candidates.length - 1];

    // 엔진을 키에 넣지 않으면 ODsay 로 받아둔 결과가 공공 API 결과 자리에 나옵니다.
      const cacheKey = buildCacheKey(departure, arrival, { m: mode, e: engine });

      // --- 4. 캐시 ---
      const cached = await readCache(cacheKey).catch(() => null);

    if (cached) {
      routes = cached.routes;
      fetchedAt = cached.fetchedAt;
      fromCache = true;
      log.debug("캐시 적중 — 외부 API 호출 없음", { engine, routes: routes.length });
      await logApiCall({
        provider: providerOf(engine),
        endpoint: endpointOf(engine),
        cacheHit: true,
        responseTimeMs: Date.now() - startedAt,
        userId,
      });
    } else if (engine === "seoul") {
      // --- 5a. 서울시 공공 API (지하철) ---
      try {
        // 공공 API 는 좌표가 아니라 한글 역명을 받습니다. 먼저 최근접역으로 바꿉니다.
        const from = await resolveEndpoint({
          lat: departure.lat,
          lng: departure.lng,
          label: departure.name ?? departure.address,
        });
        const to = await resolveEndpoint({
          lat: arrival.lat,
          lng: arrival.lng,
          label: arrival.name ?? arrival.address,
        });

        const { routes: seoulRoutes, elapsedMs, usedNames, attempts } =
          await searchWithNameCandidates(from, to);

        const ctx = { origin: departure, dest: arrival, from, to };
        routes = toTransitRoutes(seoulRoutes, ctx);
        notice = substitutionNotice(ctx);
        fetchedAt = new Date().toISOString();

        const missing = seoulRoutes.flatMap((r) => r.missingCoordStations);
        if (missing.length > 0) {
          // 역 마스터 범위가 경로 API 커버리지보다 좁다는 뜻입니다.
          // 지도가 조용히 끊기는 대신 여기에 드러납니다.
          log.error("역 좌표 누락 — 역 마스터 확인 필요", {
            stations: [...new Set(missing)].slice(0, 10),
          });
        }

        log.debug("seoul 엔진 성공", {
          요청한역명: usedNames,
          표시할역명: { 출발: from.displayName, 도착: to.displayName },
          역명시도횟수: attempts,
          경로수: routes.length,
        });

        // 통한 이름을 기억해 둡니다. 다음 검색은 후보를 시험하지 않습니다.
        // 실패해도 무시합니다 — 학습이 안 되면 다음에 한 번 더 시험할 뿐입니다.
        void rememberApiName(from.lat, from.lng, usedNames.departure);
        void rememberApiName(to.lat, to.lng, usedNames.arrival);

        await logApiCall({
          provider: "seoul",
          endpoint: "/getShtrmPath",
          statusCode: 200,
          responseTimeMs: elapsedMs,
          cacheHit: false,
          userId,
        });

        if (routes.length > 0) {
          await writeCache(cacheKey, { routes, fetchedAt }).catch(() => {});
        }
      } catch (cause) {
        const { status, code, message, detail } = describeSeoulFailure(cause);
        await logApiCall({
          provider: "seoul",
          endpoint: "/getShtrmPath",
          statusCode: status,
          responseTimeMs: Date.now() - startedAt,
          errorMessage: `${code}: ${message}`.slice(0, 300),
          userId,
        });
        // 422 는 오류가 아니라 "이 구간은 지원하지 않음" 입니다. 화면에서
        // 오류 페이지로 보내지 말고 안내 문구로 처리하도록 코드를 함께 보냅니다.
        log[status >= 500 ? "error" : "info"]("서울시 공공 API 경로 없음/실패", {
          code,
          status,
          message,
          // 다음 후보가 있으면 여기서 멈추지 않고 넓혀 다시 찾습니다.
          다음후보: last ? "없음" : candidates[candidates.indexOf(engine) + 1],
        });
        failure = { status, code, message, detail };
        continue;
      }
    } else if (engine === "seoul-bus") {
      // --- 5b. 서울시 TOPIS (전체 · 버스) ---
      const op = BUS_OP[mode === "subway" ? "all" : mode];
      try {
        const { paths, elapsedMs, railLegs } = await searchBusPaths(op, departure, arrival);

        // 정류장 좌표 채우기가 여기서 일어납니다. 캐시에 없는 노선만 API 를 부릅니다.
        // 지하철 구간은 조회하지 않습니다(어댑터 주석 참고).
        //
        // ★ MAX_ROUTES 를 넘겨 **채우기 전에** 후보를 줄입니다.
        //   2026-09-16 실측: 서울시청→판교역 검색에서 경로가 20건 나왔고,
        //   노선 정류장 조회가 11회 나갔습니다. 어차피 5건만 보여줄 것이라
        //   나머지는 한도만 쓰고 버려집니다(1일 1,000회).
        routes = await toBusTransitRoutes(
          paths,
          { origin: departure, dest: arrival },
          MAX_ROUTES,
        );
        notice = railApproxNotice(railLegs);
        fetchedAt = new Date().toISOString();

        if (routes.length === 0) {
          // 성공으로 두면 화면에 빈 목록이 뜹니다.
          throw new BusEngineError("이 구간은 경로를 찾지 못했습니다.", "no_data", "");
        }

        log.debug("seoul-bus 엔진 성공", {
          오퍼레이션: op,
          경로수: routes.length,
          지하철구간: railLegs,
          구간수: routes.map((r) => r.segments.length),
        });

        await logApiCall({
          provider: "seoul",
          endpoint: `/${op}`,
          statusCode: 200,
          responseTimeMs: elapsedMs,
          cacheHit: false,
          userId,
        });

        await writeCache(cacheKey, { routes, fetchedAt }).catch(() => {});
      } catch (cause) {
        const { status, code, message, detail } = describeBusFailure(cause);
        await logApiCall({
          provider: "seoul",
          endpoint: `/${op}`,
          statusCode: status,
          responseTimeMs: Date.now() - startedAt,
          errorMessage: `${code}: ${message}`.slice(0, 300),
          userId,
        });
        log[status >= 500 ? "error" : "info"]("서울시 버스 API 경로 없음/실패", {
          code,
          status,
          message,
        });
        failure = { status, code, message, detail };
        continue;
      }
    } else {
      // --- 5c. ODsay (되돌림용) ---
      try {
        const { data, elapsedMs } = await searchPubTransPath({
          sx: departure.lng,
          sy: departure.lat,
          ex: arrival.lng,
          ey: arrival.lat,
          searchPathType: SEARCH_PATH_TYPE[mode],
        });

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
        failure = {
          status: 502,
          code: error.code,
          message: odsayErrorMessage(error),
          detail: error.detail,
        };
        continue;
      }
    }

    settled = true;
    break;
  }

  if (!settled) {
    const f = failure ?? {
      status: 502,
      code: "unknown",
      message: "경로를 불러오지 못했습니다.",
      detail: undefined,
    };
    done({ code: f.code }, f.status >= 500 ? "error" : "info");
    return fail(f.message, f.status, f.code, f.detail);
  }

  // 지하철로 먼저 찾다 실패해 버스로 넘어온 경우, 그 사실을 알려 줍니다.
  if (pair && engine !== "seoul") {
    notice = ["지하철 경로를 찾지 못해 전체로 넓혀 찾았습니다.", notice]
      .filter(Boolean)
      .join(" ");
  }


  // --- 6. 결과 정리 ---
  //
  // 캐시에서 꺼낸 것도 여기를 지납니다. 캐시에는 자르기 전 결과가 들어 있어서
  // (엔진 응답 그대로), 규칙을 바꾸면 캐시를 비우지 않아도 바로 반영됩니다.
  const foundCount = routes.length;
  routes = trimRoutes(routes);

  // --- 7. 검색 기록 (KPI 원천) ---
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

  const payload: RouteSearchResult & {
    searchId: string | null;
    mode: SearchMode;
    engine: RoutingEngine;
    notice: string | null;
  } = {
    routes,
    fromCache,
    fetchedAt,
    searchId,
    mode,
    engine,
    notice,
  };
  done({
    engine,
    찾은경로: foundCount,
    표시경로: routes.length,
    fromCache,
    searchId: searchId ? "기록됨" : "없음",
  });
  return NextResponse.json(payload);
}

/**
 * 역명 후보를 시험해 통하는 짝을 찾은 뒤, 그 이름으로 대안 경로 3건을 받습니다.
 *
 * 역 마스터에는 같은 자리에 이름이 여러 개 있고 경로 API 가 아는 것은 하나뿐입니다.
 * 어느 것인지는 규칙으로 정할 수 없어서(자세한 이유는 lib/routing/stations.ts),
 * 실제로 물어보고 통하는 것을 씁니다.
 *
 * 호출 수: 첫 조회 때만 후보 시험 몇 번 + 대안 2건. 학습된 뒤에는 1 + 2 = 3회입니다.
 */
async function searchWithNameCandidates(from: ResolvedEndpoint, to: ResolvedEndpoint) {
  const { pair, attempts } = await findWorkingNamePair({
    departureCandidates: from.apiNameCandidates,
    arrivalCandidates: to.apiNameCandidates,
  });

  const result = await searchSeoulAlternatives(pair);
  return { ...result, usedNames: pair, attempts };
}

/**
 * 버스 엔진 실패 → 화면이 쓸 수 있는 형태.
 *
 * describeSeoulFailure 와 같은 원칙입니다. 422 와 5xx 를 가릅니다.
 *   422 — 이 구간은 버스로 갈 수 없다. 아무도 잘못하지 않았다
 *   5xx — 우리가 고쳐야 할 문제 (활용신청 누락, 키 미설정, 제공처 장애)
 */
function describeBusFailure(cause: unknown): {
  status: number;
  code: string;
  message: string;
  detail?: string;
} {
  if (cause instanceof BusEngineError) {
    switch (cause.kind) {
      case "no_data":
        return {
          status: 422,
          code: "bus_no_route",
          message: cause.message || "이 구간은 버스 경로를 찾지 못했습니다.",
          detail: cause.message,
        };
      case "no_key":
        return {
          status: 500,
          code: "bus_no_key",
          message: "버스 경로 서비스가 설정되지 않았습니다.",
          detail: cause.message,
        };
      case "bad_key":
        // 401 입니다. 키가 틀린 게 아니라 그 서비스에 활용신청이 안 된 상태입니다.
        return {
          status: 500,
          code: "bus_not_registered",
          message: "버스 경로 서비스 이용 신청이 필요합니다.",
          detail: cause.message,
        };
      case "quota":
        return {
          status: 502,
          code: "bus_quota",
          message: "버스 경로 조회 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
          detail: cause.message,
        };
      default:
        return {
          status: 502,
          code: `bus_${cause.kind}`,
          message: "버스 경로를 불러오지 못했습니다.",
          detail: `${cause.code}: ${cause.message}`,
        };
    }
  }

  return {
    status: 502,
    code: "bus_unknown",
    message: "버스 경로를 불러오지 못했습니다.",
    detail: String(cause).slice(0, 300),
  };
}

/**
 * 서울시 공공 API 쪽 실패를 화면이 쓸 수 있는 형태로 옮깁니다.
 *
 * 핵심은 **422 와 5xx 를 가르는 것**입니다.
 *   422 — 이 구간은 지하철로 갈 수 없다. 사용자 잘못도 우리 잘못도 아니다
 *   5xx — 우리가 고쳐야 할 문제 (인증키 미설정, 제공처 장애)
 */
function describeSeoulFailure(cause: unknown): {
  status: number;
  code: string;
  message: string;
  detail?: string;
} {
  if (cause instanceof EndpointResolveError) {
    return {
      status: 422,
      code: "subway_no_station",
      message:
        cause.kind === "out_of_range"
          ? "출발지나 도착지 근처에 지하철역이 없습니다. '전체'로 검색해 보세요."
          : cause.message,
      detail: cause.message,
    };
  }

  if (cause instanceof SeoulEngineError) {
    switch (cause.kind) {
      case "no_data":
        return {
          status: 422,
          code: "subway_no_route",
          message: "이 구간은 지하철 경로를 찾지 못했습니다. '전체'로 검색해 보세요.",
          detail: cause.message,
        };
      case "no_key":
        return {
          status: 500,
          code: "subway_no_key",
          message: "지하철 경로 서비스가 설정되지 않았습니다.",
          detail: cause.message,
        };
      case "quota":
        return {
          status: 502,
          code: "subway_quota",
          message: "지하철 경로 조회 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
          detail: cause.message,
        };
      default:
        return {
          status: 502,
          code: `subway_${cause.kind}`,
          message: "지하철 경로를 불러오지 못했습니다.",
          detail: `${cause.code}: ${cause.message}`,
        };
    }
  }

  return {
    status: 502,
    code: "subway_unknown",
    message: "지하철 경로를 불러오지 못했습니다.",
    detail: String(cause).slice(0, 300),
  };
}

/**
 * searches → search_routes → search_route_segments 순으로 저장합니다.
 *
 * ★ withUser 로 감싸는 이유
 *
 * searches 의 RLS 정책이 이렇습니다.
 *   with check: (user_id is null) or (user_id = app_current_user_id())
 *
 * app_current_user_id() 는 current_setting('app.user_id') 를 읽습니다.
 * 그 값을 심지 않고 INSERT 하면 로그인 사용자의 기록이 전부 정책에 막힙니다
 * (2026-09-16 실제로 그랬습니다 — "new row violates row-level security policy").
 *
 * withUser 는 커넥션을 잡고 트랜잭션 안에서 SET LOCAL 로 심습니다. 풀로 값이
 * 새지 않고, 세 테이블이 한 트랜잭션으로 묶여 반쪽짜리 기록도 남지 않습니다.
 */
async function persistSearch(input: {
  userId: string | null;
  sessionId: string | null;
  departure: Place;
  arrival: Place;
  routes: TransitRoute[];
  durationMs: number;
  cacheHit: boolean;
}): Promise<string> {
  return withUser(input.userId, async (q) => {
    const [search] = await q<{ id: string }>(
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
      const [saved] = await q<{ id: string }>(
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
        await q(
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
  });
}
