import { NextResponse } from "next/server";
import { LANE_TTL_MINUTES, laneCacheKey, logApiCall, readRawCache, writeRawCache } from "@/lib/cache";
import { OdsayError, loadLane, odsayErrorMessage } from "@/lib/odsay/client";
import { normalizeLanes } from "@/lib/odsay/normalize";
import type { LanePath } from "@/lib/routes";
import { getSession } from "@/lib/session";
import { log, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 노선 그래픽 조회 — ODsay 가이드 2단계(loadLane).
 *
 * 경로 상세 화면에서만 부릅니다. 검색 결과 전체에 대해 미리 부르면
 * 경로 개수만큼 호출이 늘어나는데, 사용자는 보통 하나만 열어봅니다.
 *
 * 선형은 열차 시간표와 달리 거의 바뀌지 않아 24시간 캐시합니다.
 * 같은 경로를 다시 열면 ODsay를 부르지 않습니다.
 *
 * 로그인 사용자만 부를 수 있게 막아 둡니다. 열어두면 남의 키로
 * ODsay 한도를 태우는 공개 프록시가 됩니다.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  }

  const mapObj = new URL(request.url).searchParams.get("mapObj")?.trim();
  if (!mapObj) {
    return NextResponse.json(
      { error: { message: "mapObj가 없습니다.", code: "missing_map_obj" } },
      { status: 400 },
    );
  }

  const done = startTimer("api.transit.lane");
  const cacheKey = laneCacheKey(mapObj);
  const started = Date.now();

  const cached = await readRawCache<{ lanes: LanePath[] }>(cacheKey).catch(() => null);
  if (cached) {
    log.debug("노선 캐시 적중 — loadLane 호출 없음", { lanes: cached.lanes.length });
    await logApiCall({
      provider: "odsay",
      endpoint: "/v1/api/loadLane",
      cacheHit: true,
      responseTimeMs: Date.now() - started,
      userId: session.uid,
    });
    done({ lanes: cached.lanes.length, fromCache: true });
    return NextResponse.json({ lanes: cached.lanes, fromCache: true });
  }

  try {
    const { data, elapsedMs } = await loadLane(mapObj);
    const lanes = normalizeLanes(data);

    await logApiCall({
      provider: "odsay",
      endpoint: "/v1/api/loadLane",
      statusCode: 200,
      responseTimeMs: elapsedMs,
      cacheHit: false,
      userId: session.uid,
    });

    if (lanes.length > 0) {
      await writeRawCache(cacheKey, { lanes }, LANE_TTL_MINUTES).catch(() => {});
    }

    done({ lanes: lanes.length, points: lanes.reduce((n, l) => n + l.length, 0) });
    return NextResponse.json({ lanes, fromCache: false });
  } catch (cause) {
    const error = cause instanceof OdsayError ? cause : new OdsayError("unknown", "");

    await logApiCall({
      provider: "odsay",
      endpoint: "/v1/api/loadLane",
      statusCode: error.status,
      responseTimeMs: Date.now() - started,
      errorMessage: `${error.code}: ${error.message}`,
      userId: session.uid,
    });

    log.error("loadLane 실패", {
      code: error.code,
      status: error.status,
      message: error.message,
      detail: error.detail,
    });
    done({ code: error.code }, "error");

    // 지도는 없어도 되는 것이라, 실패해도 화면은 정차역 좌표로 그립니다.
    return NextResponse.json(
      { error: { message: odsayErrorMessage(error), code: error.code } },
      { status: 502 },
    );
  }
}
