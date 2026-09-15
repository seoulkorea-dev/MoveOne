"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { log } from "@/lib/logger";

/**
 * ODsay 지하철 노선도.
 *
 * 지하철만으로 이루어진 경로에서는 지리 지도보다 노선도가 낫습니다.
 * 승하차역과 환승역이 한눈에 들어오고, 실제 철로를 따라가는 선이라
 * 도로 위에 그려진 선을 보고 헷갈릴 일이 없습니다.
 *
 * 가이드: lab.odsay.com/guide/subwayMapDemo (2026-05-28 추가)
 *
 *   <script src="https://api.odsay.com/v1/api/subway/sdk.js?apiKey=…&callback=…">
 *   new odsay.maps.Subway(div, { lang: 0, CID: 1000 })   // 1000 = 수도권
 *   map.addMarker("s", 출발역ID)   // s=출발 m=경유 e=도착
 *   map.addMarker("e", 도착역ID)   // 둘 다 찍히면 노선도가 알아서 경로를 그립니다
 *
 * 중요 — 여기 쓰는 키는 **서버 키가 아닙니다.**
 * 이 SDK 는 브라우저에서 돌기 때문에 ODsay 콘솔에서 Web 플랫폼으로 도메인을
 * 등록한 키가 필요합니다. 카카오 JS 키와 같은 성격이라 브라우저에 노출됩니다.
 * ODSAY_API_KEY(서버·IP 등록)를 그대로 쓰면 인증에 실패합니다.
 */

/** 수도권. 부산 7000, 대구 4000, 광주 5000, 대전 3000 */
const CID_CAPITAL = 1000;
const LANG_KO = 0;
const SDK_TIMEOUT_MS = 8000;

let sdkPromise: Promise<void> | null = null;

function loadSubwaySdk(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저가 아닙니다"));
  }
  if (window.odsay?.maps?.Subway) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      sdkPromise = null;
      reject(new Error(`ODsay 노선도 SDK 응답이 ${SDK_TIMEOUT_MS / 1000}초 안에 없었습니다`));
    }, SDK_TIMEOUT_MS);

    window.odsaySubwayReady = () => {
      clearTimeout(timer);
      resolve();
    };

    const script = document.createElement("script");
    script.src =
      `https://api.odsay.com/v1/api/subway/sdk.js` +
      `?apiKey=${encodeURIComponent(apiKey)}&callback=odsaySubwayReady`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      sdkPromise = null;
      // 실패 원인은 대개 둘 중 하나입니다. 메시지에 적어 두면 다음 사람이 덜 헤맵니다.
      reject(
        new Error(
          "ODsay 노선도 SDK 를 불러오지 못했습니다. " +
            "① ODsay 콘솔에 Web 플랫폼으로 이 도메인이 등록됐는지 " +
            "② 서버 키가 아니라 웹 키인지 확인하세요",
        ),
      );
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

type Status = "loading" | "ready" | "failed" | "no-key" | "no-station";

export function SubwayMap({
  startStationId,
  endStationId,
  startName,
  endName,
  apiKey,
}: {
  /** ODsay 역 ID. searchPubTransPathT 의 subPath[].startID 입니다 */
  startStationId?: string;
  endStationId?: string;
  startName?: string;
  endName?: string;
  /** NEXT_PUBLIC_ODSAY_WEB_KEY. 서버 컴포넌트에서 읽어 내려줍니다 */
  apiKey?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  const startId = numericId(startStationId);
  const endId = numericId(endStationId);

  const [status, setStatus] = useState<Status>(() => {
    if (!apiKey) return "no-key";
    if (startId === null || endId === null) return "no-station";
    return "loading";
  });
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || startId === null || endId === null) return;

    let cancelled = false;
    const began = Date.now();
    const container = boxRef.current;

    loadSubwaySdk(apiKey)
      .then(() => {
        if (cancelled || !container) return;
        const Subway = window.odsay?.maps?.Subway;
        if (!Subway) throw new Error("odsay.maps.Subway 가 없습니다");

        const map = new Subway(container, { lang: LANG_KO, CID: CID_CAPITAL });

        // 출발·도착을 찍으면 노선도가 스스로 경로를 찾아 강조합니다.
        map.addMarker("s", startId);
        map.addMarker("e", endId);

        // 노선도가 실제로 경로를 그렸는지 확인할 수 있는 유일한 신호입니다.
        map.addEvent("path_changed", () => {
          log.info("노선도 경로 표시됨", { startId, endId, elapsedMs: Date.now() - began });
        });

        setStatus("ready");
        log.info("지하철 노선도 표시 완료", {
          startId,
          endId,
          elapsedMs: Date.now() - began,
        });
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = String(cause?.message ?? cause).slice(0, 240);
        log.error("지하철 노선도 로드 실패", {
          message,
          keyPrefix: apiKey ? `${apiKey.slice(0, 4)}…(${apiKey.length}자)` : "없음",
          origin: typeof window === "undefined" ? "" : window.location.origin,
        });
        setReason(message);
        setStatus("failed");
      });

    return () => {
      cancelled = true;
      // SDK 에 정리 함수가 문서화돼 있지 않아 컨테이너를 비웁니다.
      // 비우지 않으면 경로를 옮겨 다닐 때 노선도가 겹쳐 쌓입니다.
      if (container) container.innerHTML = "";
    };
  }, [apiKey, startId, endId]);

  return (
    <section className="rounded-xl overflow-hidden shadow-sm bg-surface-container-lowest">
      <div className="flex items-center gap-space-xs px-space-base pt-space-md">
        <Icon name="subway" size={18} className="text-subway" />
        <span className="font-label-lg text-label-lg text-on-surface-variant">
          지하철 노선도
        </span>
        {startName && endName ? (
          <span className="font-label-md text-label-md text-on-surface-variant truncate">
            {startName} → {endName}
          </span>
        ) : null}
      </div>

      <div className="relative mt-space-sm">
        {/* 노선도는 넓어야 읽힙니다. 지도보다 높게 잡았습니다. */}
        <div ref={boxRef} className="w-full h-[380px] bg-surface-container-low" />

        {status !== "ready" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-space-xs bg-surface-container-low px-space-base text-center">
            {status === "loading" ? (
              <>
                <div className="skeleton w-full h-full absolute inset-0" aria-hidden="true" />
                <span className="relative font-body-md text-body-md text-on-surface-variant">
                  노선도를 불러오는 중입니다
                </span>
              </>
            ) : (
              <>
                <Icon name="subway" size={28} className="text-outline" />
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {MESSAGE[status]}
                </p>
                {reason ? (
                  <p className="font-label-md text-label-md text-on-surface-variant tracking-normal max-w-xs">
                    {reason}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const MESSAGE: Record<Status, string> = {
  loading: "노선도를 불러오는 중입니다",
  ready: "",
  failed: "노선도를 불러오지 못했습니다",
  "no-key": "NEXT_PUBLIC_ODSAY_WEB_KEY 가 설정되지 않았습니다",
  "no-station": "이 경로에는 역 ID가 없어 노선도를 그릴 수 없습니다",
};

/** ODsay 역 ID 는 숫자입니다. 우리는 문자열로 보관하므로 여기서 되돌립니다. */
function numericId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
