"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import type { LanePath, RouteSegment, RouteStop } from "@/lib/routes";
import { MODE_COLOR, POINT_COLOR } from "@/lib/routing/line-colors";
import { log } from "@/lib/logger";

/* ============================================================
   경로 지도 (카카오맵 JS SDK)

   그리는 것은 세 층입니다.
     1) 선   — 탑승 구간은 노선색 실선, 도보는 회색 점선
     2) 점   — 지나는 역·정류장. 환승 지점은 노랑
     3) 라벨 — 승차·하차 지점의 이름, 그리고 출발·도착

   좌표의 출처는 segment.stops 입니다.
     지하철 → subway_station 마스터에서 역명으로 찾은 좌표
     버스   → bus_route_stop 캐시(노선정보 API)의 정류장 좌표
   ODsay 경로는 loadLane 선형이 있으면 그것을 먼저 씁니다.

   설계 원칙 하나: **지도는 없어도 되는 것으로 만듭니다.**
   키가 없거나 SDK 가 막히거나 선형을 못 받아도 경로 상세 화면은
   그대로 동작해야 합니다.
   ============================================================ */

const SDK_TIMEOUT_MS = 8000;

/**
 * 중간역 라벨을 붙일지 정하는 한계.
 * 정류장이 많은 광역버스는 이름을 다 쓰면 지도가 글자로 덮입니다.
 * 이 수를 넘으면 승·하차 지점만 이름을 답니다.
 */
const MAX_LABELS = 12;

/** 실제로 서지 않는 지점. 선은 지나가지만 점·이름은 찍지 않습니다. */
function isPassThrough(name: string | undefined): boolean {
  return !!name && name.includes("미정차");
}

function colorOf(segment: RouteSegment): string {
  return segment.color ?? MODE_COLOR[segment.type] ?? MODE_COLOR.subway;
}

/** 좌표를 비교용 열쇠로. 같은 지점인지 판단할 때 씁니다. */
function keyOf(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

/**
 * 환승 지점의 좌표 열쇠 모음.
 *
 * 환승은 **탑승 구간과 탑승 구간이 맞닿는 곳**입니다. 도보 구간은 세지
 * 않습니다 — 출발지에서 역까지 걷는 것은 환승이 아닙니다.
 *
 * 양쪽 끝을 모두 넣습니다.
 *   지하철 — 내린 역과 탄 역이 같은 역이라 열쇠가 하나로 합쳐집니다
 *   버스   — 내린 정류장과 탄 정류장이 다를 수 있어 둘 다 표시됩니다.
 *            그 사이를 잇는 도보 점선이 이미 그려지므로, 두 노란 점이
 *            "여기서 내려 저기서 타라" 를 그대로 보여줍니다.
 */
function transferKeys(rides: RouteSegment[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 1; i < rides.length; i += 1) {
    const alight = rides[i - 1].stops?.at(-1) ?? rides[i - 1].end;
    const board = rides[i].stops?.[0] ?? rides[i].start;
    if (alight) keys.add(keyOf(alight));
    if (board) keys.add(keyOf(board));
  }
  return keys;
}

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
    // script 태그는 실패 이유(HTTP 상태)를 알려주지 않습니다.
    // 원인이 거의 정해져 있으므로 후보를 메시지에 담아 둡니다.
    script.onerror = () =>
      fail(
        "카카오맵 SDK를 불러오지 못했습니다. " +
          "① 카카오 콘솔 > 플랫폼 > Web 에 http://localhost:4100 이 등록됐는지 " +
          "② NEXT_PUBLIC_KAKAO_JS_KEY 가 REST 키가 아니라 JavaScript 키인지 확인하세요.",
      );
    document.head.appendChild(script);
  });

  return sdkPromise;
}

