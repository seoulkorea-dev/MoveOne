"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Banner, BTN_PRIMARY, INPUT_CLASS, SectionTitle } from "@/components/app-chrome";
import {
  clearPrefill,
  clearRecent,
  peekPrefill,
  pushRecent,
  saveSearch,
  useRecent,
  type SearchMode,
} from "@/lib/search-store";
import type { Place } from "@/lib/routes";
import type { Prefill } from "@/lib/search-store";
import { log } from "@/lib/logger";

const CHIP_BASE =
  "shrink-0 px-space-md py-2 rounded-lg font-label-lg text-label-lg transition-all min-h-[36px] flex items-center gap-1.5";
const CHIP_ON = `${CHIP_BASE} bg-primary-container text-on-primary shadow-sm`;
const CHIP_OFF = `${CHIP_BASE} bg-surface-container-lowest text-on-surface-variant hover:text-on-surface shadow-sm`;
const CHIP_DISABLED = `${CHIP_BASE} bg-surface-container-low text-outline cursor-not-allowed`;

/** 오류 페이지로 보내지 않고 화면에 안내만 띄울 코드들 */
const NOTICE_CODES = [
  "out_of_service_area",
  "subway_no_route",
  "subway_no_station",
  // 서울시 버스 API 가 "경로가 존재하지 않습니다"(headerCd 4)로 답한 경우.
  // 오류가 아니라 그 구간에 버스 경로가 없다는 사실입니다.
  "bus_no_route",
];

const MODES: { key: SearchMode; label: string; icon: string }[] = [
  { key: "all", label: "전체", icon: "commute" },
  { key: "subway", label: "지하철", icon: "subway" },
  { key: "bus", label: "버스", icon: "directions_bus" },
];

