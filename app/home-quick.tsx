"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useRecent } from "@/lib/search-store";
import { log } from "@/lib/logger";
import type { Place } from "@/lib/routes";

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
 */
export function HomeQuick() {
  const router = useRouter();
  const recent = useRecent();

  function go(reason: string) {
    log.debug("홈 → 검색", { reason });
    router.push("/search");
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_2px_12px_rgba(0,44,116,0.06)] p-space-sm flex flex-col gap-space-sm">
      {/* 검색창 모양이지만 실제로는 버튼입니다 */}
      <button
        type="button"
        onClick={() => go("search-bar")}
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
              onClick={() => go("recent-chip")}
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
