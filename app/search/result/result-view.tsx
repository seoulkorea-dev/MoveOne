"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Banner } from "@/components/app-chrome";
import { MODE_LABEL, useStoredSearch } from "@/lib/search-store";
import { formatClockKST, formatKST } from "@/lib/kst";
import { useNow } from "@/lib/use-now";
import {
  SEGMENT_LABEL,
  SORT_LABEL,
  formatDistance,
  formatFare,
  sortRoutes,
  type RouteSegment,
  type RouteSortKey,
  type TransitRoute,
  type Place,
} from "@/lib/routes";
import { MODE_COLOR } from "@/lib/routing/line-colors";
import { log } from "@/lib/logger";

const SORT_KEYS: RouteSortKey[] = ["fastest", "cheapest", "fewest_transfers", "least_walk"];

/**
 * 구간 색. 진행 바와 칩이 같은 색을 써야 눈으로 이어집니다.
 *
 * ★ app/route/detail/detail-view.tsx 의 segmentColor 와 **같은 함수**입니다.
 *
 *   예전에는 여기만 수단별 Tailwind 클래스(bg-subway, bg-bus)를 썼습니다.
 *   그래서 5000번 광역버스도 2호선도 전부 파랑 계열로 나왔고, 같은 경로가
 *   목록에서는 파랑, 상세에서는 빨강·초록으로 보였습니다.
 *
 *   어댑터가 노선별 실제 색을 segment.color 에 담아 줍니다. 지도·상세와
 *   같은 값을 그대로 씁니다. color 가 없는 옛 캐시 데이터를 위해 수단
 *   기본색으로 물러섭니다.
 *
 *   Tailwind 클래스가 아니라 style 로 넣는 이유: 노선색은 18가지가 넘고
 *   런타임 값이라 클래스로 만들 수 없습니다. Tailwind 는 소스에 글자
 *   그대로 있는 클래스만 CSS 로 만듭니다.
 */
function segmentColor(segment: RouteSegment): string {
  return segment.color ?? MODE_COLOR[segment.type] ?? MODE_COLOR.walk;
}

