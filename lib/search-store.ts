"use client";

import type { Place, TransitRoute } from "./routes";

/**
 * 검색 결과를 화면 사이에서 넘기는 저장소.
 *
 * /search 에서 검색하고 /search/result 에서 보여주고 /route/detail 에서
 * 한 경로를 파고듭니다. 세 화면이 같은 결과를 봐야 하는데,
 *
 *   - 좌표를 URL 쿼리에 실으면 출발지·도착지가 주소창과 방문 기록,
 *     리퍼러에까지 남습니다. 사용자의 위치라 남기지 않는 편이 낫습니다.
 *   - 화면을 옮길 때마다 다시 검색하면 ODsay 호출을 두 배로 씁니다.
 *     호출 한도가 문서에 없는 API라 아낄수록 좋습니다.
 *
 * 그래서 sessionStorage 에 둡니다. 탭 안에서만 살아 있고 탭을 닫으면
 * 사라집니다. 새로고침은 견디지만, 링크를 복사해 다른 탭에서 열면
 * 결과가 없습니다 — 그때는 각 화면이 /search 로 되돌립니다.
 */

const KEY = "moveone:last-search";
/** 너무 오래된 결과로 상세 화면을 그리지 않습니다. */
const MAX_AGE_MS = 30 * 60 * 1000;

export type StoredSearch = {
  departure: Place;
  arrival: Place;
  routes: TransitRoute[];
  fromCache: boolean;
  /** 데이터 기준 시각 — 기획서 수락기준 항목이라 화면에 그대로 표시합니다 */
  fetchedAt: string;
  /** KPI 선택률 기록에 필요합니다 */
  searchId: string | null;
  savedAt: number;
};

export function saveSearch(value: Omit<StoredSearch, "savedAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch {
    // 사생활 보호 모드 등에서 막힐 수 있습니다. 저장을 못 해도
    // 결과 화면은 이미 메모리에 값을 들고 있으므로 그대로 진행합니다.
  }
}

export function loadSearch(): StoredSearch | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredSearch;
    if (!Array.isArray(parsed?.routes) || typeof parsed?.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSearch(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

/* ---------------- 최근 검색 ---------------- */

const RECENT_KEY = "moveone:recent";
const RECENT_MAX = 5;

export type RecentPair = { departure: Place; arrival: Place };

export function loadRecent(): RecentPair[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentPair[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(pair: RecentPair): void {
  try {
    const same = (a: Place, b: Place) => a.lat === b.lat && a.lng === b.lng;
    const next = [
      pair,
      ...loadRecent().filter(
        (r) => !(same(r.departure, pair.departure) && same(r.arrival, pair.arrival)),
      ),
    ].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 무시 */
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* 무시 */
  }
}
