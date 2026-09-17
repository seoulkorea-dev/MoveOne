"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { savePrefill, useRecent } from "@/lib/search-store";
import { log } from "@/lib/logger";
import type { Place } from "@/lib/routes";
import type { RecentPair } from "@/lib/search-store";

/**
 * 시안의 검색 모듈과 자주 가는 곳 칩.
 *
 * 시안에는 회사·집·김포공항이 예시로 박혀 있는데, 장소를 등록하는 기능이
 * 아직 없습니다. 없는 것을 있는 척 보여주지 않으려고 **최근 검색**으로
 * 채웠습니다 (lib/search-store.ts 에 이미 쌓고 있습니다). 칩의 생김새는
 * 시안 그대로입니다.
 *
 * 검색창은 여기서 입력받지 않고 /search 로 넘깁니다. 자동완성·디바운스·
 * 수단 선택이 전부 그 화면에 있어서, 두 곳에 같은 로직을 두면 반드시
 * 한쪽이 뒤처집니다.
 *
 * ★ 2026-09-18 — 최근 검색 칩이 실제로 동작하게 고쳤습니다.
 *
 *   예전에는 칩을 눌러도 `/search` 로 가기만 했습니다. 누른 장소가
 *   전달되지 않아서 **빈 검색 화면**이 떴습니다. 사용자는 "강남역을
 *   눌렀으니 그 경로가 검색되겠지" 하고 누르는데 아무것도 채워져 있지
 *   않으니, 기능이 있는 것처럼 보이면서 없는 상태였습니다.
 *
 *   pair 안에 departure·arrival 이 이미 들어 있었습니다. 그것을
 *   savePrefill 로 넘기고 검색 화면이 폼을 채웁니다.
 *
 *   URL 쿼리(?from=37.55,126.97)를 쓰지 않은 이유는 search-store.ts
 *   머리에 적힌 것과 같습니다 — 좌표는 주소창·방문 기록에 남기지
 *   않습니다.
 */
export function HomeQuick({ login }: { login: string }) {
  const router = useRouter();
  const recent = useRecent();

  function goSearch() {
    log.debug("홈 → 검색", { reason: "search-bar" });
    router.push("/search");
  }

  function goRecent(pair: RecentPair) {
    log.debug("홈 → 검색", {
      reason: "recent-chip",
      from: pair.departure.name ?? pair.departure.address,
      to: pair.arrival.name ?? pair.arrival.address,
    });
    savePrefill({ departure: pair.departure, arrival: pair.arrival });
    router.push("/search");
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_2px_12px_rgba(0,44,116,0.06)] p-space-sm flex flex-col gap-space-sm">
      {/* 인사말. 예전에는 아래쪽 별도 카드에 있었는데, 그 카드가 이 검색창과
          같은 곳으로 가는 중복 블록이라 없앴습니다. 문구만 여기로 옮깁니다. */}
      <p className="px-space-xs pt-space-xxs font-label-lg text-label-lg text-on-surface-variant tracking-normal">
        <span className="text-on-surface font-bold">{login}</span>님, 어디로 가시나요?
      </p>

      {/* 검색창 모양이지만 실제로는 버튼입니다 */}
      <button
        type="button"
        onClick={goSearch}
        data-log="home.search"
        className="flex items-center gap-space-xs bg-surface-container-low rounded-lg px-space-md py-3 w-full text-left min-h-[44px] hover:bg-surface-container transition-colors"
      >
        <Icon name="search" size={22} className="text-secondary" />
        <span className="flex-1 font-body-md text-body-md text-outline">
          어디로 갈까요? 목적지 검색
        </span>
        <span className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shadow-sm">
          <Icon name="map" size={18} />
        </span>
      </button>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {recent.length === 0 ? (
          <span className="font-label-lg text-label-lg text-on-surface-variant px-1 py-1.5">
            검색하면 최근 목적지가 여기에 쌓입니다
          </span>
        ) : (
          recent.slice(0, 5).map((pair, i) => (
            <button
              key={`${pair.arrival.lat}-${pair.arrival.lng}-${i}`}
              type="button"
              onClick={() => goRecent(pair)}
              data-log="home.recent"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors flex-shrink-0 min-h-[36px]"
            >
              <Icon name="history" size={14} className="text-on-surface-variant" />
              <span className="font-body-md-bold text-body-md-bold text-on-surface whitespace-nowrap">
                {label(pair.arrival)}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant whitespace-nowrap">
                {label(pair.departure)}에서
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function label(place: Place): string {
  const name = place.name ?? place.address ?? "";
  return name.length > 10 ? `${name.slice(0, 10)}…` : name || "알 수 없음";
}
