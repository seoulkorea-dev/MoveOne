/**
 * ====================================================================
 * 버스 요금 — 수도권 통합환승 거리비례 계산
 * ====================================================================
 *
 * ★ 왜 계산해야 하나
 *   대중교통환승경로 API(15000414) 응답에는 **요금 필드가 없습니다.**
 *   지하철은 경로 API 가 totalCardCrg 를 주는데, 버스는 안 줍니다.
 *
 * ★ 왜 노선별 요금을 더하면 안 되나
 *   수도권은 통합환승 거리비례제입니다. 버스를 두 번 탔다고 기본요금이
 *   두 번 붙지 않습니다. **경로 전체를 한 번에** 계산합니다.
 *     기본요금(가장 비싼 수단 기준) + 기본거리 초과분의 거리비례 추가요금
 *
 * ★ 규칙 (서울시 '통합환승 할인제도' 안내 기준)
 *   - 단독 통행(한 번만 탑승): 버스는 균일요금. 거리비례 없음
 *   - 환승 통행: 기본거리 10km, **광역버스가 포함되면 30km**
 *                초과 시 5km 마다 100원 (성인 교통카드 기준)
 *   - 환승 최대 4회(5회 승차), 하차 후 30분 이내(심야 21~07시 60분)
 *     → 이 앱은 경로를 '제안'만 하므로 시간 제한은 계산에 넣지 않습니다.
 *
 * ★ 반영하지 않는 것 — 화면에 '기준요금' 이라고 표시하는 이유입니다
 *   조조할인(06:30 이전 첫 승차 20%), 청소년·어린이 요금,
 *   지자체별 예외, 노선별 특수요금.
 *
 * ★ 표를 고쳐야 할 때
 *   요금이 인상되면 아래 BASE_FARE 와 EXTRA_FARE 만 고치면 됩니다.
 *   다른 곳에 요금 숫자를 흩어 두지 않았습니다.
 */

/**
 * TOPIS routeType 별 성인 교통카드 기본요금(원).
 *
 * null 은 "값을 확정하지 못했다" 는 뜻입니다. 경로에 null 인 유형이 하나라도
 * 있으면 요금을 계산하지 않고 null 을 돌려줍니다 — 틀린 숫자를 보여주느니
 * "요금 정보 없음" 이 낫습니다.
 *
 * 출처
 *   서울 (2·3·4·5·6) : 서울시 물가정보 '버스' 공공요금표
 *   경기 (8)         : 직행좌석 3,200원 (2025-10 보도 기준)
 *
 * ★ 8(경기)에 대한 주의
 *   TOPIS 는 경기 면허 노선을 8 하나로 묶습니다. 직행좌석(광역)과 일반
 *   시내버스가 같은 값으로 옵니다. 지금은 직행좌석 기준이라, 경기 일반
 *   시내버스가 섞이면 실제보다 비싸게 나옵니다. 구분할 근거를 아직 못
 *   찾았습니다 — 찾으면 여기를 나눕니다.
 *
 * ★ 7(인천)은 값을 확인하지 못해 null 입니다.
 *   확인되면 숫자만 넣으면 그때부터 인천 노선도 요금이 나옵니다.
 */
export const BASE_FARE: Readonly<Record<number, number | null>> = {
  1: null, // 공항 — 통합환승 대상이 아닌 노선이 많아 확인 전까지 비워 둡니다
  2: 1200, // 마을
  3: 1500, // 간선
  4: 1500, // 지선
  5: 1400, // 순환
  6: 3000, // 광역
  7: null, // 인천 ← 확인 필요
  8: 3200, // 경기 (직행좌석 기준)
};

/** 기본거리 초과분에 붙는 추가요금(원)과 그 단위 거리(km). */
export const EXTRA_FARE = 100;
export const EXTRA_STEP_KM = 5;

/** 일반 기본거리(km). */
export const FREE_KM = 10;
/** 광역버스가 포함된 환승 통행의 기본거리(km). */
export const FREE_KM_WIDE = 30;

/** 광역 계열로 보는 routeType. 기본거리 30km 가 적용됩니다. */
const WIDE_AREA_TYPES = new Set([6, 8]);

export type FareRide = {
  /** TOPIS routeType. 모르면 null */
  routeType: number | null;
};

/**
 * 경로 전체의 성인 교통카드 기준요금(원).
 * 계산할 수 없으면 null — 화면은 "요금 정보 없음" 으로 표시합니다.
 *
 * @param rides        탑승 구간들 (도보 제외)
 * @param rideDistanceM 탑승 구간 거리 합계(m). 도보는 빼고 넣으세요.
 */
export function computeBusFare(rides: FareRide[], rideDistanceM: number): number | null {
  if (rides.length === 0) return null;

  const bases: number[] = [];
  for (const ride of rides) {
    const fare = ride.routeType === null ? null : (BASE_FARE[ride.routeType] ?? null);
    // 하나라도 모르면 합계도 모르는 것입니다.
    if (fare === null) return null;
    bases.push(fare);
  }

  // 기본요금은 '가장 비싼 수단' 기준입니다. 더하는 것이 아닙니다.
  const base = Math.max(...bases);

  // 단독 통행은 버스 균일요금입니다. 거리비례가 붙지 않습니다.
  if (rides.length === 1) return base;

  const wide = rides.some((r) => r.routeType !== null && WIDE_AREA_TYPES.has(r.routeType));
  const freeKm = wide ? FREE_KM_WIDE : FREE_KM;

  const km = rideDistanceM / 1000;
  if (km <= freeKm) return base;

  const steps = Math.ceil((km - freeKm) / EXTRA_STEP_KM);
  return base + steps * EXTRA_FARE;
}
