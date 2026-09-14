"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatKST } from "@/lib/kst";
import {
  formatDistance,
  formatDuration,
  formatFare,
  SEGMENT_LABEL,
  SORT_LABEL,
  sortRoutes,
  type Place,
  type RouteSortKey,
  type TransitRoute,
} from "@/lib/routes";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "done";
      routes: TransitRoute[];
      fromCache: boolean;
      fetchedAt: string;
      searchId: string | null;
    };

export default function RouteSearch() {
  const [departure, setDeparture] = useState<Place | null>(null);
  const [arrival, setArrival] = useState<Place | null>(null);
  const [sortKey, setSortKey] = useState<RouteSortKey>("fastest");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const canSearch = departure !== null && arrival !== null && state.status !== "loading";

  const runSearch = useCallback(async () => {
    if (!departure || !arrival) return;
    setState({ status: "loading" });
    setOpenIndex(null);

    try {
      const response = await fetch("/api/transit/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ departure, arrival }),
      });
      const data = await response.json();

      if (!response.ok) {
        setState({
          status: "error",
          message: data?.error?.message ?? "경로를 불러오지 못했습니다.",
        });
        return;
      }

      setState({
        status: "done",
        routes: data.routes ?? [],
        fromCache: !!data.fromCache,
        fetchedAt: data.fetchedAt,
        searchId: data.searchId ?? null,
      });
    } catch {
      setState({ status: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }, [departure, arrival]);

  const sorted = useMemo(
    () => (state.status === "done" ? sortRoutes(state.routes, sortKey) : []),
    [state, sortKey],
  );

  /** 경로를 펼치는 것이 곧 "선택"입니다. KPI 선택률의 근거가 됩니다. */
  function toggleRoute(route: TransitRoute) {
    const next = openIndex === route.index ? null : route.index;
    setOpenIndex(next);

    if (next !== null && state.status === "done" && state.searchId) {
      fetch("/api/transit/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ searchId: state.searchId, routeIndex: route.index }),
      }).catch(() => {});
    }
  }

  function swap() {
    setDeparture(arrival);
    setArrival(departure);
  }

  return (
    <>
      <div className="search-card">
        <PlaceField
          id="departure"
          label="출발지"
          placeholder="예: 강남역"
          value={departure}
          onChange={setDeparture}
        />
        <button className="swap" type="button" onClick={swap}>
          ↕ 출발·도착 바꾸기
        </button>
        <PlaceField
          id="arrival"
          label="도착지"
          placeholder="예: 판교역"
          value={arrival}
          onChange={setArrival}
        />
        <button className="btn" type="button" onClick={runSearch} disabled={!canSearch}>
          {state.status === "loading" ? "경로를 찾는 중…" : "경로 검색"}
        </button>
      </div>

      {state.status === "error" ? <p className="note">{state.message}</p> : null}

      {state.status === "loading" ? (
        <div style={{ marginTop: 22 }}>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : null}

      {state.status === "done" ? (
        state.routes.length === 0 ? (
          <p className="note info">
            <strong>경로를 찾지 못했습니다.</strong> 출발지와 도착지가 너무 가깝거나, 주변에
            대중교통 정류장이 없을 수 있습니다. 위치를 조금 옮겨 다시 검색해 보세요.
          </p>
        ) : (
          <>
            <div className="sorts">
              {(Object.keys(SORT_LABEL) as RouteSortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={sortKey === key}
                  onClick={() => setSortKey(key)}
                >
                  {SORT_LABEL[key]}
                </button>
              ))}
            </div>

            <p className="meta">
              경로 {state.routes.length}개 · 데이터 기준 {formatKST(state.fetchedAt)}
              {state.fromCache ? " · 저장된 결과" : ""}
            </p>

            <div className="routes">
              {sorted.map((route) => (
                <RouteCard
                  key={route.index}
                  route={route}
                  open={openIndex === route.index}
                  onToggle={() => toggleRoute(route)}
                />
              ))}
            </div>
          </>
        )
      ) : null}

      {state.status === "idle" ? (
        <p className="empty">출발지와 도착지를 선택하면 경로를 비교해 보여드립니다.</p>
      ) : null}
    </>
  );
}

/* ---------------- 장소 입력 (자동완성) ---------------- */

function PlaceField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 입력할 때마다 호출하면 카카오 API 한도를 낭비합니다.
  // 250ms 쉬었을 때만 보냅니다.
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

  // 바깥을 클릭하면 목록을 닫습니다.
  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(place: Place) {
    onChange(place);
    setText(place.name ?? place.address ?? "");
    setOpen(false);
  }

  return (
    <div className="field" ref={boxRef}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          setText(event.target.value);
          onChange(null); // 다시 타이핑하면 선택이 해제됩니다
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
      />
      {value ? (
        <p className="picked">
          선택됨 · {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      ) : null}

      {open && options.length > 0 ? (
        <div className="suggest">
          {options.map((place, i) => (
            <button key={`${place.lat}-${place.lng}-${i}`} type="button" onClick={() => pick(place)}>
              <span className="nm">{place.name ?? place.address}</span>
              {place.address ? <span className="ad">{place.address}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- 경로 카드 ---------------- */

function RouteCard({
  route,
  open,
  onToggle,
}: {
  route: TransitRoute;
  open: boolean;
  onToggle: () => void;
}) {
  // 도보만으로 이루어진 구간 표시는 지저분하므로,
  // 짧은 도보(3분 이하)는 요약 칩에서 생략합니다.
  const chips = route.segments.filter(
    (s) => s.type !== "walk" || (s.durationMin ?? 0) > 3,
  );

  return (
    <button className="route" type="button" aria-expanded={open} onClick={onToggle}>
      <div className="route-top">
        <span className="route-time">{formatDuration(route.totalTimeMin)}</span>
        <span className="route-fare">{formatFare(route.totalFare)}</span>
      </div>

      <p className="route-facts">
        <span>환승 {route.transferCount}회</span>
        <span>도보 {formatDistance(route.totalWalkM)}</span>
        {route.totalDistanceM ? <span>총 {formatDistance(route.totalDistanceM)}</span> : null}
      </p>

      <div className="chain">
        {chips.map((segment, i) => (
          <span key={segment.index} style={{ display: "contents" }}>
            {i > 0 ? <span className="arrow">›</span> : null}
            <span className={`chip ${segment.type}`}>
              {segment.laneName ?? SEGMENT_LABEL[segment.type]}
            </span>
          </span>
        ))}
      </div>

      {open ? (
        <div className="detail">
          {route.segments.map((segment) => (
            <div className="seg" key={segment.index}>
              <span className="t">
                {segment.durationMin !== undefined ? `${segment.durationMin}분` : "—"}
              </span>
              <span className="b">
                <strong>
                  {segment.laneName
                    ? `${SEGMENT_LABEL[segment.type]} ${segment.laneName}`
                    : SEGMENT_LABEL[segment.type]}
                </strong>
                <span>
                  {segment.startName && segment.endName
                    ? `${segment.startName} → ${segment.endName}`
                    : segment.distanceM !== undefined
                      ? formatDistance(segment.distanceM)
                      : ""}
                  {segment.stationCount ? ` · ${segment.stationCount}개 정거장` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </button>
  );
}
