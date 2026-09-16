import { query } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * 서울·수도권 역 마스터 조회.
 *
 * 데이터 출처: 국가철도공단 도시광역철도 역사정보 (data.go.kr 15013205).
 * 서울교통공사 1~8호선 좌표(15099316)도 같은 테이블에 `source` 로 구분해 둡니다.
 *
 * 경로 API 는 역을 **한글 역명**으로만 알려주므로, 지도에 선을 그리려면
 * 역명 → 좌표 변환이 필요합니다. 이 파일이 그 변환을 맡습니다.
 */

export type Station = {
  stationName: string;
  lineName: string;
  extStationCode: string | null;
  lat: number;
  lng: number;
};

/**
 * 역명 표기 흔들림 흡수.
 *   1) 괄호와 그 안의 내용 제거   "총신대입구(이수)" -> "총신대입구"
 *   2) 모든 공백 제거
 *   3) 끝의 "역" 제거            "서울역" -> "서울", "판교역" -> "판교"
 *
 * 세 규칙 모두 실제 데이터에 필요했습니다. 국가철도공단 데이터는
 * "왕십리(성동구청)", "마곡나루(서울식물원)", "선릉역" 처럼 제각각입니다.
 *
 * DB 의 name_norm 생성 컬럼과 **같은 규칙**이어야 합니다 (마이그레이션 주석 참고).
 */
export function normalizeStationName(raw: string): string {
  let s = (raw ?? "").trim();
  s = s.replace(/\(.*?\)/g, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/역$/, "");
  return s;
}

/** 괄호 안 별칭도 검색어로 쓸 수 있게 뽑습니다. "총신대입구(이수)" -> ["총신대입구","이수"] */
export function nameVariants(raw: string): string[] {
  const out = new Set<string>();
  out.add(normalizeStationName(raw));
  const m = (raw ?? "").match(/\((.*?)\)/);
  if (m?.[1]) out.add(normalizeStationName(m[1]));
  return [...out].filter(Boolean);
}

const EARTH_R_KM = 6371;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(s));
}

function toStation(r: Record<string, unknown>): Station {
  return {
    stationName: String(r.station_name),
    lineName: String(r.line_name),
    extStationCode:
      r.ext_station_code === undefined || r.ext_station_code === null
        ? null
        : String(r.ext_station_code),
    lat: Number(r.lat),
    lng: Number(r.lng),
  };
}

/* ------------------------------------------------------------------
   경로 API 가 아는 역명 찾기

   역 마스터에는 **같은 자리에 이름이 여러 개** 들어 있습니다.

     서울역 위치 → "서울"(sto, 인천국제공항선) · "서울역"(kric 1·4호선)
                  · "서울역(경의선)"(kric 경의중앙선)

   이 중 경로 API 가 아는 이름은 "서울역" 하나뿐입니다. "서울" 로 물으면
   오류도 없이 **빈 경로**를 돌려줍니다(code 00 · paths []). 조용히 실패합니다.

   그래서 이름을 문자열 조작으로 지어내지 않고, **그 자리에 실제로 존재하는
   역명들을 후보로** 씁니다. 정답이 이미 마스터에 있기 때문입니다.
   한 번 통한 이름은 api_name 에 적어 두고 다음부터 바로 씁니다.
   ------------------------------------------------------------------ */

/** 같은 역으로 볼 반경. 환승역의 노선별 좌표 차이를 흡수할 정도면 됩니다. */
const SAME_PLACE_KM = 0.3;

export type StationCandidates = {
  /** 가장 가까운 역 (화면 표시용 기준) */
  nearest: Station;
  distanceKm: number;
  /** 이미 학습된 API 역명. 있으면 이것부터 씁니다. */
  knownApiName: string | null;
  /** API 에 시도해 볼 이름들. 거리순 + 파생형. 중복 없음. */
  candidates: string[];
};

/**
 * 좌표에서 가장 가까운 역과, 그 자리의 모든 역명 후보.
 *
 * maxKm 를 넘으면 null — 지하철로 갈 수 없는 위치입니다.
 */
