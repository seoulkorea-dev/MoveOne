"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import type { LanePath, RouteSegment } from "@/lib/routes";
import { log } from "@/lib/logger";

/* ============================================================
   경로 지도 (카카오맵 JS SDK)

   ODsay 가이드의 3단계 구조를 그대로 따릅니다.
     1) searchPubTransPathT  → 경로 후보 + info.mapObj   (검색 화면)
     2) loadLane(mapObj)     → 실제 노선 선형 graphPos   (/api/transit/lane)
     3) 카카오맵 Polyline    → 여기

   데이터는 전부 ODsay 가 만들고, 카카오맵은 그리는 도구입니다.

   설계 원칙 하나: **지도는 없어도 되는 것으로 만듭니다.**
   키가 없거나 SDK 가 막히거나 loadLane 이 실패해도 경로 상세 화면은
   그대로 동작해야 합니다. 선형을 못 받으면 정차역을 이은 선으로 물러섭니다.
   ============================================================ */

const SDK_TIMEOUT_MS = 8000;

/** 구간 색. 카드·진행 바와 같은 값을 써야 눈으로 이어집니다. */
const STROKE: Record<string, string> = {
  walk: "#747784",
  subway: "#0040a3",
  bus: "#0068b7",
  bike: "#a9641f",
  taxi: "#a9641f",
};

let sdkPromise: Promise<void> | null = null;

function loadKakaoSdk(appKey: string): Promise<void> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("카카오맵 SDK 응답이 없습니다")),
      SDK_TIMEOUT_MS,
    );

    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const fail = (message: string) => {
      clearTimeout(timer);
      // 다음 마운트에서 다시 시도할 수 있게 캐시를 비웁니다.
      sdkPromise = null;
      reject(new Error(message));
    };

    if (window.kakao?.maps) {
      window.kakao.maps.load(done);
      return;
    }

    const script = document.createElement("script");
    // autoload=false 로 받아서 kakao.maps.load() 안에서 객체를 만듭니다.
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        fail("카카오맵 SDK를 초기화하지 못했습니다");
        return;
      }
      window.kakao.maps.load(done);
    };
    script.onerror = () => fail("카카오맵 SDK를 불러오지 못했습니다");
    document.head.appendChild(script);
  });

  return sdkPromise;
}