export default function ResultView() {
  const router = useRouter();
  const data = useStoredSearch();
  const [sortKey, setSortKey] = useState<RouteSortKey>("fastest");

  // 효과는 "밖으로 내보내는 일"만 합니다 — 화면 이동과 로그.
  // 저장소를 읽어 state 에 퍼오는 일은 useStoredSearch 가 대신합니다.
  useEffect(() => {
    if (data === undefined) return;
    if (data === null) {
      // 다른 탭에서 링크를 열었거나 결과가 만료된 경우입니다.
      log.info("결과 없음 — 검색 화면으로 되돌림");
      router.replace("/search");
      return;
    }
    log.debug("결과 불러옴", {
      count: data.routes.length,
      mode: data.mode,
      fromCache: data.fromCache,
    });
  }, [data, router]);

  const sorted = useMemo(() => (data ? sortRoutes(data.routes, sortKey) : []), [data, sortKey]);

  if (data === undefined) return <ResultSkeleton />;
  if (data === null) return null;

  return (
    <>
      {/* 검색 조건 */}
      <section className="bg-surface-container-lowest rounded-xl p-space-base shadow-sm flex flex-col gap-space-sm">
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex-1 min-w-0 flex items-center gap-space-xs">
            <span className="font-headline-sm text-headline-sm text-primary truncate">
              {placeLabel(data.departure)}
            </span>
            <Icon name="arrow_forward" size={18} className="text-outline-variant" />
            <span className="font-headline-sm text-headline-sm text-primary truncate">
              {placeLabel(data.arrival)}
            </span>
          </div>
          <Link
            href="/search"
            aria-label="검색 조건 바꾸기"
            className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors shrink-0"
          >
            <Icon name="tune" size={18} />
          </Link>
        </div>

        {/* 데이터 기준 시각 — 기획서 수락기준 항목이라 지우지 마세요 */}
        <div className="flex items-center gap-space-xs flex-wrap">
          <span className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md px-2 py-0.5 rounded-lg tracking-normal">
            {MODE_LABEL[data.mode ?? "all"]}
          </span>
          <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
            경로 {data.routes.length}개 · 데이터 기준 {formatKST(data.fetchedAt)}
            {data.fromCache ? " · 저장된 결과" : ""}
          </p>
        </div>
      </section>

      {data.routes.length === 0 ? (
        <Banner tone="info" icon="search_off" title="경로를 찾지 못했습니다">
          출발지와 도착지가 너무 가깝거나, 주변에 대중교통 정류장이 없을 수 있습니다. 위치를 조금
          옮겨 다시 검색해 보세요.
        </Banner>
      ) : (
        <>
          {/* 정렬 4종 — 기획서 수락기준 항목 */}
          {/* ★ 네 버튼을 한 줄에, 같은 크기로.
              예전에는 두 가지 이유로 제각각이었습니다.
                1. 선택된 버튼에만 체크 아이콘이 붙어 **고를 때마다 폭이 변함**
                2. 글자 길이가 달라서("빠른 순" vs "환승 적은 순") 폭이 다름
              그래서 (1) 체크 아이콘을 없애고 — 선택은 파란 배경으로 이미
              충분히 보입니다 — (2) 4칸 격자로 폭을 균등 분배하고,
              (3) 높이를 h-10 으로 고정했습니다.
              글씨는 label-md(11px)입니다. label-lg(13px)로는 "환승 적은 순"이
              좁은 화면(360px)에서 잘립니다. tracking-normal 로 자간을 붙여
              폭을 더 아낍니다. 가로 스크롤도 없앴습니다. */}
          <section
            aria-label="경로 정렬"
            role="tablist"
            className="grid grid-cols-4 gap-1.5 py-0.5"
          >
            {SORT_KEYS.map((key) => {
              const on = sortKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-log={`result.sort.${key}`}
                  onClick={() => {
                    log.debug("정렬 변경", { from: sortKey, to: key });
                    setSortKey(key);
                  }}
                  className={`w-full h-10 px-1 rounded-lg font-label-md text-label-md tracking-normal shadow-sm transition-all flex items-center justify-center ${
                    on
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span className="truncate">{SORT_LABEL[key]}</span>
                </button>
              );
            })}
          </section>

          <div className="flex flex-col gap-space-md">
            {sorted.map((route, i) => (
              <RouteCard
                key={route.index}
                route={route}
                recommended={i === 0}
                searchId={data.searchId}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center gap-space-sm bg-surface-container-low rounded-xl px-space-base py-space-md">
        <Icon name="tune" size={18} className="text-secondary" />
        <span className="font-body-md text-body-md text-on-surface-variant flex-1">
          원하는 경로 옵션이 없으신가요?
        </span>
        <Link href="/search" className="font-label-lg text-label-lg text-secondary shrink-0">
          다시 검색
        </Link>
      </div>
    </>
  );
}

function placeLabel(place: Place): string {
  return place.name ?? place.address ?? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`;
}

/* ---------------- 경로 카드 ---------------- */

function RouteCard({
  route,
  recommended,
  searchId,
}: {
  route: TransitRoute;
  recommended: boolean;
  searchId: string | null;
}) {
  const router = useRouter();
  const now = useNow();

  // 도보만으로 이루어진 구간 표시는 지저분하므로,
  // 짧은 도보(3분 이하)는 요약에서 생략합니다.
  const shown = route.segments.filter((s) => s.type !== "walk" || (s.durationMin ?? 0) > 3);

  const arriveAt = now + route.totalTimeMin * 60_000;

  /** 상세로 들어가는 것이 곧 "선택"입니다. KPI 선택률의 유일한 근거입니다. */
  function open() {
    log.info("경로 선택", {
      routeIndex: route.index,
      totalTimeMin: route.totalTimeMin,
      transferCount: route.transferCount,
    });
    if (searchId) {
      fetch("/api/transit/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ searchId, routeIndex: route.index }),
      }).catch((cause) => log.error("선택 기록 실패", { message: String(cause).slice(0, 120) }));
    } else {
      log.debug("선택 기록 건너뜀 — searchId 없음");
    }
    router.push(`/route/detail?i=${route.index}`);
  }

  return (
    <article
      className={`bg-surface-container-lowest rounded-xl p-space-base flex flex-col gap-space-md ${
        recommended ? "shadow-md" : "shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs flex-wrap">
          {recommended ? (
            <span className="bg-primary text-on-primary font-label-md text-label-md px-2 py-0.5 rounded-lg tracking-wider">
              추천
            </span>
          ) : null}
          {route.transferCount === 0 ? (
            <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2 py-0.5 rounded-lg">
              환승 없음
            </span>
          ) : (
            <span className="bg-surface-container text-on-surface-variant font-label-md text-label-md px-2 py-0.5 rounded-lg">
              환승 {route.transferCount}회
            </span>
          )}
        </div>
        <span className="font-code-time text-headline-xl-mobile text-secondary leading-none shrink-0 tabular-nums">
          {route.totalTimeMin}
          <span className="font-headline-md text-headline-md">분</span>
        </span>
      </div>

      <div className="flex items-center justify-between font-label-lg text-label-lg text-on-surface-variant flex-wrap gap-space-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-on-surface font-body-md-bold text-body-md-bold tabular-nums">
            {formatClockKST(now)}
          </span>
          <span>출발</span>
          <Icon name="arrow_right_alt" size={14} className="text-outline-variant" />
          <span className="text-on-surface font-body-md-bold text-body-md-bold tabular-nums">
            {formatClockKST(arriveAt)}
          </span>
          <span>도착 예상</span>
        </div>
        <div className="flex items-center gap-space-sm text-on-surface">
          <span>{formatFare(route.totalFare)}</span>
          <span className="text-outline-variant">·</span>
          <span>도보 {formatDistance(route.totalWalkM)}</span>
        </div>
      </div>

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-sm">
        <ProgressBar segments={route.segments} total={route.totalTimeMin} />

        <div className="flex flex-col gap-space-xs pt-1">
          {shown.map((segment) => (
            <SegmentRow key={segment.index} segment={segment} />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={open}
        data-log="result.detail"
        className="w-full h-12 bg-secondary-container text-on-secondary rounded-lg font-body-md-bold text-body-md-bold flex items-center justify-center gap-2 hover:bg-secondary active:scale-[0.99] transition-all shadow-sm"
      >
        <span>상세보기</span>
        <Icon name="navigation" size={18} />
      </button>
    </article>
  );
}

function ProgressBar({ segments, total }: { segments: RouteSegment[]; total: number }) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div
      className="w-full h-2.5 rounded-full overflow-hidden flex bg-surface-container-high"
      aria-hidden="true"
    >
      {segments.map((segment) => {
        const pct = Math.max(2, Math.round(((segment.durationMin ?? 0) / safeTotal) * 100));
        return (
          <div
            key={segment.index}
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: segmentColor(segment) }}
            title={`${SEGMENT_LABEL[segment.type]} ${segment.durationMin ?? 0}분`}
          />
        );
      })}
    </div>
  );
}

function SegmentRow({ segment }: { segment: RouteSegment }) {
  if (segment.type === "walk") {
    return (
      <div className="flex items-center gap-space-sm">
        <Icon name="directions_walk" size={18} className="text-outline" />
        <span className="font-body-md text-body-md text-on-surface truncate">
          {segment.endName ? `${segment.endName}까지 도보` : "도보 이동"}
          {segment.durationMin ? ` ${segment.durationMin}분` : ""}
        </span>
        {segment.distanceM !== undefined ? (
          <span className="font-label-md text-label-md text-on-surface-variant ml-auto shrink-0 tabular-nums">
            {formatDistance(segment.distanceM)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-space-sm">
      <span
        className="w-5 h-5 rounded-full text-white flex items-center justify-center font-label-md text-[10px] font-bold shrink-0"
        style={{ backgroundColor: segmentColor(segment) }}
      >
        {SEGMENT_LABEL[segment.type].slice(0, 1)}
      </span>
      <div className="flex-1 min-w-0 flex items-baseline gap-1.5 truncate">
        <span className="font-body-md-bold text-body-md-bold text-on-surface truncate">
          {segment.laneName ?? SEGMENT_LABEL[segment.type]}
          {segment.startName ? ` ${segment.startName} 승차` : ""}
        </span>
        {segment.stationCount ? (
          <span className="font-label-md text-label-md text-on-surface-variant shrink-0">
            {/* 버스는 '역' 이 아니라 '정류장' 입니다. 상세 화면과 같은 규칙. */}
            {segment.stationCount}개 {segment.type === "bus" ? "정류장" : "역"}
            {segment.durationMin ? ` (${segment.durationMin}분)` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- 로딩 ---------------- */

function ResultSkeleton() {
  return (
    <div className="flex flex-col gap-space-md" aria-busy="true" aria-live="polite">
      <span className="sr-only">경로를 불러오는 중입니다</span>
      <div className="skeleton h-20" />
      <div className="skeleton h-52" />
      <div className="skeleton h-40" />
    </div>
  );
}
