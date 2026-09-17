"use client";

import { useSyncExternalStore } from "react";
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

/** 교통수단. API 의 SEARCH_MODES 와 같은 값이어야 합니다. */
export type SearchMode = "all" | "subway" | "bus";

export const MODE_LABEL: Record<SearchMode, string> = {
  all: "전체",
  subway: "지하철",
  bus: "버스",
};

export type StoredSearch = {
  departure: Place;
  arrival: Place;
  /** 이 결과가 어떤 수단으로 검색된 것인지. 결과 화면에 표시합니다. */
  mode: SearchMode;
  routes: TransitRoute[];
  fromCache: boolean;
  /** 데이터 기준 시각 — 기획서 수락기준 항목이라 화면에 그대로 표시합니다 */
  fetchedAt: string;
  /** KPI 선택률 기록에 필요합니다 */
  searchId: string | null;
  savedAt: number;
};

/* ---------------- 변경 알림 ----------------
 *
 * 브라우저의 `storage` 이벤트는 **다른 탭**에서 바뀔 때만 옵니다. 같은 탭에서
 * 우리가 직접 쓴 것은 알려주지 않으므로, 저장·삭제할 때 여기서 직접 알립니다.
 * 이 알림이 없으면 검색 직후 결과 화면이 예전 값을 봅니다.
 */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveSearch(value: Omit<StoredSearch, "savedAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
    notify();
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
    notify();
  } catch {
    /* 무시 */
  }
}

/* ---------------- 화면에서 읽는 방법 ----------------
 *
 * sessionStorage 는 React 바깥의 외부 시스템입니다. `useEffect` 안에서
 * `setState(loadSearch())` 로 퍼오면 렌더가 한 번 더 도는 데다 React 가
 * 오류로 잡습니다(react-hooks/set-state-in-effect). 외부 시스템을 읽는
 * 정식 도구는 useSyncExternalStore 입니다.
 *
 * 주의: useSyncExternalStore 는 "값이 같으면 참조도 같을 것"을 요구합니다.
 * JSON.parse 는 부를 때마다 새 객체를 만들기 때문에, 원문 문자열을 키로
 * 삼아 캐시합니다. 이 캐시를 빼면 렌더가 무한히 반복됩니다.
 */

let searchCache: { raw: string | null; value: StoredSearch | null } = { raw: null, value: null };

function searchSnapshot(): StoredSearch | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== searchCache.raw) {
    searchCache = { raw, value: raw === null ? null : loadSearch() };
  }
  return searchCache.value;
}

/**
 * 저장된 검색 결과.
 *
 *   undefined — 아직 모름 (서버 렌더 / hydration 전). 스켈레톤을 보여주세요
 *   null      — 없음. 검색 화면으로 되돌리세요
 *   값        — 결과
 *
 * 세 상태를 구분하지 않으면 결과가 있는데도 "없음" 화면이 한 번 스칩니다.
 */
export function useStoredSearch(): StoredSearch | null | undefined {
  return useSyncExternalStore(subscribe, searchSnapshot, () => undefined);
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
    notify();
  } catch {
    /* 무시 */
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
    notify();
  } catch {
    /* 무시 */
  }
}

/** 서버 스냅샷은 매번 같은 배열이어야 합니다. 새 `[]` 를 돌려주면 무한 렌더입니다. */
const NO_RECENT: RecentPair[] = [];

let recentCache: { raw: string | null; value: RecentPair[] } = { raw: null, value: NO_RECENT };

function recentSnapshot(): RecentPair[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RECENT_KEY);
  } catch {
    raw = null;
  }
  if (raw !== recentCache.raw) {
    recentCache = { raw, value: raw === null ? NO_RECENT : loadRecent() };
  }
  return recentCache.value;
}

/** 최근 검색. 서버에서는 빈 배열입니다. */
export function useRecent(): RecentPair[] {
  return useSyncExternalStore(subscribe, recentSnapshot, () => NO_RECENT);
}

/* ---------------- 검색 폼 미리 채우기 ---------------- */

/**
 * 홈의 최근 검색 칩 → 검색 화면으로 "이 출발·도착으로 폼을 채워라"를 넘깁니다.
 *
 * 왜 URL 쿼리(?from=37.55,126.97)가 아닌가
 *   이 파일 머리에 적힌 이유 그대로입니다. 좌표는 사용자의 위치라
 *   주소창·방문 기록·리퍼러에 남기지 않습니다. 같은 이유로 여기도
 *   sessionStorage 를 씁니다.
 *
 * 왜 한 번 쓰고 버리는가
 *   남겨 두면 /search 를 새로 열 때마다 지난 검색이 되살아납니다.
 *   "빈 검색 화면"을 볼 방법이 없어집니다. 검색 화면이 마운트되면
 *   clearPrefill 로 지웁니다.
 */

const PREFILL_KEY = "moveone:prefill";

export type Prefill = { departure: Place; arrival: Place };

export function savePrefill(value: Prefill): void {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(value));
  } catch {
    /* 무시 — 못 넘기면 빈 검색 화면이 뜰 뿐입니다 */
  }
}

/**
 * 읽기만 합니다. 지우지 않습니다.
 *
 * 왜 읽기와 지우기를 나눴나
 *   검색 화면은 이 값을 useState 초기화 함수에서 읽습니다. 효과 안에서
 *   setState 로 채우면 렌더가 한 번 더 돌고, react-hooks/set-state-in-effect
 *   규칙에도 걸립니다. 그런데 초기화 함수는 개발 모드(StrictMode)에서
 *   **두 번 실행**됩니다. 읽으면서 지워버리면 두 번째 호출이 null 을
 *   돌려주고, React 가 그 결과를 쓰면 값이 사라집니다.
 *   그래서 읽기는 몇 번을 불러도 같은 값이어야 합니다.
 */
export function peekPrefill(): Prefill | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Prefill;
    if (typeof parsed?.departure?.lat !== "number") return null;
    if (typeof parsed?.arrival?.lat !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 지웁니다. 검색 화면이 마운트된 뒤 효과에서 한 번 부릅니다.
 *
 * 지우지 않으면 /search 를 새로 열 때마다 지난 검색이 되살아나서
 * "빈 검색 화면"을 볼 방법이 없어집니다.
 */
export function clearPrefill(): void {
  try {
    sessionStorage.removeItem(PREFILL_KEY);
  } catch {
    /* 무시 */
  }
}
