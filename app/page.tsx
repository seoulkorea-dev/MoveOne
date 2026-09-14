import RouteSearch from "./route-search";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <header className="app">
        <h1>MoveOne</h1>
        <span className="tag">수도권</span>
      </header>
      <p className="sub">
        출발지와 도착지를 입력하면 대중교통 경로를 시간·요금·환승 기준으로 비교해 보여줍니다.
      </p>

      <RouteSearch />

      <footer className="app">
        <p>
          교통 데이터 ODsay · 장소 검색 카카오 · 1차 범위는 수도권(서울·경기·인천)의 대중교통과
          도보입니다. 모든 시각은 한국 시간(KST)으로 표시됩니다.
        </p>
      </footer>
    </main>
  );
}
