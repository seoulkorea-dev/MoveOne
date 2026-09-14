"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Banner, BTN_PRIMARY, INPUT_CLASS, SectionTitle } from "@/components/app-chrome";
import { loadRecent, pushRecent, saveSearch, clearRecent, type RecentPair } from "@/lib/search-store";
import type { Place } from "@/lib/routes";

const CHIP_ON =
  "shrink-0 px-space-md py-2 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm flex items-center gap-1.5 transition-all min-h-[36px]";
const CHIP_OFF =
  "shrink-0 px-space-md py-2 rounded-lg bg-surface-container-lowest text-on-surface-variant font-label-lg text-label-lg shadow-sm transition-all min-h-[36px]";
const CHIP_DISABLED =
  "shrink-0 px-space-md py-2 rounded-lg bg-surface-container-low text-outline font-label-lg text-label-lg min-h-[36px] cursor-not-allowed";

export default function SearchForm() {
  const router = useRouter();
  const [departure, setDeparture] = useState<Place | null>(null);
  const [arrival, setArrival] = useState<Place | null>(null);
  const [depText, setDepText] = useState("");
  const [arrText, setArrText] = useState("");
  const [recent, setRecent] = useState<RecentPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const canSearch = departure !== null && arrival !== null && !loading;

  const runSearch = useCallback(
    async (from: Place, to: Place) => {
      setLoading(true);
      setNotice(null);

      try {
        const response = await fetch("/api/transit/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ departure: from, arrival: to }),
        });
        const data = await response.json();

        if (!response.ok) {
          // 수도권 밖은 오류가 아니라 안내입니다. 화면을 떠나지 않습니다.
          if (data?.error?.code === "out_of_service_area") {
            setNotice(data.error.message ?? "현재 수도권만 지원합니다.");
            setLoading(false);
            return;
          }
          // 그 밖의 실패(ODsay 응답 지연·오류)는 진단 정보를 갖춘 오류 화면으로 보냅니다.
          router.push(`/error/data?code=${encodeURIComponent(data?.error?.code ?? "unknown")}`);
          return;
        }

        saveSearch({
          departure: from,
          arrival: to,
          routes: data.routes ?? [],
          fromCache: !!data.fromCache,
          fetchedAt: data.fetchedAt,
          searchId: data.searchId ?? null,
        });
        pushRecent({ departure: from, arrival: to });
        router.push("/search/result");
      } catch {
        router.push("/error/data?code=network");
      }
    },
    [router],
  );

  function swap() {
    setDeparture(arrival);
    setArrival(departure);
    setDepText(arrText);
    setArrText(depText);
  }

  return (
    <>
      {/* 출발 / 도착 */}
      <section className="bg-surface-container-lowest rounded-xl p-space-base shadow-md flex items-center gap-space-sm">
        <div className="flex flex-col items-center gap-1 pt-3 shrink-0" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-secondary-container" />
          <span className="w-px h-6 bg-outline-variant" />
          <Icon name="location_on" size={16} className="text-primary" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-space-sm">
          <PlaceField
            id="origin"
            label="출발지"
            placeholder="출발지 입력"
            text={depText}
            onText={setDepText}
            onPick={setDeparture}
          />
          <PlaceField
            id="dest"
            label="도착지"
            placeholder="도착지 입력"
            text={arrText}
            onText={setArrText}
            onPick={setArrival}
          />
        </div>

        <button
          type="button"
          onClick={swap}
          aria-label="출발지와 도착지 반전"
          className="w-11 h-11 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors shrink-0"
        >
          <Icon name="swap_vert" size={20} />
        </button>
      </section>

      {notice ? (
        <Banner tone="info" icon="map" title="이 구간은 아직 검색할 수 없습니다">
          {notice}
        </Banner>
      ) : null}

      {/* 출발 시각 — 1차는 '지금 출발'만 지원합니다 */}
      <div className="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-0.5">
        <span className={CHIP_ON}>
          <Icon name="schedule" size={16} filled />
          지금 출발
        </span>
        <span className={CHIP_DISABLED} aria-disabled="true">
          출발 시각 지정
        </span>
        <span className={CHIP_DISABLED} aria-disabled="true">
          도착 시각 지정
        </span>
      </div>

      {/* 교통수단 — ODsay 호출에 아직 수단 필터를 넘기지 않으므로 표시만 합니다 */}
      <section aria-label="교통수단" className="flex flex-col gap-space-sm">
        <h2 className="font-label-lg text-label-lg text-on-surface-variant tracking-normal">
          교통수단
        </h2>
        <div className="flex items-center gap-space-xs flex-wrap">
          <span className={CHIP_ON}>
            <Icon name="subway" size={16} />
            지하철
          </span>
          <span className={CHIP_ON}>
            <Icon name="directions_bus" size={16} />
            버스
          </span>
          <span className={CHIP_OFF + " opacity-60"} aria-disabled="true">
            최소 도보
          </span>
        </div>
        <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
          1차에서는 지하철과 버스를 함께 검색합니다. 수단별 필터는 다음 단계입니다.
        </p>
      </section>

      <Banner tone="info" icon="map" title="수도권만 검색됩니다">
        1차 서비스 지역은 서울·경기·인천입니다. 그 밖의 출발·도착지는 검색 전에 안내합니다.
      </Banner>

      {recent.length > 0 ? (
        <>
          <SectionTitle>최근 검색</SectionTitle>
          <section className="bg-surface-container-lowest rounded-xl divide-y divide-outline-variant/60 shadow-sm overflow-hidden">
            {recent.map((pair, i) => (
              <button
                key={i}
                type="button"
                disabled={loading}
                onClick={() => runSearch(pair.departure, pair.arrival)}
                className="w-full flex items-center gap-space-sm p-space-base min-h-[44px] text-left hover:bg-surface-container-low transition-colors disabled:opacity-50"
              >
                <Icon name="history" size={18} className="text-outline" />
                <span className="flex-1 min-w-0 flex items-center gap-space-xs">
                  <span className="font-body-md text-body-md text-on-surface truncate">
                    {placeLabel(pair.departure)}
                  </span>
                  <Icon name="arrow_right_alt" size={14} className="text-outline-variant" />
                  <span className="font-body-md text-body-md text-on-surface truncate">
                    {placeLabel(pair.arrival)}
                  </span>
                </span>
              </button>
            ))}
          </section>
          <button
            type="button"
            onClick={() => {
              clearRecent();
              setRecent([]);
            }}
            className="self-end font-label-lg text-label-lg text-secondary min-h-[44px] px-space-xs"
          >
            최근 검색 지우기
          </button>
        </>
      ) : null}

      <button
        type="button"
        className={BTN_PRIMARY}
        disabled={!canSearch}
        onClick={() => departure && arrival && runSearch(departure, arrival)}
      >
        <span>{loading ? "경로를 찾는 중…" : "경로 검색"}</span>
        {loading ? null : <Icon name="search" size={18} />}
      </button>
    </>
  );
}