export default function SearchForm() {
  const router = useRouter();

  /**
   * 홈의 최근 검색 칩에서 넘어온 값.
   *
   * 효과가 아니라 **초기화 함수**에서 읽습니다. 효과 안에서 setState 로
   * 채우면 첫 화면이 빈 폼으로 한 번 그려진 뒤 다시 그려지고,
   * react-hooks/set-state-in-effect 규칙에도 걸립니다. 초기화 함수에서
   * 읽으면 처음부터 채워진 채로 한 번만 그립니다.
   *
   * peekPrefill 은 읽기만 하고 지우지 않습니다. 지우는 일은 아래 효과가
   * 합니다 — 그쪽은 setState 를 하지 않으므로 규칙에 걸리지 않습니다.
   */
  const [prefill] = useState<Prefill | null>(() => peekPrefill());

  const [departure, setDeparture] = useState<Place | null>(prefill?.departure ?? null);
  const [arrival, setArrival] = useState<Place | null>(prefill?.arrival ?? null);
  const [depText, setDepText] = useState(prefill ? placeLabel(prefill.departure) : "");
  const [arrText, setArrText] = useState(prefill ? placeLabel(prefill.arrival) : "");
  // 홈 화면의 이동수단 타일이 /search?mode=subway 로 들어옵니다.
  // 값이 이상하면 조용히 "전체" 로 둡니다 — 잘못된 쿼리로 화면이 깨지면 안 됩니다.
  const params = useSearchParams();
  const [mode, setMode] = useState<SearchMode>(() => {
    const requested = params.get("mode");
    return requested === "subway" || requested === "bus" ? requested : "all";
  });
  const recent = useRecent();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 지하철로 못 찾았을 때 '전체로 다시 검색' 버튼을 보일지 */
  const [retryAll, setRetryAll] = useState(false);

  /**
   * 넘겨받은 값을 지웁니다. 위에서 이미 읽어 두었습니다.
   *
   * setState 를 하지 않습니다 — 그래서 효과로 둬도 렌더가 더 돌지 않고
   * react-hooks/set-state-in-effect 에도 걸리지 않습니다.
   * StrictMode 가 두 번 실행해도 두 번 지울 뿐이라 문제없습니다.
   */
  useEffect(() => {
    if (prefill === null) return;
    clearPrefill();
    log.debug("검색 폼 미리 채움", {
      from: prefill.departure.name ?? prefill.departure.address,
      to: prefill.arrival.name ?? prefill.arrival.address,
    });
  }, [prefill]);

  const canSearch = departure !== null && arrival !== null && !loading;

  const runSearch = useCallback(
    async (from: Place, to: Place, searchMode: SearchMode) => {
      setLoading(true);
      setNotice(null);
      setRetryAll(false);
      // 좌표는 위치 정보라 로그에 남기지 않습니다. 이름과 수단만 남깁니다.
      log.info("경로 검색 요청", {
        from: from.name ?? from.address,
        to: to.name ?? to.address,
        mode: searchMode,
      });
      const began = Date.now();

      try {
        const response = await fetch("/api/transit/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ departure: from, arrival: to, mode: searchMode }),
        });
        const data = await response.json();

        if (!response.ok) {
          // 오류가 아니라 안내로 끝낼 코드들. 화면을 떠나지 않습니다.
          //   out_of_service_area — 수도권 밖
          //   subway_no_route     — 이 구간은 지하철로 갈 수 없음
          //                         (공공 API 가 성공 코드에 빈 경로를 준 경우)
          //   subway_no_station   — 출발·도착지 근처에 지하철역이 없음
          const code = data?.error?.code as string | undefined;
          if (NOTICE_CODES.includes(code ?? "")) {
            log.info("검색 안내", { code, mode: searchMode });
            setNotice(data.error?.message ?? "이 구간은 검색할 수 없습니다.");
            // '전체'가 아닌 수단에서 못 찾았을 때만 넓혀볼 수 있습니다.
            // '전체'에서 실패하면 더 넓힐 곳이 없어 버튼이 의미가 없습니다.
            setRetryAll(searchMode !== "all" && code !== "out_of_service_area");
            setLoading(false);
            return;
          }
          log.error("경로 검색 실패", {
            status: response.status,
            code: data?.error?.code,
            message: data?.error?.message,
            detail: data?.error?.detail,
          });
          router.push(`/error/data?code=${encodeURIComponent(data?.error?.code ?? "unknown")}`);
          return;
        }

        saveSearch({
          departure: from,
          arrival: to,
          mode: searchMode,
          routes: data.routes ?? [],
          fromCache: !!data.fromCache,
          fetchedAt: data.fetchedAt,
          searchId: data.searchId ?? null,
        });
        pushRecent({ departure: from, arrival: to });
        log.info("경로 검색 성공", {
          count: data.routes?.length ?? 0,
          fromCache: !!data.fromCache,
          mode: data.mode,
          elapsedMs: Date.now() - began,
        });
        router.push("/search/result");
      } catch (cause) {
        log.error("경로 검색 네트워크 오류", { message: String(cause).slice(0, 120) });
        router.push("/error/data?code=network");
      }
    },
    [router],
  );

  function swap() {
    log.debug("출발·도착 반전");
    setDeparture(arrival);
    setArrival(departure);
    setDepText(arrText);
    setArrText(depText);
  }

  return (
    <>
      {/* 출발 / 도착 */}
      <section className="bg-surface-container-lowest rounded-xl p-space-base shadow-md flex items-start gap-space-sm">
        <div className="flex flex-col items-center gap-1 pt-4 shrink-0" aria-hidden="true">
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
            picked={departure}
            onText={setDepText}
            onPick={setDeparture}
          />
          <PlaceField
            id="dest"
            label="도착지"
            placeholder="도착지 입력"
            text={arrText}
            picked={arrival}
            onText={setArrText}
            onPick={setArrival}
          />
        </div>

        <button
          type="button"
          onClick={swap}
          data-log="search.swap"
          aria-label="출발지와 도착지 반전"
          className="w-11 h-11 mt-1 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors shrink-0"
        >
          <Icon name="swap_vert" size={20} />
        </button>
      </section>

      {notice ? (
        <Banner tone="info" icon="map" title="이 구간은 아직 검색할 수 없습니다">
          {notice}
        </Banner>
      ) : null}

      {/* 지하철로 못 찾은 경우에만. Banner 밖에 두는 이유는 Banner 가 본문을
          문단으로 감쌀 수 있어서입니다 — 문단 안의 버튼은 올바른 마크업이 아닙니다. */}
      {notice && retryAll && departure && arrival ? (
        <button
          type="button"
          data-log="search.retry.all"
          onClick={() => {
            log.debug("전체로 다시 검색");
            setMode("all");
            void runSearch(departure, arrival, "all");
          }}
          className="self-start inline-flex items-center gap-1.5 px-space-md py-2 rounded-lg bg-surface-container-lowest text-primary font-label-lg text-label-lg shadow-sm min-h-[36px]"
        >
          <Icon name="commute" size={16} />
          전체로 다시 검색
        </button>
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

      {/* 교통수단 — ODsay SearchPathType 으로 실제 전달됩니다 */}
      <section aria-label="교통수단" className="flex flex-col gap-space-sm">
        <h2 className="font-label-lg text-label-lg text-on-surface-variant tracking-normal">
          교통수단
        </h2>
        <div className="flex items-center gap-space-xs flex-wrap" role="radiogroup">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              data-log={`search.mode.${m.key}`}
              onClick={() => {
                log.debug("교통수단 변경", { from: mode, to: m.key });
                setMode(m.key);
              }}
              className={mode === m.key ? CHIP_ON : CHIP_OFF}
            >
              <Icon name={m.icon} size={16} filled={mode === m.key} />
              {m.label}
            </button>
          ))}
        </div>
        <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
          도보는 어느 경우에나 포함됩니다. 수단을 좁히면 결과가 달라지므로 캐시도 따로 잡힙니다.
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
                data-log="search.recent"
                onClick={() => runSearch(pair.departure, pair.arrival, mode)}
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
            // clearRecent 가 알림을 보내므로 useRecent 가 알아서 다시 읽습니다
            onClick={() => clearRecent()}
            className="self-end font-label-lg text-label-lg text-secondary min-h-[44px] px-space-xs"
          >
            최근 검색 지우기
          </button>
        </>
      ) : null}

      <div className="flex flex-col gap-space-xs">
        <button
          type="button"
          className={BTN_PRIMARY}
          data-log="search.submit"
          disabled={!canSearch}
          onClick={() => departure && arrival && runSearch(departure, arrival, mode)}
        >
          <span>{loading ? "경로를 찾는 중…" : "경로 검색"}</span>
          {loading ? null : <Icon name="search" size={18} />}
        </button>

        {/* 버튼이 왜 눌리지 않는지 보이지 않으면 고장으로 느껴집니다. */}
        {!canSearch && !loading ? (
          <p className="font-label-md text-label-md text-on-surface-variant tracking-normal text-center">
            {departure === null && arrival === null
              ? "출발지와 도착지를 입력하고 목록에서 선택해 주세요."
              : departure === null
                ? "출발지를 목록에서 선택해 주세요."
                : "도착지를 목록에서 선택해 주세요."}
          </p>
        ) : null}
      </div>
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
  picked,
  onText,
  onPick,
}: {
  id: string;
  label: string;
  placeholder: string;
  text: string;
  picked: Place | null;
  onText: (value: string) => void;
  onPick: (place: Place | null) => void;
}) {
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 두 글자 미만이면 아예 찾지 않습니다. 예전에는 여기서 state 를 비웠는데,
  // 효과 안에서 곧바로 setState 하면 렌더가 한 번 더 돕니다. 대신 아래에서
  // 화면에 내보낼 때 걸러냅니다 (visibleOptions/visibleError/visibleEmpty).
  const query = text.trim();
  const active = query.length >= 2;

  // 입력할 때마다 호출하면 카카오 API 한도를 낭비합니다.
  // 250ms 쉬었을 때만 보냅니다. 이 값을 늘리거나 지우지 마세요.
  useEffect(() => {
    /**
     * ★ 선택이 끝난 값은 다시 찾지 않습니다.
     *
     * 예전 증상: 목록에서 "광화문 광장"을 고르면 목록이 닫혔다가 곧바로
     * 다시 열렸습니다.
     *
     * 원인: 항목을 고를 때 onText(place.name) 으로 입력칸을 채웁니다.
     * 그러면 query 가 바뀌고, 이 효과가 "사용자가 입력했다"고 보고 다시
     * 돌아 setOpen(true) 로 덮어썼습니다. setOpen(false) 는 제대로
     * 실행됐지만 그 뒤에 이 효과가 이겼던 것입니다.
     *
     * 고친 방법: picked 가 있고 그 이름이 입력칸 값과 같으면 = 방금
     * 선택했거나 홈에서 넘어와 채워진 값이므로 찾지 않습니다.
     * 다시 타이핑하면 onChange 가 onPick(null) 을 불러 picked 가 비므로
     * 정상적으로 다시 찾습니다.
     */
    if (picked !== null && placeLabel(picked) === query) return;

    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          // 예전에는 여기서 조용히 넘어가서, 키가 없으면 화면이 아무 반응도
          // 하지 않는 것처럼 보였습니다. 이유를 반드시 보여줍니다.
          log.error("장소 검색 실패", {
            field: id,
            status: response.status,
            detail: data?.error?.detail,
          });
          // 개발 중에는 원인(카카오 응답 본문)까지 화면에 보여줍니다.
          setError(
            [data?.error?.message ?? "장소 검색에 실패했습니다.", data?.error?.detail]
              .filter(Boolean)
              .join(" — "),
          );
          setOptions([]);
          setEmpty(false);
          return;
        }

        const places: Place[] = data.places ?? [];
        setOptions(places);
        setError(null);
        setEmpty(places.length === 0);
        setOpen(places.length > 0);
        log.debug("장소 검색 결과", { field: id, query, count: places.length });
      } catch (cause) {
        // 입력이 이어지는 중의 취소는 정상입니다.
        if ((cause as Error)?.name === "AbortError") return;
        setError("장소 검색 중 네트워크 오류가 발생했습니다.");
        setOptions([]);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // picked 가 바뀌면 다시 판단해야 하므로 의존성에 넣습니다.
  }, [query, active, id, picked]);

  // 입력이 두 글자 미만으로 줄면 직전 결과를 보여주지 않습니다.
  const visibleOptions = active ? options : [];
  const visibleError = active ? error : null;
  const visibleEmpty = active ? empty : false;

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative flex flex-col gap-space-xxs" ref={boxRef}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={visibleError ? true : undefined}
        className={INPUT_CLASS}
        onChange={(event) => {
          onText(event.target.value);
          onPick(null); // 다시 타이핑하면 선택이 해제됩니다
        }}
        // 선택이 끝난 뒤에는 입력칸을 눌러도 옛 목록을 다시 띄우지 않습니다.
        onFocus={() => picked === null && visibleOptions.length > 0 && setOpen(true)}
      />

      {/* 선택됐는지 눈으로 보여야 합니다. 검색 버튼 활성화 조건이 이것입니다. */}
      {picked ? (
        <p className="font-label-md text-label-md text-ontime tracking-normal flex items-center gap-1">
          <Icon name="check_circle" size={14} filled />
          선택됨
        </p>
      ) : visibleError ? (
        <p className="font-label-md text-label-md text-error tracking-normal">{visibleError}</p>
      ) : visibleEmpty ? (
        <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
          검색 결과가 없습니다. 역 이름이나 건물명으로 다시 찾아보세요.
        </p>
      ) : null}

      {open && visibleOptions.length > 0 ? (
        <div className="absolute z-20 inset-x-0 top-13 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg max-h-64 overflow-y-auto p-1">
          {visibleOptions.map((place, i) => (
            <button
              key={`${place.lat}-${place.lng}-${i}`}
              type="button"
              className="w-full text-left px-space-md py-space-sm rounded-lg hover:bg-surface-container-low min-h-[44px]"
              data-log="search.place.pick"
              onClick={() => {
                log.debug("장소 선택", { field: id, name: place.name ?? place.address });
                onPick(place);
                onText(place.name ?? place.address ?? "");
                setOpen(false);
                setEmpty(false);
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
