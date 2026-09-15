import Link from "next/link";
import { requireSession } from "@/lib/auth-guard";
import { BottomNav, Banner } from "@/components/app-chrome";
import { Icon } from "@/components/icon";
import { HomeQuick } from "./home-quick";

export const dynamic = "force-dynamic";

/**
 * 메인 화면 — Stitch 시안 "Home".
 *
 * 로그인하지 않았으면 requireSession 이 /login 으로 보냅니다.
 *
 * 시안의 블록을 모두 그리되, 붙일 데이터가 없는 곳은 지어내지 않습니다.
 * 1차 범위는 대중교통 경로 검색뿐이고, 실시간 도착·리워드·팁·택시·따릉이는
 * 선행 조건(공공데이터포털 연동, 제휴 계약)이 있어야 합니다. 화면 아래에
 * 무엇이 아직 비어 있는지 한 번에 밝혀 둡니다.
 *
 * Shell 을 쓰지 않는 이유: 시안의 헤더가 표준 헤더와 달라서
 * (위치 선택 + 알림 + 아바타) 여기서 직접 그립니다.
 */
export default async function HomePage() {
  const session = await requireSession();

  return (
    <>
      <HomeHeader />

      <main className="flex flex-col w-full pt-14 pb-24 min-h-dvh bg-surface">
        <div className="flex flex-col w-full gap-space-base pt-space-xs max-w-lg mx-auto">
          <section className="px-layout-margin-mobile">
            <HomeQuick />
          </section>

          <section className="px-layout-margin-mobile">
            <ModeGrid />
          </section>

          <section className="px-layout-margin-mobile">
            <SearchPrompt login={session.login} />
          </section>

          <section className="px-layout-margin-mobile">
            <NearbyStops />
          </section>

          <section className="px-layout-margin-mobile">
            <RewardCard />
          </section>

          <section className="px-layout-margin-mobile">
            <Banner tone="info" icon="science" title="아직 비어 있는 블록이 있습니다">
              주변 정류장 실시간 도착, 환승 리워드, 모빌리티 팁은 시안의 자리만
              잡아둔 상태입니다. 실시간 정보는 공공데이터포털 연동(2차), 리워드는
              제휴가 있어야 채울 수 있습니다. 지금 동작하는 것은 경로 검색입니다.
            </Banner>
          </section>
        </div>
      </main>

      <BottomNav active="home" />
    </>
  );
}

/* ---------------- 헤더 ---------------- */

function HomeHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-14 px-layout-margin-mobile flex items-center justify-between max-w-lg mx-auto">
        {/* 위치 전환은 2차입니다. 누를 수 있는 것처럼 보이지 않도록 버튼이
            아니라 표시로 둡니다 — 눌러도 아무 일 없는 버튼이 가장 나쁩니다. */}
        <div className="flex items-center gap-space-xs py-space-xs">
          <Icon name="near_me" size={20} className="text-secondary" />
          <span className="font-headline-sm text-headline-sm text-on-surface">수도권</span>
        </div>

        <div className="flex items-center gap-space-xs">
          <Link
            href="/account"
            aria-label="회원 정보"
            data-log="home.account"
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <span className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Icon name="person" size={18} className="text-on-primary" />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------------- 이동수단 8칸 ---------------- */

type Mode = {
  icon: string;
  label: string;
  /** 갈 곳. 없으면 1차 범위 밖이라 비활성입니다 */
  href?: string;
  badge?: string;
  badgeTone?: "primary" | "hot";
};

const MODES: Mode[] = [
  { icon: "subway", label: "지하철", href: "/search?mode=subway", badge: "가능", badgeTone: "primary" },
  { icon: "directions_bus", label: "시내버스", href: "/search?mode=bus", badge: "가능", badgeTone: "primary" },
  { icon: "commute", label: "전체", href: "/search?mode=all", badge: "가능", badgeTone: "primary" },
  { icon: "local_taxi", label: "택시 예약" },
  { icon: "train", label: "공항철도" },
  { icon: "directions_railway", label: "기차·KTX" },
  { icon: "pedal_bike", label: "따릉이" },
  { icon: "airport_shuttle", label: "고속·시외" },
];

function ModeGrid() {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_2px_10px_rgba(0,44,116,0.05)] p-space-md">
      <div className="grid grid-cols-4 gap-y-4 gap-x-2">
        {MODES.map((mode) => (
          <ModeTile key={mode.label} mode={mode} />
        ))}
      </div>
      <p className="font-label-md text-label-md text-on-surface-variant tracking-normal text-center mt-space-md">
        회색 항목은 1차 범위 밖입니다 — 대중교통과 도보만 제공합니다
      </p>
    </div>
  );
}

