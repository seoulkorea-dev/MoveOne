import {
  findStationCandidates,
  findStationByName,
  normalizeStationName,
} from "./stations";

/**
 * 검색 화면이 넘겨준 출발/도착 지점을 seoul 엔진이 받을 수 있는 "역명"으로 바꿉니다.
 *
 * 입력은 두 가지 모두 허용합니다.
 *   - 좌표 (카카오 장소검색 결과)  -> 최근접역
 *   - 역명 문자열                  -> 역 마스터에서 확인만
 *
 * ODsay 엔진에는 이 단계가 필요 없습니다. seoul 엔진 경로에서만 호출하세요.
 *
 * ★ 이름을 후보로 들고 다니는 이유
 *
 * 역 마스터에는 같은 자리에 이름이 여러 개 있고, 그중 경로 API 가 아는 것은
 * 하나뿐입니다. 어느 것인지는 규칙으로 정할 수 없습니다.
 *
 *   서울역 위치 → "서울"(빈 경로) · "서울역"(성공) · "서울역(경의선)"
 *   사당 위치   → "사당"(성공) · "사당역"(code 10 · 그런 역 없음)
 *
 * "역"을 떼는 규칙도 붙이는 규칙도 반례가 있습니다. 그래서 규칙을 만들지 않고
 * **그 자리에 실제로 있는 이름들**을 후보로 넘겨 순서대로 시도합니다.
 * 통한 이름은 subway_station.api_name 에 기억되어 다음부터 1순위가 됩니다.
 *
 *   apiNameCandidates — API 호출용 후보 (순서 있음)
 *   displayName       — 화면 표시용. 가장 가까운 역의 마스터 이름
 */

export type EndpointInput = {
  /** 사용자가 고른 장소 이름 ("강남 스타벅스"). 표시용. */
  label?: string;
  lat?: number;
  lng?: number;
  /** 역명을 직접 입력받은 경우 */
  stationName?: string;
};

export type ResolvedEndpoint = {
  /**
   * 경로 API 에 시도할 역명 후보. 순서대로 씁니다.
   * 첫 번째는 학습된 이름이거나 가장 가까운 역의 이름입니다.
   */
  apiNameCandidates: string[];
  /** 화면에 보여줄 이름 (마스터 원본). "서울역", "왕십리(성동구청)" */
  displayName: string;
  lineName: string;
  lat: number;
  lng: number;
  /** 좌표에서 역까지 걸어야 하는 거리(m). 역명을 직접 준 경우 0. */
  walkDistanceM: number;
  /** 화면에 "가장 가까운 OO역 기준" 이라고 알려줄지 여부 */
  substituted: boolean;
  label: string;
};

export class EndpointResolveError extends Error {
  constructor(
    message: string,
    readonly kind: "out_of_range" | "unknown_station",
  ) {
    super(message);
    this.name = "EndpointResolveError";
  }
}

/** 이 반경을 넘으면 지하철로 갈 수 없는 위치로 봅니다. */
const MAX_WALK_KM = 2.0;

export async function resolveEndpoint(input: EndpointInput): Promise<ResolvedEndpoint> {
  if (input.stationName) {
    const st = await findStationByName(input.stationName);
    if (!st) {
      throw new EndpointResolveError(
        `"${input.stationName}" 은(는) 역 목록에 없습니다.`,
        "unknown_station",
      );
    }
    const base = normalizeStationName(st.stationName);
    return {
      apiNameCandidates: [...new Set([st.stationName, base, `${base}역`])].filter(Boolean),
      displayName: st.stationName,
      lineName: st.lineName,
      lat: st.lat,
      lng: st.lng,
      walkDistanceM: 0,
      substituted:
        normalizeStationName(input.stationName) !== normalizeStationName(st.stationName),
      label: input.label ?? st.stationName,
    };
  }

  if (typeof input.lat === "number" && typeof input.lng === "number") {
    const hit = await findStationCandidates(input.lat, input.lng, MAX_WALK_KM);
    if (!hit) {
      throw new EndpointResolveError(
        `반경 ${MAX_WALK_KM}km 안에 지하철역이 없습니다.`,
        "out_of_range",
      );
    }
    return {
      apiNameCandidates: hit.candidates,
      displayName: hit.nearest.stationName,
      lineName: hit.nearest.lineName,
      lat: hit.nearest.lat,
      lng: hit.nearest.lng,
      walkDistanceM: Math.round(hit.distanceKm * 1000),
      substituted: true,
      label: input.label ?? hit.nearest.stationName,
    };
  }

  throw new EndpointResolveError("좌표나 역명 중 하나는 있어야 합니다.", "unknown_station");
}