/** 구간이 지나는 좌표열. 승차역 → 정차역들 → 하차역. 선형을 못 받았을 때의 대체. */
function pointsOf(segment: RouteSegment): LanePath {
  const points: LanePath = [];
  if (segment.start) points.push(segment.start);
  for (const stop of segment.stops ?? []) points.push({ lat: stop.lat, lng: stop.lng });
  if (segment.end) points.push(segment.end);

  return points.filter(
    (p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lng !== points[i - 1].lng,
  );
}

type Status = "loading" | "ready" | "no-key" | "failed";
/** "pending" = loadLane 응답 대기, null = 선형 없음(정차역으로 대체) */
type Lanes = LanePath[] | null | "pending";

export function RouteMap({
  segments,
  mapObj,
  appKey,
}: {
  segments: RouteSegment[];
  /** ODsay info.mapObj. 있으면 실제 선형을 받아 그립니다 */
  mapObj?: string;
  /** NEXT_PUBLIC_KAKAO_JS_KEY. 서버 컴포넌트에서 읽어 내려줍니다 */
  appKey?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>(appKey ? "loading" : "no-key");
  const [lanes, setLanes] = useState<Lanes>(mapObj ? "pending" : null);

  // ── 2단계: 노선 선형 받기 ──────────────────────────────────
  useEffect(() => {
    if (!mapObj) {
      setLanes(null);
      return;
    }
    let cancelled = false;
    setLanes("pending");

    fetch(`/api/transit/lane?mapObj=${encodeURIComponent(mapObj)}`)
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;

        if (!response.ok || !Array.isArray(data.lanes) || data.lanes.length === 0) {
          log.info("노선 선형 없음 — 정차역 좌표로 대체", { code: data?.error?.code });
          setLanes(null);
          return;
        }
        log.debug("노선 선형 받음", { lanes: data.lanes.length, fromCache: !!data.fromCache });
        setLanes(data.lanes as LanePath[]);
      })
      .catch((cause) => {
        if (cancelled) return;
        log.error("노선 선형 요청 실패", { message: String(cause).slice(0, 120) });
        setLanes(null);
      });

    return () => {
      cancelled = true;
    };
  }, [mapObj]);

  // ── 3단계: 지도에 그리기 ───────────────────────────────────
  useEffect(() => {
    if (!appKey) {
      log.info("지도 건너뜀 — NEXT_PUBLIC_KAKAO_JS_KEY 없음");
      return;
    }
    // 선형을 기다리는 동안에는 그리지 않습니다. 두 번 그리면 선이 겹칩니다.
    if (lanes === "pending") return;

    let cancelled = false;
    const began = Date.now();

    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !boxRef.current || !window.kakao?.maps) return;
        const maps = window.kakao.maps;

        const walks = segments.filter((s) => s.type === "walk");
        const rides = segments.filter((s) => s.type !== "walk");

        // 선형이 있으면 그것으로, 없으면 정차역을 이어서.
        const usingLanes = Array.isArray(lanes) && lanes.length > 0;
        const ridePaths: { path: LanePath; color: string }[] = usingLanes
          ? lanes.map((path, i) => ({
              // lane[i] 는 i 번째 탑승 구간에 대응합니다. 개수가 어긋나면
              // 색만 기본값이 되고 선은 그대로 그려집니다.
              path,
              color: STROKE[rides[i]?.type ?? "subway"] ?? STROKE.subway,
            }))
          : rides.map((segment) => ({
              path: pointsOf(segment),
              color: STROKE[segment.type] ?? STROKE.subway,
            }));

        const walkPaths = walks.map((segment) => pointsOf(segment));
        const drawable = [...ridePaths.map((r) => r.path), ...walkPaths].filter(
          (p) => p.length >= 2,
        );

        if (drawable.length === 0) {
          log.error("그릴 좌표가 없습니다");
          setStatus("failed");
          return;
        }

        const first = drawable[0][0];
        const map = new maps.Map(boxRef.current, {
          center: new maps.LatLng(first.lat, first.lng),
          level: 6,
        });

        const bounds = new maps.LatLngBounds();
        const toLatLng = (p: { lat: number; lng: number }) => new maps.LatLng(p.lat, p.lng);

        for (const { path, color } of ridePaths) {
          if (path.length < 2) continue;
          const latlngs = path.map(toLatLng);
          latlngs.forEach((ll) => bounds.extend(ll));
          new maps.Polyline({
            path: latlngs,
            strokeWeight: 6,
            strokeColor: color,
            strokeOpacity: 0.9,
            strokeStyle: "solid",
          }).setMap(map);
        }

        for (const path of walkPaths) {
          if (path.length < 2) continue;
          const latlngs = path.map(toLatLng);
          latlngs.forEach((ll) => bounds.extend(ll));
          new maps.Polyline({
            path: latlngs,
            strokeWeight: 4,
            strokeColor: STROKE.walk,
            strokeOpacity: 0.9,
            strokeStyle: "shortdash",
          }).setMap(map);
        }

        // 출발·도착 표시. 전체 경로의 처음과 끝입니다.
        const head = pointsOf(segments[0])[0] ?? drawable[0][0];
        const lastSeg = pointsOf(segments[segments.length - 1]);
        const tail = lastSeg[lastSeg.length - 1] ?? drawable[drawable.length - 1].at(-1)!;

        new maps.CustomOverlay({
          position: toLatLng(head),
          content: dot("#0266ff", "출발"),
          map,
          zIndex: 3,
        });
        new maps.CustomOverlay({
          position: toLatLng(tail),
          content: dot("#002c74", "도착"),
          map,
          zIndex: 3,
        });
        bounds.extend(toLatLng(head));
        bounds.extend(toLatLng(tail));

        if (!bounds.isEmpty()) map.setBounds(bounds, 28, 28, 28, 28);
        map.relayout();
        if (!bounds.isEmpty()) map.setBounds(bounds, 28, 28, 28, 28);

        log.info("지도 표시 완료", {
          source: usingLanes ? "loadLane 선형" : "정차역 좌표",
          lines: drawable.length,
          points: drawable.reduce((n, p) => n + p.length, 0),
          elapsedMs: Date.now() - began,
        });
        setStatus("ready");
      })
      .catch((cause) => {
        // 도메인 미등록이 가장 흔한 원인입니다.
        log.error("지도 로드 실패", { message: String(cause?.message ?? cause).slice(0, 160) });
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, segments, lanes]);

  const approximate = status === "ready" && lanes === null && !!mapObj;

  return (
    <section
      aria-label="경로 지도"
      className="relative rounded-xl overflow-hidden shadow-sm border border-outline-variant bg-surface-container-low aspect-[16/10] max-w-full"
    >
      <div ref={boxRef} className="absolute inset-0" />

      {approximate ? (
        <span className="absolute top-space-sm left-space-sm z-10 font-label-md text-label-md text-on-surface-variant bg-surface-container-lowest/90 px-2 py-1 rounded-lg tracking-normal">
          정류장을 이은 대략 경로입니다
        </span>
      ) : null}

      {status === "ready" ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-space-xs text-center px-space-base">
          {status === "loading" ? (
            <>
              <Icon name="map" size={28} className="text-outline" />
              <span className="font-label-md text-label-md text-on-surface-variant tracking-normal">
                지도를 불러오는 중…
              </span>
            </>
          ) : status === "no-key" ? (
            <>
              <Icon name="key_off" size={28} className="text-outline" />
              <span className="font-label-md text-label-md text-on-surface-variant tracking-normal">
                NEXT_PUBLIC_KAKAO_JS_KEY 가 설정되지 않았습니다
              </span>
            </>
          ) : (
            <>
              <Icon name="map" size={28} className="text-outline" />
              <span className="font-label-md text-label-md text-on-surface-variant tracking-normal">
                지도를 표시할 수 없습니다. 경로 안내는 아래에서 그대로 확인하세요.
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** CustomOverlay 안에는 Tailwind 대신 인라인 스타일을 씁니다. */
function dot(color: string, label: string): string {
  return (
    `<div style="display:flex;align-items:center;gap:4px;transform:translate(-50%,-50%)">` +
    `<span style="width:14px;height:14px;border-radius:9999px;background:${color};` +
    `border:3px solid #fff;box-shadow:0 1px 3px rgba(25,28,31,.4)"></span>` +
    `<span style="background:#fff;border:1px solid #c3c6d5;border-radius:4px;padding:1px 5px;` +
    `font-size:11px;font-weight:700;color:#191c1f;white-space:nowrap">${label}</span>` +
    `</div>`
  );
}