function ModeTile({ mode }: { mode: Mode }) {
  const inner = (
    <>
      <div
        className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
          mode.href
            ? "bg-secondary-fixed group-hover:bg-secondary"
            : "bg-surface-container-high"
        }`}
      >
        <Icon
          name={mode.icon}
          size={26}
          className={mode.href ? "text-secondary group-hover:text-on-secondary" : "text-outline"}
        />
        {mode.badge ? (
          <span
            className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full font-label-md text-[9px] font-bold leading-none ${
              mode.badgeTone === "hot"
                ? "bg-tertiary-container text-on-tertiary-container"
                : "bg-secondary-container text-on-secondary"
            }`}
          >
            {mode.badge}
          </span>
        ) : null}
      </div>
      <span
        className={`mt-1.5 font-body-md-bold text-[12px] text-center ${
          mode.href ? "text-on-surface" : "text-outline"
        }`}
      >
        {mode.label}
      </span>
    </>
  );

  if (!mode.href) {
    return (
      <div
        className="flex flex-col items-center opacity-70 cursor-not-allowed"
        aria-disabled="true"
        title="1차 범위 밖입니다"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={mode.href}
      data-log={`home.mode.${mode.label}`}
      className="flex flex-col items-center group min-h-[44px]"
    >
      {inner}
    </Link>
  );
}

/* ---------------- 검색 유도 (시안의 "스마트 퇴근길 추천" 자리) ---------------- */

function SearchPrompt({ login }: { login: string }) {
  return (
    <div className="bg-primary-fixed rounded-xl p-space-base flex items-center justify-between gap-space-sm">
      <div className="min-w-0 flex flex-col gap-space-xxs">
        <span className="font-label-lg text-label-lg text-on-primary-fixed-variant">
          {login}님
        </span>
        <span className="font-headline-sm text-headline-sm text-on-primary-fixed">
          어디로 가시나요?
        </span>
        <span className="font-body-md text-body-md text-on-primary-fixed-variant">
          출발지와 도착지를 넣으면 경로를 비교해 드립니다
        </span>
      </div>
      <Link
        href="/search"
        data-log="home.cta"
        className="shrink-0 h-11 px-space-base bg-primary text-on-primary rounded-lg font-body-md-bold text-body-md-bold flex items-center gap-1"
      >
        경로
        <Icon name="arrow_forward" size={18} />
      </Link>
    </div>
  );
}

/* ---------------- 주변 정류장 (시안 자리, 데이터 없음) ---------------- */

function NearbyStops() {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-base flex flex-col gap-space-sm">
      <div className="flex items-start gap-space-sm">
        <span className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">
          <Icon name="near_me" size={18} className="text-secondary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-headline-sm text-headline-sm text-on-surface">주변 정류장</p>
          <p className="font-label-lg text-label-lg text-on-surface-variant tracking-normal">
            현재 위치 기준 실시간 도착
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-surface-container-low p-space-base flex flex-col items-center gap-space-xs text-center">
        <Icon name="schedule" size={24} className="text-outline" />
        <p className="font-body-md text-body-md text-on-surface-variant">
          실시간 도착 정보는 아직 붙이지 않았습니다
        </p>
        <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
          ODsay 는 실시간 정보를 제공하지 않습니다. 공공데이터포털 연동이 2차 과제입니다.
        </p>
      </div>
    </div>
  );
}

/* ---------------- 리워드 (시안 자리, 데이터 없음) ---------------- */

function RewardCard() {
  return (
    <div className="bg-primary rounded-xl p-space-base flex items-center gap-space-sm">
      <span className="w-11 h-11 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
        <Icon name="eco" size={22} className="text-on-primary" />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-space-xxs">
        <div className="flex items-center gap-space-xs flex-wrap">
          <span className="font-label-md text-label-md text-on-primary-container">
            MAAS REWARD
          </span>
          <span className="font-label-md text-label-md bg-surface-container-lowest/20 text-on-primary px-1.5 py-0.5 rounded">
            준비 중
          </span>
        </div>
        <p className="font-body-md-bold text-body-md-bold text-on-primary">
          환승 리워드는 제휴 후 열립니다
        </p>
        <p className="font-label-md text-label-md text-on-primary-container tracking-normal">
          대중교통·자전거 환승으로 탄소를 줄이면 적립되는 구조를 검토 중입니다
        </p>
      </div>
    </div>
  );
}