export async function findStationCandidates(
  lat: number,
  lng: number,
  maxKm = 2.0,
): Promise<StationCandidates | null> {
  const dLat = maxKm / 111;
  const dLng = maxKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);

  const rows = await query<Record<string, unknown>>(
    `select station_name, line_name, ext_station_code, lat, lng, api_name
       from subway_station
      where lat between $1 and $2 and lng between $3 and $4`,
    [lat - dLat, lat + dLat, lng - dLng, lng + dLng],
  );

  const scored = rows
    .map((r) => ({
      station: toStation(r),
      apiName: r.api_name === undefined || r.api_name === null ? null : String(r.api_name),
      distanceKm: haversineKm(lat, lng, Number(r.lat), Number(r.lng)),
    }))
    .filter((x) => x.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (scored.length === 0) {
    log.debug("최근접역 없음", { maxKm });
    return null;
  }

  const nearest = scored[0];

  // 같은 자리로 볼 행들만 모읍니다. 400m 떨어진 다른 역까지 후보에 넣으면
  // 엉뚱한 역으로 경로를 찾아 놓고 성공한 줄 알게 됩니다.
  const samePlace = scored.filter(
    (x) =>
      haversineKm(nearest.station.lat, nearest.station.lng, x.station.lat, x.station.lng) <=
      SAME_PLACE_KM,
  );

  const knownApiName = samePlace.find((x) => x.apiName)?.apiName ?? null;

  const candidates: string[] = [];
  const push = (name: string | null | undefined) => {
    const v = (name ?? "").trim();
    if (v && !candidates.includes(v)) candidates.push(v);
  };

  // 1순위: 학습된 이름
  push(knownApiName);
  // 2순위: 그 자리에 실제로 있는 역명들 (가까운 순)
  for (const x of samePlace) push(x.station.stationName);
  // 3순위: 파생형. 마스터에 없는 표기를 API 가 쓰는 경우의 대비입니다.
  for (const x of samePlace) {
    const raw = x.station.stationName;
    push(normalizeStationName(raw));
    push(`${normalizeStationName(raw)}역`);
  }

  return {
    nearest: nearest.station,
    distanceKm: nearest.distanceKm,
    knownApiName,
    // 한 역당 시도 횟수를 묶어 둡니다. 너무 많으면 호출만 낭비합니다.
    candidates: candidates.slice(0, 4),
  };
}

/**
 * 통한 역명을 기억합니다. 다음 검색부터는 후보를 시험하지 않습니다.
 *
 * 실패해도 무시합니다 — 학습이 안 되면 다음에 한 번 더 시험할 뿐이고,
 * 그것 때문에 사용자의 검색 결과를 막을 이유가 없습니다.
 */
export async function rememberApiName(
  lat: number,
  lng: number,
  apiName: string,
): Promise<void> {
  const d = SAME_PLACE_KM / 111;
  const dLng = SAME_PLACE_KM / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  try {
    await query(
      `update subway_station set api_name = $1
        where lat between $2 and $3 and lng between $4 and $5
          and (api_name is distinct from $1)`,
      [apiName, lat - d, lat + d, lng - dLng, lng + dLng],
    );
    log.debug("API 역명 학습", { apiName });
  } catch (cause) {
    log.debug("API 역명 학습 실패 — 무시합니다", { message: String(cause).slice(0, 120) });
  }
}

/** 좌표에서 가장 가까운 역. maxKm 를 넘으면 null — 지하철로 갈 수 없는 위치입니다. */
export async function findNearestStation(
  lat: number,
  lng: number,
  maxKm = 2.0,
): Promise<{ station: Station; distanceKm: number } | null> {
  // 좌표 박스로 후보를 먼저 줄인 뒤 정확한 거리를 계산합니다.
  const dLat = maxKm / 111;
  const dLng = maxKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);

  const rows = await query<Record<string, unknown>>(
    `select station_name, line_name, ext_station_code, lat, lng
       from subway_station
      where lat between $1 and $2 and lng between $3 and $4`,
    [lat - dLat, lat + dLat, lng - dLng, lng + dLng],
  );

  let best: { station: Station; distanceKm: number } | null = null;
  for (const r of rows) {
    const st = toStation(r);
    const d = haversineKm(lat, lng, st.lat, st.lng);
    if (d <= maxKm && (!best || d < best.distanceKm)) best = { station: st, distanceKm: d };
  }
  if (!best) log.debug("최근접역 없음", { maxKm });
  return best;
}

/**
 * 역명으로 조회. 본명(name_norm)과 괄호 안 별칭(name_alias) 양쪽을 봅니다.
 * 사용자는 "총신대입구" 대신 "이수" 로 검색하는 일이 많습니다.
 */
export async function findStationByName(name: string): Promise<Station | null> {
  for (const v of nameVariants(name)) {
    const rows = await query<Record<string, unknown>>(
      `select station_name, line_name, ext_station_code, lat, lng
         from subway_station
        where name_norm = $1 or name_alias = $1
        limit 1`,
      [v],
    );
    if (rows.length > 0) return toStation(rows[0]);
  }
  return null;
}

/* ------------------------------------------------------------------
   동명이역 처리

   수도권에 이름만 같고 실제로는 다른 역이 있습니다. 확인된 것은 한 곳입니다.

     양평 — 5호선 양평역(서울 영등포)  vs  경의중앙선 양평역(경기 양평)
            경도차 0.6도 ≈ 53km

   아무거나 집으면 지도에 선이 53km 튑니다. 노선명으로는 구분할 수 없습니다.
   역 마스터는 "분당선"/"수인선" 으로 나뉘어 있는데 경로 API 는 "수인분당선"
   이라고 불러서, 이름 매칭이 어긋나기 때문입니다.

   그래서 **경로의 연속성**으로 고릅니다. 경로는 이어진 역들의 나열이므로,
   애매한 역은 이미 확정된 이웃 역에 가장 가까운 후보가 정답입니다.
   양평뿐 아니라 앞으로 생길 동명이역에도 그대로 통합니다.
   ------------------------------------------------------------------ */