function placeLabel(place: Place): string {
  return place.name ?? place.address ?? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`;
}

/* ---------------- 장소 입력 (자동완성) ---------------- */

function PlaceField({
  id,
  label,
  placeholder,
  text,
  onText,
  onPick,
}: {
  id: string;
  label: string;
  placeholder: string;
  text: string;
  onText: (value: string) => void;
  onPick: (place: Place | null) => void;
}) {
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 입력할 때마다 호출하면 카카오 API 한도를 낭비합니다.
  // 250ms 쉬었을 때만 보냅니다. 이 값을 늘리거나 지우지 마세요.
  useEffect(() => {
    if (text.trim().length < 2) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        setOptions(data.places ?? []);
        setOpen(true);
      } catch {
        /* 입력이 이어지는 중의 취소는 정상입니다 */
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        className={INPUT_CLASS}
        onChange={(event) => {
          onText(event.target.value);
          onPick(null); // 다시 타이핑하면 선택이 해제됩니다
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
      />

      {open && options.length > 0 ? (
        <div className="absolute z-20 inset-x-0 top-[calc(100%+4px)] bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg max-h-64 overflow-y-auto p-1">
          {options.map((place, i) => (
            <button
              key={`${place.lat}-${place.lng}-${i}`}
              type="button"
              className="w-full text-left px-space-md py-space-sm rounded-lg hover:bg-surface-container-low min-h-[44px]"
              onClick={() => {
                onPick(place);
                onText(place.name ?? place.address ?? "");
                setOpen(false);
              }}
            >
              <span className="block font-body-md text-body-md text-on-surface">
                {place.name ?? place.address}
              </span>
              {place.address ? (
                <span className="block font-label-md text-label-md text-on-surface-variant tracking-normal">
                  {place.address}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
