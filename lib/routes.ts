/**
 * 화면이 사용하는 도메인 타입.
 *
 * ODsay 응답 형식을 화면에서 직접 쓰지 않는 이유:
 *   1. ODsay가 필드를 바꾸면 화면이 전부 깨진다
 *   2. 2차에서 따릉이·택시 구간을 끼워넣을 때, 이 타입만 확장하면 된다
 *   3. 다른 교통 API로 갈아탈 여지가 남는다
 *
 * 이 파일이 MoveOne에서 가장 오래 살아남을 코드입니다.
 * ODsay 의존은 lib/odsay/ 안에만 가둡니다.
 */

/** 이동수단. 2차에서 'bike' | 'taxi' 가 실제로 쓰이기 시작합니다. */
export type SegmentType = "walk" | "subway" | "bus" | "bike" | "taxi";

export const SEGMENT_LABEL: Record<SegmentType, string> = {
  walk: "도보",
  subway: "지하철",
  bus: "버스",
  bike: "자전거",
  taxi: "택시",
};

/** 구간이 지나는 정차역. 지도 폴리라인과 상세 타임라인이 같이 씁니다. */
export type RouteStop = {
  name?: string;
  lat: number;
  lng: number;
};

/** 지도에 그릴 좌표열 하나. 노선 한 구간에 해당합니다. */
export type LanePath = { lat: number; lng: number }[];

export type Place = {
  lat: number;
  lng: number;
  address?: string;
  name?: string;
};

export type RouteSegment = {
  index: number;
  type: SegmentType;
  /** 노선 이름. "신분당선", "간선 472". 도보 구간은 없음 */
  laneName?: string;
  startName?: string;
  endName?: string;
  start?: { lat: number; lng: number };
  end?: { lat: number; lng: number };
  /** 분 */
  durationMin?: number;
  /** m */
  distanceM?: number;
  stationCount?: number;
  /**
   * 이 구간이 지나는 정차역 목록 (승차역 → 하차역).
   * ODsay 응답의 passStopList 에 이미 좌표가 들어 있어 추가 호출이 없습니다.
   * 진짜 선로 곡선이 아니라 역을 이은 선이지만, 경로를 보여주기에는 충분합니다.
   * 곡선이 필요해지면 ODsay loadLane(mapObj) 을 붙입니다.
   */
  stops?: RouteStop[];
  /** 2차에서 실시간 도착정보를 붙일 때 쓰는 열쇠 */
  odsayStartStationId?: string;
  odsayEndStationId?: string;
};

/** 정렬 기준. 기획서 수락기준의 네 가지와 1:1로 대응합니다. */
export type RouteSortKey = "fastest" | "cheapest" | "fewest_transfers" | "least_walk";

export const SORT_LABEL: Record<RouteSortKey, string> = {
  fastest: "빠른 순",
  cheapest: "저렴한 순",
  fewest_transfers: "환승 적은 순",
  least_walk: "도보 적은 순",
};

export type TransitRoute = {
  index: number;
  /** 분 */
  totalTimeMin: number;
  /** 원. ODsay가 요금을 주지 않는 구간이 있어 null 가능 */
  totalFare: number | null;
  transferCount: number;
  /** m */
  totalWalkM: number;
  totalDistanceM: number | null;
  segments: RouteSegment[];
  /** ODsay pathType 원본 (1:지하철 2:버스 3:복합). 디버깅용 */
  odsayPathType?: number;
  /**
   * 노선 그래픽 조회 열쇠. ODsay 가이드 2단계(loadLane)에 넘깁니다.
   * 이게 있으면 지도에 실제 선형을, 없으면 정차역을 이은 선을 그립니다.
   */
  mapObj?: string;
};

export type RouteSearchResult = {
  routes: TransitRoute[];
  /** 이 결과가 캐시에서 나왔는지. 화면에 "방금 조회" 여부를 표시할 때 씁니다 */
  fromCache: boolean;
  /** 데이터 기준 시각 — 기획서 수락기준 "데이터 기준 시각 표시" 항목 */
  fetchedAt: string;
};

/**
 * 정렬. ODsay가 준 순서를 그대로 쓰지 않고 우리가 다시 정렬합니다.
 * 동점일 때 순서가 흔들리지 않도록 2차 기준을 둡니다.
 */
export function sortRoutes(routes: TransitRoute[], key: RouteSortKey): TransitRoute[] {
  const byFare = (r: TransitRoute) => r.totalFare ?? Number.MAX_SAFE_INTEGER;

  return [...routes].sort((a, b) => {
    switch (key) {
      case "fastest":
        return a.totalTimeMin - b.totalTimeMin || byFare(a) - byFare(b);
      case "cheapest":
        return byFare(a) - byFare(b) || a.totalTimeMin - b.totalTimeMin;
      case "fewest_transfers":
        return a.transferCount - b.transferCount || a.totalTimeMin - b.totalTimeMin;
      case "least_walk":
        return a.totalWalkM - b.totalWalkM || a.totalTimeMin - b.totalTimeMin;
      default:
        return a.index - b.index;
    }
  });
}

/** "1시간 5분" / "45분" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** "1,900원" / "요금 정보 없음" */
export function formatFare(fare: number | null): string {
  if (fare === null || fare === undefined) return "요금 정보 없음";
  return `${fare.toLocaleString("ko-KR")}원`;
}

/** "800m" / "1.2km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
