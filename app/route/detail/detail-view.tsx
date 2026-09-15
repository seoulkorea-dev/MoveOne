"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Banner, SectionTitle } from "@/components/app-chrome";
import { RouteMap } from "@/components/route-map";
import { SubwayMap } from "@/components/subway-map";
import { useStoredSearch } from "@/lib/search-store";
import { useNow } from "@/lib/use-now";
import { formatClockKST } from "@/lib/kst";
import {
  SEGMENT_LABEL,
  formatDistance,
  formatFare,
  type Place,
  type RouteSegment,
  type TransitRoute,
} from "@/lib/routes";
import { log } from "@/lib/logger";

const SEGMENT_BG: Record<string, string> = {
  walk: "bg-walk",
  subway: "bg-subway",
  bus: "bg-bus",
  bike: "bg-bike",
  taxi: "bg-taxi",
};

export default function DetailView({
  kakaoKey,
  odsayWebKey,
}: {
  kakaoKey?: string;
  odsayWebKey?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const stored = useStoredSearch();
  const now = useNow();

  const index = Number(params.get("i"));

  // 효과는 "밖으로 내보내는 일"만 합니다 — 화면 이동과 로그.
  // 저장소를 읽어 state 에 퍼오는 일은 useStoredSearch 가 대신합니다.
  useEffect(() => {
    if (stored === undefined) return;
    if (stored === null) {
      log.info("상세 — 결과 없음, 검색 화면으로 되돌림");
      router.replace("/search");
      return;
    }
    log.debug("상세 진입", { routeIndex: index, hasKakaoKey: !!kakaoKey });
  }, [stored, router, index, kakaoKey]);

  if (stored === undefined) return <div className="skeleton h-64" aria-busy="true" />;
  if (stored === null) return null;

  const route = stored.routes.find((r) => r.index === index);
  if (!route) {
    return (
      <Banner
        tone="info"
        icon="search_off"
        title="이 경로를 찾을 수 없습니다"
        action={{ href: "/search/result", label: "결과 목록으로" }}
      >
        검색 결과가 갱신되어 선택한 경로가 사라졌을 수 있습니다.
      </Banner>
    );
  }

  const arriveAt = now + route.totalTimeMin * 60_000;

  return (
    <>
      <Summary
        route={route}
        departure={stored.departure}
        arrival={stored.arrival}
        now={now}
        arriveAt={arriveAt}
      />

      <MapArea route={route} kakaoKey={kakaoKey} odsayWebKey={odsayWebKey} />

      <SectionTitle>구간 안내</SectionTitle>

      <section className="bg-surface-container-lowest rounded-xl p-space-base shadow-sm">
        <ol className="flex flex-col">
          {route.segments.map((segment, i) => (
            <Step
              key={segment.index}
              segment={segment}
              last={i === route.segments.length - 1}
            />
          ))}
        </ol>
      </section>

      <Banner tone="info" icon="info" title="요금은 성인 교통카드 기준입니다">
        환승 할인이 반영된 금액이며, 실제 결제 금액과 다를 수 있습니다.
      </Banner>

      {/* 고정 CTA 높이만큼 자리를 비웁니다 */}
      <div className="h-20" />
      <BottomCta />
    </>
  );
}

/**
 * 지도 자리.
 *
 * 지하철만으로 가는 경로는 **노선도**가 기본입니다. 지리 지도 위의 선은
 * 실제 철로가 아니라 ODsay 가 준 좌표를 이은 것이라, 도로를 따라가는 것처럼
 * 보일 때가 있습니다. 노선도는 그런 오해가 없고 환승역이 한눈에 들어옵니다.
 *
 * 버스가 섞이면 노선도로는 표현할 수 없으므로 지리 지도를 씁니다.
 * 지하철 경로에서도 역까지 걸어가는 길이 궁금할 수 있어 전환 버튼을 둡니다.
 */
function MapArea({
  route,
  kakaoKey,
  odsayWebKey,
}: {
  route: TransitRoute;
  kakaoKey?: string;
  odsayWebKey?: string;
}) {
  const rides = route.segments.filter((segment) => segment.type !== "walk");
  const subwayOnly = rides.length > 0 && rides.every((segment) => segment.type === "subway");
  const canUseSubwayMap = subwayOnly && !!odsayWebKey;

  const [view, setView] = useState<"subway" | "geo">(canUseSubwayMap ? "subway" : "geo");

  const first = rides[0];
  const last = rides[rides.length - 1];

  return (
    <div className="flex flex-col gap-space-sm">
      {canUseSubwayMap ? (
        <div className="flex items-center gap-space-xxs bg-surface-container rounded-lg p-0.5 self-start">
          <Toggle on={view === "subway"} onClick={() => setView("subway")} log="detail.view.subway">
            노선도
          </Toggle>
          <Toggle on={view === "geo"} onClick={() => setView("geo")} log="detail.view.geo">
            지도
          </Toggle>
        </div>
      ) : null}

      {canUseSubwayMap && view === "subway" ? (
        <SubwayMap
          key={`subway-${route.index}`}
          startStationId={first?.odsayStartStationId}
          endStationId={last?.odsayEndStationId}
          startName={first?.startName}
          endName={last?.endName}
          apiKey={odsayWebKey}
        />
      ) : (
        /* key 를 mapObj 로 두면 다른 경로로 바뀔 때 지도가 새로 시작합니다.
           안에서 이전 선형을 지우는 코드를 둘 필요가 없어집니다. */
        <RouteMap
          key={route.mapObj ?? `route-${route.index}`}
          segments={route.segments}
          mapObj={route.mapObj}
          appKey={kakaoKey}
        />
      )}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  log: logName,
  children,
}: {
  on: boolean;
  onClick: () => void;
  log: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-log={logName}
      aria-pressed={on}
      className={`px-space-md py-1.5 rounded font-label-lg text-label-lg min-h-[36px] transition-colors ${
        on
          ? "bg-surface-container-lowest text-primary shadow-sm"
          : "text-on-surface-variant hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

function placeLabel(place: Place): string {
  return place.name ?? place.address ?? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`;
}

function Summary({
  route,
  departure,
  arrival,
  now,
  arriveAt,
}: {
  route: TransitRoute;
  departure: Place;
  arrival: Place;
  now: number;
  arriveAt: number;
}) {
  const safeTotal = route.totalTimeMin > 0 ? route.totalTimeMin : 1;

  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-base shadow-md flex flex-col gap-space-md">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs flex-wrap">
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

      <div className="flex items-center gap-space-xs">
        <span className="font-headline-sm text-headline-sm text-primary truncate">
          {placeLabel(departure)}
        </span>
        <Icon name="arrow_forward" size={18} className="text-outline-variant" />
        <span className="font-headline-sm text-headline-sm text-primary truncate">
          {placeLabel(arrival)}
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

      <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-surface-container-high" aria-hidden="true">
        {route.segments.map((segment) => (
          <div
            key={segment.index}
            className={`h-full ${SEGMENT_BG[segment.type] ?? "bg-outline-variant"}`}
            style={{ width: `${Math.max(2, Math.round(((segment.durationMin ?? 0) / safeTotal) * 100))}%` }}
          />
        ))}
      </div>
    </section>
  );
}

function Step({ segment, last }: { segment: RouteSegment; last: boolean }) {
  const isWalk = segment.type === "walk";

  const node = isWalk ? (
    <span className="w-2 h-2 rounded-full bg-outline-variant shrink-0" />
  ) : (
    <span className="w-3 h-3 rounded-full border-2 border-primary-container bg-surface-container-lowest shrink-0" />
  );

  const title = isWalk
    ? segment.endName
      ? `${segment.endName}까지 도보`
      : "도보 이동"
    : `${segment.laneName ?? SEGMENT_LABEL[segment.type]}${segment.startName ? ` ${segment.startName} 승차` : ""}`;

  // 승차역·하차역을 뺀 중간 정차역. 시안의 "양재 → 양재시민의숲 → …" 자리입니다.
  const middle = (segment.stops ?? [])
    .slice(1, -1)
    .map((stop) => stop.name)
    .filter((name): name is string => !!name);

  const sub = isWalk
    ? segment.distanceM !== undefined
      ? formatDistance(segment.distanceM)
      : ""
    : [segment.endName ? `${segment.endName} 하차` : "", segment.stationCount ? `${segment.stationCount}개 역` : ""]
        .filter(Boolean)
        .join(" · ");

  return (
    <li className="flex gap-space-md">
      <div className="flex flex-col items-center pt-1.5 shrink-0">
        {node}
        {last ? null : <span className="w-0.5 flex-1 bg-outline-variant min-h-[28px]" />}
      </div>
      <div className="flex-1 min-w-0 pb-space-md flex items-start gap-space-sm">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-space-xs">
            {isWalk ? (
              <Icon name="directions_walk" size={18} className="text-outline" />
            ) : (
              <span
                className={`w-5 h-5 rounded-full text-white flex items-center justify-center font-label-md text-[10px] font-bold shrink-0 ${
                  SEGMENT_BG[segment.type] ?? "bg-outline"
                }`}
              >
                {SEGMENT_LABEL[segment.type].slice(0, 1)}
              </span>
            )}
            <span
              className={`truncate text-on-surface ${
                isWalk ? "font-body-md text-body-md" : "font-body-md-bold text-body-md-bold"
              }`}
            >
              {title}
            </span>
          </div>
          {sub ? (
            <p className="font-label-md text-label-md text-on-surface-variant tracking-normal mt-0.5">
              {sub}
            </p>
          ) : null}
          {middle.length > 0 ? (
            <p className="font-label-md text-label-md text-on-surface-variant tracking-normal mt-1">
              {middle.join(" → ")}
            </p>
          ) : null}
        </div>
        {segment.durationMin !== undefined ? (
          <span className="font-label-lg text-label-lg text-on-surface-variant shrink-0 tabular-nums">
            {segment.durationMin}분
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * 시안의 하단 CTA.
 * 경로 저장(s5)과 실시간 안내(s4)는 1차 범위 밖이라 아직 동작하지 않습니다.
 * 눌러도 아무 일이 없는 버튼을 두는 것보다, 비활성 상태로 두고 이유를 적는 편이
 * 사용자에게 정직합니다. 기능이 붙으면 disabled 만 떼면 됩니다.
 */
function BottomCta() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(25,28,31,0.08)]">
      <div className="px-layout-margin-mobile py-space-md flex flex-col gap-space-xs max-w-lg mx-auto">
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            disabled
            aria-label="경로 저장 (준비 중)"
            className="w-12 h-12 rounded-lg border border-outline-variant bg-surface-container-lowest flex items-center justify-center text-outline shrink-0 cursor-not-allowed"
          >
            <Icon name="bookmark_add" size={22} />
          </button>
          <button
            type="button"
            disabled
            className="w-full h-12 bg-secondary-container/40 text-on-secondary rounded-lg font-body-md-bold text-body-md-bold flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <span>실시간 안내 시작</span>
            <Icon name="navigation" size={18} />
          </button>
        </div>
        <p className="font-label-md text-label-md text-on-surface-variant tracking-normal text-center">
          경로 저장과 실시간 안내는 다음 단계 기능입니다.
        </p>
      </div>
    </div>
  );
}
