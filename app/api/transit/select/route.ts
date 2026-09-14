import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * 사용자가 어떤 경로를 선택했는지 기록합니다.
 *
 * 기획서 KPI의 "검색 후 경로 선택률 40% 이상"을 계산하는 유일한 근거라,
 * 화면에서 경로를 열어볼 때 반드시 호출해야 합니다.
 */
export async function POST(request: Request) {
  let body: { searchId?: string; routeIndex?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { searchId, routeIndex } = body;
  if (!searchId || typeof routeIndex !== "number") {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  try {
    await query(
      `update searches
          set selected_route_id = (
            select id from search_routes
             where search_id = $1 and route_index = $2
             limit 1
          )
        where id = $1`,
      [searchId, routeIndex],
    );
    log.info("경로 선택 기록", { routeIndex });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    log.error("경로 선택 기록 실패", { message: String(cause).slice(0, 160) });
    // 기록 실패가 화면 이동을 막으면 안 됩니다.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