/** 구간이 지나는 좌표열. 승차역 → 정차역들 → 하차역. */
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

  // ── 노선 선형 받기 (ODsay 경로에만 있습니다) ────────────────
  useEffect(() => {
    if (!mapObj) return;
    let cancelled = false;

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

  // ── 지도에 그리기 ──────────────────────────────────────────
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
              color: rides[i] ? colorOf(rides[i]) : MODE_COLOR.subway,
            }))
          : rides.map((segment) => ({
              path: pointsOf(segment),
              color: colorOf(segment),
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

        // ── 1층: 선 ──────────────────────────────────────────
        for (const { path, color } of ridePaths) {
          if (path.length < 2) continue;
          const latlngs = path.map(toLatLng);
          latlngs.forEach((ll) => bounds.extend(ll));
          // 흰 테두리를 먼저 깔면 노선색이 지도 위에서 또렷해집니다.
          new maps.Polyline({
            path: latlngs,
            strokeWeight: 10,
            strokeColor: "#ffffff",
            strokeOpacity: 0.9,
            strokeStyle: "solid",
          }).setMap(map);
          new maps.Polyline({
            path: latlngs,
            strokeWeight: 6,
            strokeColor: color,
            strokeOpacity: 0.95,
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
            strokeColor: MODE_COLOR.walk,
            strokeOpacity: 0.9,
            strokeStyle: "shortdash",
          }).setMap(map);
        }

        // ── 2·3층: 역·정류장 점과 이름 ────────────────────────
        //
        // 이름을 전부 달면 정류장이 많은 광역버스에서 지도가 글자로 덮입니다.
        // 그래서 승·하차 지점만 이름을 달고, 중간은 작은 점만 찍습니다.
        // 구간이 적으면(MAX_LABELS 이하) 중간역 이름도 답니다.
        const stopCount = rides.reduce((n, s) => n + (s.stops?.length ?? 0), 0);
        const labelAll = stopCount <= MAX_LABELS;
        const transfers = transferKeys(rides);
        let dots = 0;
        let transferDots = 0;

        for (const segment of rides) {
          const color = colorOf(segment);
          const stops: RouteStop[] = segment.stops ?? [];

          stops.forEach((stop, i) => {
            if (isPassThrough(stop.name)) return;
            const edge = i === 0 || i === stops.length - 1;
            const position = toLatLng(stop);

            if (transfers.has(keyOf(stop))) {
              // 환승 지점. 노선색 대신 노랑으로 덮어씁니다 — 한 화면에서
              // "갈아타는 곳" 이 색만으로 읽혀야 합니다.
              new maps.CustomOverlay({
                position,
                content: transferMark(stop.name ?? ""),
                map,
                zIndex: 3,
              });
              transferDots += 1;
            } else if (edge || labelAll) {
              new maps.CustomOverlay({
                position,
                content: stationMark(color, stop.name ?? "", edge),
                map,
                zIndex: edge ? 2 : 1,
              });
            } else {
              new maps.CustomOverlay({
                position,
                content: plainDot(color),
                map,
                zIndex: 1,
              });
            }
            dots += 1;
          });
        }

        // ── 출발·도착 ────────────────────────────────────────
        const head = pointsOf(segments[0])[0] ?? drawable[0][0];
        const lastSeg = pointsOf(segments[segments.length - 1]);
        const tail = lastSeg[lastSeg.length - 1] ?? drawable[drawable.length - 1].at(-1)!;

        new maps.CustomOverlay({
          position: toLatLng(head),
          content: endpoint(POINT_COLOR.start, "출발"),
          map,
          zIndex: 4,
        });
        new maps.CustomOverlay({
          position: toLatLng(tail),
          content: endpoint(POINT_COLOR.end, "도착"),
          map,
          zIndex: 4,
        });
        bounds.extend(toLatLng(head));
        bounds.extend(toLatLng(tail));

        if (!bounds.isEmpty()) map.setBounds(bounds, 28, 28, 28, 28);
        map.relayout();
        if (!bounds.isEmpty()) map.setBounds(bounds, 28, 28, 28, 28);

        log.info("지도 표시 완료", {
          source: usingLanes ? "loadLane 선형" : "정차역 좌표",
          lines: drawable.length,
          정류장: dots,
          환승지점: transferDots,
          이름표시: labelAll ? "전체" : "승하차만",
          elapsedMs: Date.now() - began,
        });
        setStatus("ready");
      })
      .catch((cause) => {
        // 도메인 미등록이 가장 흔한 원인입니다.
        log.error("지도 로드 실패", {
          message: String(cause?.message ?? cause).slice(0, 240),
          // 키 값은 남기지 않고 앞 4자리만 — 어떤 키를 쓰는지 구분하기 위해서입니다.
          keyPrefix: appKey ? `${appKey.slice(0, 4)}…(${appKey.length}자)` : "없음",
          origin: typeof window === "undefined" ? "" : window.location.origin,
        });
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, segments, lanes]);

  const approximate = status === "ready" && lanes === null;

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
              <span className="font-label-md text-label-md text-outline tracking-normal">
                카카오 콘솔의 플랫폼 &gt; Web 에 이 주소가 등록돼 있어야 합니다
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------
   CustomOverlay 안에는 Tailwind 가 닿지 않습니다. 인라인 스타일을 씁니다.
   XSS 방지: 역명은 API 에서 온 문자열이므로 반드시 이스케이프합니다.
   ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 중간 정차역. 작은 점만 찍습니다. */
function plainDot(color: string): string {
  return (
    `<span style="display:block;width:8px;height:8px;border-radius:9999px;` +
    `background:#fff;border:2px solid ${color};transform:translate(-50%,-50%)"></span>`
  );
}

/** 이름표. 어떤 마커든 같은 모양을 씁니다. */
function chip(text: string, bold: boolean): string {
  if (!text) return "";
  return (
    `<span style="background:rgba(255,255,255,.94);border:1px solid #c3c6d5;border-radius:4px;` +
    `padding:1px 4px;font-size:11px;font-weight:${bold ? 700 : 500};color:#191c1f;` +
    `white-space:nowrap">${escapeHtml(text)}</span>`
  );
}

/**
 * 점 둘레의 그림자.
 *
 * 흰 테두리만 두면 밝은 색(민트·노랑)이 지도의 흰 배경에 묻힙니다.
 * 바깥에 얇은 검은 링을 하나 더 둘러 어떤 색이든 윤곽이 남게 합니다.
 */
const RING = "box-shadow:0 0 0 1px rgba(25,28,31,.28),0 1px 3px rgba(25,28,31,.35)";

/** 승차·하차 지점. 큰 점에 이름을 답니다. */
function stationMark(color: string, name: string, emphasize: boolean): string {
  const size = emphasize ? 12 : 8;
  const border = emphasize ? 3 : 2;
  const dot =
    `<span style="width:${size}px;height:${size}px;border-radius:9999px;background:#fff;` +
    `border:${border}px solid ${color};box-shadow:0 1px 2px rgba(25,28,31,.3);flex:none"></span>`;
  return (
    `<div style="display:flex;align-items:center;gap:3px;transform:translate(-50%,-50%)">` +
    `${dot}${chip(name, emphasize)}</div>`
  );
}

/**
 * 환승 지점.
 *
 * 노란 점 안을 채우고(테두리만 두른 역 마커와 구분됩니다) 이름표에
 * "환승" 을 붙입니다. 색맹이신 분에게는 색만으로 구분이 안 되므로,
 * 글자가 같이 있어야 합니다.
 */
function transferMark(name: string): string {
  const dot =
    `<span style="width:13px;height:13px;border-radius:9999px;background:${POINT_COLOR.transfer};` +
    `border:2.5px solid #fff;${RING};flex:none"></span>`;
  const text = name ? `${name} 환승` : "환승";
  return (
    `<div style="display:flex;align-items:center;gap:3px;transform:translate(-50%,-50%)">` +
    `${dot}${chip(text, true)}</div>`
  );
}

/** 출발·도착 표시. */
function endpoint(color: string, label: string): string {
  return (
    `<div style="display:flex;align-items:center;gap:4px;transform:translate(-50%,-50%)">` +
    `<span style="width:15px;height:15px;border-radius:9999px;background:${color};` +
    `border:3px solid #fff;${RING};flex:none"></span>` +
    `${chip(label, true)}</div>`
  );
}
