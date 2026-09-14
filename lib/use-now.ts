"use client";

import { useSyncExternalStore } from "react";

/**
 * 지금 시각.
 *
 * 화면에서 `Date.now()` 를 직접 부르면 안 됩니다. 렌더는 순수해야 하는데
 * `Date.now()` 는 부를 때마다 다른 값을 돌려주기 때문입니다. 리렌더가 일어날
 * 때마다 "도착 예상" 시각이 슬금슬금 움직이고, React 는 이것을 오류로 잡습니다
 * (react-hooks/purity).
 *
 * 시계는 React 바깥의 외부 시스템이므로 useSyncExternalStore 로 구독합니다.
 * 30초마다 한 번 갱신하므로 화면의 도착 시각이 실제로도 계속 맞습니다 —
 * 결과 화면을 10분 동안 열어 둬도 "지금 출발하면" 이 그때 기준으로 유지됩니다.
 *
 * 타이머는 구독자가 몇 명이든 하나만 돕니다.
 */

const TICK_MS = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  const next = Date.now();
  if (next === now) return;
  now = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === null) {
    tick(); // 오래 쉬었다 돌아온 탭에서 낡은 값이 잠깐 보이지 않도록
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return now;
}

/**
 * 서버는 사용자의 "지금"을 모릅니다. 0 을 돌려주고, 실제 값은 hydration
 * 직후에 들어옵니다. 이 값을 그대로 그리는 화면이 없도록, 시각을 쓰는 화면은
 * 결과를 불러오기 전까지 스켈레톤을 보여줍니다.
 */
function getServerSnapshot(): number {
  return 0;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
