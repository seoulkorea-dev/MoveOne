import "server-only";
import { log } from "@/lib/logger";
import type { Place } from "@/lib/routes";
import { findNearestStation, normalizeStationName } from "@/lib/routing/stations";

/**
 * "역 ↔ 역" 판정.
 *
 * ★ 무엇을 위한 것인가
 *   '전체' 로 검색했는데 출발·도착이 둘 다 지하철역이면, 사람이 기대하는 답은
 *   지하철 경로입니다. 그런데 TOPIS 환승경로 API 는 버스를 우선해서,
 *   "서울역 → 사당" 같은 구간에도 버스를 두 번 갈아타는 경로를 앞에 내놓습니다.
 *   그래서 역↔역이면 지하철 엔진을 **먼저** 부릅니다.
 *
 * ★ 판정을 이름만으로 하지 않는 이유
 *   사용자가 고르는 것은 카카오 장소이고, 이름이 제각각입니다.
 *     "서울역"        — 이름에 역이 있고 좌표도 역
 *     "사당역 4호선"  — 이름에 역이 있지만 뒤에 다른 말이 붙음
 *     "서울역 롯데리아" — 이름에 역이 있지만 지하철역이 아님
 *     "광화문"        — 이름에 역이 없지만 광화문역이 코앞
 *   이름 규칙만 쓰면 위 네 가지를 다 틀립니다. **좌표를 먼저** 봅니다.
 *
 * ★ 두 갈래로 판정합니다
 *   1) 좌표가 역에서 SNAP_M 안 — 이름과 무관하게 역으로 봅니다.
 *      역 출입구·승강장 좌표는 역 대표 좌표에서 이 정도 안에 들어옵니다.
 *   2) 이름에 "역" 이 들어 있고, NEAR_M 안의 역 이름이 그 이름에 포함됨.
 *      "사당역 4호선" 을 살리는 규칙입니다. 이름 대조가 있으므로
 *      "서울역 롯데리아"(롯데리아가 역에서 멀면) 는 1)에서도 2)에서도 안 걸립니다.
 *
 * 둘 다 실패하면 역이 아닙니다. 그러면 평소대로 버스 엔진이 먼저입니다.
 */

/** 이 거리 안이면 이름을 안 보고 역으로 봅니다. */
const SNAP_M = 150;
/** 이름에 "역" 이 있을 때 인정하는 최대 거리. 출구가 멀리 떨어진 큰 역을 위한 여유입니다. */
const NEAR_M = 700;

export type StationHit = {
  /** 역 이름 (마스터 원본) */
  stationName: string;
  lineName: string;
  distanceM: number;
  /** 어떤 규칙으로 잡혔는지. 로그로 판정을 되짚을 때 씁니다. */
  by: "coord" | "name";
};

export async function stationAt(place: Place): Promise<StationHit | null> {
  const hit = await findNearestStation(place.lat, place.lng, NEAR_M / 1000);
  if (!hit) return null;

  const distanceM = Math.round(hit.distanceKm * 1000);

  if (distanceM <= SNAP_M) {
    return {
      stationName: hit.station.stationName,
      lineName: hit.station.lineName,
      distanceM,
      by: "coord",
    };
  }

  const label = place.name ?? place.address ?? "";
  if (!label.includes("역")) return null;

  // 정규화해서 비교합니다. "사당역 4호선" → "사당4호선", 역 이름 "사당" → "사당".
  const normalizedLabel = normalizeStationName(label);
  const normalizedStation = normalizeStationName(hit.station.stationName);
  if (normalizedStation.length === 0 || !normalizedLabel.includes(normalizedStation)) {
    return null;
  }

  return {
    stationName: hit.station.stationName,
    lineName: hit.station.lineName,
    distanceM,
    by: "name",
  };
}

/**
 * 출발·도착이 모두 역인가.
 *
 * 실패해도 예외를 던지지 않습니다. DB 가 잠깐 안 되더라도 검색 자체는
 * 평소 경로(버스 엔진)로 굴러가야 합니다.
 */
export async function stationToStation(
  departure: Place,
  arrival: Place,
): Promise<{ from: StationHit; to: StationHit } | null> {
  try {
    const [from, to] = await Promise.all([stationAt(departure), stationAt(arrival)]);
    if (!from || !to) return null;

    // 같은 역이면 지하철로 갈 것이 없습니다.
    if (normalizeStationName(from.stationName) === normalizeStationName(to.stationName)) {
      return null;
    }

    log.debug("역↔역 판정", {
      출발: `${from.stationName}(${from.distanceM}m, ${from.by})`,
      도착: `${to.stationName}(${to.distanceM}m, ${to.by})`,
    });
    return { from, to };
  } catch (cause) {
    log.error("역↔역 판정 실패 — 평소 경로로 진행", {
      message: String(cause).slice(0, 160),
    });
    return null;
  }
}
