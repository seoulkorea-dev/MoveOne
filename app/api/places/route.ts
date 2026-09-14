import { NextResponse } from "next/server";
import { logApiCall } from "@/lib/cache";
import { CAPITAL_AREA_BOUNDS } from "@/lib/region";
import type { Place } from "@/lib/routes";
import { log, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 장소 검색 (주소·역명·건물명 → 좌표).
 *
 * 카카오 Local API를 서버에서 호출합니다. REST API 키는 브라우저에
 * 내보내면 안 되므로 여기서만 씁니다.
 * (지도 표시에 쓰는 JavaScript 키는 도메인으로 보호되므로 브라우저에
 *  나가도 됩니다 — 두 키의 성격이 다릅니다.)
 */

const KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

type KakaoDocument = {
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string; // 경도
  y?: string; // 위도
};

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ places: [] });
  }

  // 검색어는 debug 에서만 남깁니다. 운영 레벨(error)에서는 사라집니다.
  const done = startTimer("api.places", { q });

  const restKey = process.env.KAKAO_REST_API_KEY;
  if (!restKey) {
    log.error("KAKAO_REST_API_KEY 없음 — 장소 검색 불가");
    return NextResponse.json(
      { error: { message: "KAKAO_REST_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요." } },
      { status: 500 },
    );
  }

  const url = new URL(KAKAO_KEYWORD_URL);
  url.searchParams.set("query", q);
  url.searchParams.set("size", "10");
  url.searchParams.set("sort", "accuracy");
  /*
   * 검색 범위를 서비스 범위와 같게 맞춥니다.
   *
   * 예전에는 서울시청 중심 radius=70000 을 썼는데, 카카오의 radius 는
   * **최대 20000(20km)** 이라 400 을 돌려받았습니다. 20000 으로 줄이면
   * 이번엔 수원·인천이 검색되지 않습니다 — 시청에서 20km 를 넘습니다.
   *
   * rect 는 사각형이라 반경 제한이 없고, lib/region.ts 의 수도권 경계를
   * 그대로 쓰면 "검색되는 곳 = 경로를 찾아줄 수 있는 곳" 이 됩니다.
   * 형식: 좌측하단 경도,위도, 우측상단 경도,위도
   */
  const { minLat, maxLat, minLng, maxLng } = CAPITAL_AREA_BOUNDS;
  url.searchParams.set("rect", `${minLng},${minLat},${maxLng},${maxLat}`);

  const started = Date.now();

  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey}` },
      cache: "no-store",
    });

    await logApiCall({
      provider: "kakao",
      endpoint: "/v2/local/search/keyword.json",
      statusCode: response.status,
      responseTimeMs: Date.now() - started,
    });

    if (!response.ok) {
      // 카카오는 400 과 함께 이유를 본문에 담아 보냅니다.
      // 이걸 버리면 "왜 400 인지" 를 매번 추측하게 됩니다.
      const body = await response.text().catch(() => "");
      const reason = body.slice(0, 300);

      log.error("카카오 장소 검색 오류", { status: response.status, body: reason });
      done({ status: response.status }, "error");

      return NextResponse.json(
        {
          error: {
            message: "장소 검색에 실패했습니다.",
            // 개발 중에만 원인을 화면까지 올려 보냅니다.
            detail: process.env.NODE_ENV === "production" ? undefined : reason,
          },
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { documents?: KakaoDocument[] };

    const places: Place[] = (data.documents ?? [])
      // 반환 타입을 명시합니다. satisfies 로 두면 name 이 "필수인데 undefined 가능"한
      // 타입이 되어 아래 filter 의 타입 술어가 Place 와 어긋납니다.
      .map((doc): Place | null => {
        const lat = Number(doc.y);
        const lng = Number(doc.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          lat,
          lng,
          name: doc.place_name,
          address: doc.road_address_name || doc.address_name,
        };
      })
      .filter((p): p is Place => p !== null);

    done({ count: places.length });
    return NextResponse.json({ places });
  } catch (cause) {
    log.error("장소 검색 예외", { message: String(cause).slice(0, 160) });
    return NextResponse.json(
      { error: { message: "장소 검색 중 오류가 발생했습니다." } },
      { status: 502 },
    );
  }
}
