/**
 * 서비스 지역 판정 — 1차는 수도권(서울·경기·인천)만 지원합니다.
 *
 * 부산 주소를 넣으면 ODsay가 결과를 주지 않거나 이상한 경로를 줍니다.
 * 그 전에 여기서 걸러 "현재 수도권만 지원"이라고 안내하는 편이
 * 사용자에게 훨씬 친절하고, ODsay 호출 한도도 아낍니다.
 *
 * 사각형으로 판정합니다. 행정구역 경계를 정확히 따르지는 않지만
 * 대전·대구·부산·강원 대부분을 걸러내기에는 충분합니다.
 * 정확도가 필요해지면 카카오 Local API의 지역 코드로 바꾸면 됩니다.
 */

export const CAPITAL_AREA_BOUNDS = {
  minLat: 36.9,   // 평택 남단 아래
  maxLat: 38.3,   // 연천 북단 위
  minLng: 126.0,  // 강화 서단 밖
  maxLng: 127.9,  // 여주·양평 동단 밖
} as const;

export function isInCapitalArea(lat: number, lng: number): boolean {
  return (
    lat >= CAPITAL_AREA_BOUNDS.minLat &&
    lat <= CAPITAL_AREA_BOUNDS.maxLat &&
    lng >= CAPITAL_AREA_BOUNDS.minLng &&
    lng <= CAPITAL_AREA_BOUNDS.maxLng
  );
}

export type RegionCheck =
  | { ok: true }
  | { ok: false; which: "departure" | "arrival" | "both"; message: string };

export function checkRegion(
  departure: { lat: number; lng: number },
  arrival: { lat: number; lng: number },
): RegionCheck {
  const depOk = isInCapitalArea(departure.lat, departure.lng);
  const arrOk = isInCapitalArea(arrival.lat, arrival.lng);

  if (depOk && arrOk) return { ok: true };

  const which = !depOk && !arrOk ? "both" : !depOk ? "departure" : "arrival";
  const subject =
    which === "both" ? "출발지와 도착지가" : which === "departure" ? "출발지가" : "도착지가";

  return {
    ok: false,
    which,
    message: `${subject} 서비스 지역을 벗어났습니다. MoveOne은 현재 수도권(서울·경기·인천)만 지원합니다.`,
  };
}
