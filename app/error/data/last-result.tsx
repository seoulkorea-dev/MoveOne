"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { Banner, SectionTitle } from "@/components/app-chrome";
import { useStoredSearch } from "@/lib/search-store";
import { formatKST } from "@/lib/kst";
import { formatFare, sortRoutes, type Place } from "@/lib/routes";

/**
 * 직전에 성공했던 검색 결과.
 * 지금 실패했더라도 조금 전 결과가 남아 있으면 보여주는 편이 낫습니다.
 * 다만 지금 상황과 다를 수 있으므로 저장 시각을 반드시 함께 적습니다.
 */
export default function LastResult() {
  const stored = useStoredSearch();

  // undefined(아직 모름)와 null(없음) 모두 여기서는 아무것도 그리지 않습니다.
  // 곁다리로 보여주는 영역이라 스켈레톤을 띄울 필요가 없습니다.
  if (!stored || stored.routes.length === 0) return null;

  const top = sortRoutes(stored.routes, "fastest").slice(0, 2);

  return (
    <>
      <SectionTitle>저장된 이전 경로</SectionTitle>

      <Banner tone="info" icon="cached" title="마지막으로 받은 결과입니다">
        {formatKST(stored.fetchedAt)} 기준이라 지금 상황과 다를 수 있습니다.
      </Banner>

      <section className="flex flex-col gap-space-sm">
        {top.map((route) => (
          <Link
            key={route.index}
            href={`/route/detail?i=${route.index}`}
            className="bg-surface-container-lowest rounded-xl p-space-base shadow-sm flex items-center gap-space-sm opacity-90"
          >
            <div className="flex-1 min-w-0">
              <p className="font-body-md-bold text-body-md-bold text-on-surface truncate">
                {label(stored.departure)} → {label(stored.arrival)}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant tracking-normal mt-0.5">
                환승 {route.transferCount}회 · {formatFare(route.totalFare)}
              </p>
            </div>
            <span className="font-code-time text-code-time text-on-surface-variant shrink-0 tabular-nums">
              {route.totalTimeMin}분
            </span>
            <Icon name="chevron_right" size={18} className="text-outline" />
          </Link>
        ))}
      </section>
    </>
  );
}

function label(place: Place): string {
  return place.name ?? place.address ?? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`;
}
