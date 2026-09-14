import { NextResponse } from "next/server";
import { logApiCall } from "@/lib/cache";
import type { Place } from "@/lib/routes";

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

  const restKey = process.env.KAKAO_REST_API_KEY;
  if (!restKey) {
    return NextResponse.json(
      { error: { message: "KAKAO_REST_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요." } },
      { status: 500 },
    );
  }

  const url = new URL(KAKAO_KEYWORD_URL);
  url.searchParams.set("query", q);
  url.searchParams.set("size", "8");
  // 수도권만 지원하므로 서울 시청을 중심으로 가중치를 둡니다.
  url.searchParams.set("x", "126.9780");
  url.searchParams.set("y", "37.5665");
  url.searchParams.set("radius", "70000");

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
      return NextResponse.json(
        { error: { message: "장소 검색에 실패했습니다." } },
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

    return NextResponse.json({ places });
  } catch (cause) {
    console.error("장소 검색 실패:", cause);
    return NextResponse.json(
      { error: { message: "장소 검색 중 오류가 발생했습니다." } },
      { status: 502 },
    );
  }
}