type Coord = [number, number];

/**
 * 역명 배열 -> { 역명 => [위도, 경도] } 맵.
 *
 * 배열이 아니라 맵으로 돌려주는 이유: 호출한 쪽이 **어느 역의 좌표가 없었는지**
 * 알아야 합니다. 역 마스터 범위가 경로 API 커버리지보다 좁으면 폴리라인이
 * 조용히 끊기는데, 그게 데이터로 드러나야 고칠 수 있습니다.
 *
 * `names` 는 경로 순서대로 주어야 합니다. 순서가 동명이역 판별의 근거입니다.
 */
export async function coordsMapForStationNames(names: string[]): Promise<Map<string, Coord>> {
  const result = new Map<string, Coord>();
  const ordered = names.filter(Boolean);
  if (ordered.length === 0) return result;

  const keys = [...new Set(ordered)];
  const variants = [...new Set(keys.flatMap((n) => nameVariants(n)))];

  const rows = await query<Record<string, unknown>>(
    `select name_norm, name_alias, lat, lng
       from subway_station
      where name_norm = any($1::text[]) or name_alias = any($1::text[])`,
    [variants],
  );

  // 정규화 이름 -> 후보 좌표들. 환승역은 노선 수만큼 행이 있지만 좌표가 거의 같습니다.
  const candidates = new Map<string, Coord[]>();
  for (const r of rows) {
    const coord: Coord = [Number(r.lat), Number(r.lng)];
    if (!Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) continue;
    for (const key of [r.name_norm, r.name_alias]) {
      if (key === undefined || key === null) continue;
      const k = String(key);
      if (!k) continue;
      const list = candidates.get(k) ?? [];
      list.push(coord);
      candidates.set(k, list);
    }
  }

  /** 좌표들이 서로 1km 안에 모여 있으면 같은 역으로 봅니다. */
  function isAmbiguous(list: Coord[]): boolean {
    if (list.length < 2) return false;
    const [a] = list;
    return list.some((b) => haversineKm(a[0], a[1], b[0], b[1]) > 1);
  }

  function candidatesFor(name: string): Coord[] {
    for (const v of nameVariants(name)) {
      const list = candidates.get(v);
      if (list && list.length > 0) return list;
    }
    return [];
  }

  // 1차: 후보가 하나뿐이거나 전부 같은 자리인 역을 먼저 확정합니다.
  const resolved: Array<Coord | null> = ordered.map(() => null);
  const pending: number[] = [];

  ordered.forEach((name, i) => {
    const list = candidatesFor(name);
    if (list.length === 0) return;
    if (!isAmbiguous(list)) {
      resolved[i] = list[0];
    } else {
      pending.push(i);
    }
  });

  // 2차: 애매한 역은 가장 가까운 "확정된 이웃"을 기준으로 고릅니다.
  for (const i of pending) {
    let anchor: Coord | null = null;
    for (let d = 1; d < ordered.length; d++) {
      const left = i - d >= 0 ? resolved[i - d] : null;
      const right = i + d < ordered.length ? resolved[i + d] : null;
      anchor = left ?? right;
      if (anchor) break;
    }

    const list = candidatesFor(ordered[i]);
    if (!anchor) {
      // 경로 전체가 애매한 역뿐인 경우. 첫 후보를 쓰되 기록은 남깁니다.
      resolved[i] = list[0];
      log.debug("동명이역 판별 불가 — 첫 후보 사용", { station: ordered[i] });
      continue;
    }

    let best = list[0];
    let bestKm = Number.POSITIVE_INFINITY;
    for (const c of list) {
      const km = haversineKm(anchor[0], anchor[1], c[0], c[1]);
      if (km < bestKm) {
        bestKm = km;
        best = c;
      }
    }
    resolved[i] = best;
    log.debug("동명이역 해소", { station: ordered[i], 후보: list.length, 선택거리km: Math.round(bestKm) });
  }

  ordered.forEach((name, i) => {
    const c = resolved[i];
    if (c && !result.has(name)) result.set(name, c);
  });

  return result;
}

/** 역명 배열 -> 좌표 배열. 못 찾은 역은 건너뜁니다. */
export async function coordsForStationNames(names: string[]): Promise<Coord[]> {
  const map = await coordsMapForStationNames(names);
  const out: Coord[] = [];
  for (const n of names) {
    const c = map.get(n);
    if (c) out.push(c);
  }
  return out;
}

/** 자동완성·검색용. 본명과 별칭 양쪽에서 찾습니다. */
export async function searchStations(term: string, limit = 10): Promise<Station[]> {
  const t = normalizeStationName(term);
  if (!t) return [];

  const rows = await query<Record<string, unknown>>(
    `select distinct on (name_norm) station_name, line_name, ext_station_code, lat, lng, name_norm
       from subway_station
      where name_norm like $1 or name_alias like $1
      order by name_norm
      limit $2`,
    [`%${t}%`, limit],
  );
  return rows.map(toStation);
}
