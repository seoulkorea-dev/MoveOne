import Link from "next/link";
import { requireSession } from "@/lib/auth-guard";
import { BottomNav } from "@/components/app-chrome";
import { Icon } from "@/components/icon";
import { HomeQuick } from "./home-quick";

export const dynamic = "force-dynamic";

/**
 * 메인 화면 — Stitch 시안 "Home".
 *
 * 로그인하지 않았으면 requireSession 이 /login 으로 보냅니다.
 *
 * ★ 2026-09-18 정리 — 무엇을 바꿨고 왜 바꿨는지
 *
 *   1. SearchPrompt("어디로 가시나요?" + 경로 버튼)를 없앴습니다.
 *      HomeQuick 의 검색창과 **같은 곳(/search)으로 가는 같은 행동**이었습니다.
 *      화면 위쪽 절반을 같은 기능이 두 번 차지하고 있었습니다.
 *      인사말("OO님")은 사라지지 않고 HomeQuick 위로 옮겼습니다.
 *
 *   2. "아직 없습니다" 블록 셋(주변 정류장 / 리워드 / 안내 배너)을
 *      하나로 합쳤습니다. 셋 다 같은 말을 하고 있었고, 그 셋이 화면
 *      면적의 절반가량이었습니다. 정직한 건 맞지만 세 번 말할 필요는
 *      없습니다. 무엇이 왜 없는지는 한 덩어리에 그대로 남겼습니다.
 *
 *   3. 이동수단 배지를 정보성으로 바꿨습니다. "가능"이 셋 붙어 있으면
 *      배지가 아무 말도 하지 않습니다. 어떤 데이터로 도는지를 적습니다.
 *
 *   넣지 않은 것: 즐겨찾기(회사·집), 실시간 도착, 퇴근길 추천, 프로모션,
 *   모빌리티 팁. 시안에는 있지만 **전부 하드코딩 가짜 데이터**가 됩니다.
 *   붙일 데이터가 생기면 그때 넣습니다.
 *
 * Shell 을 쓰지 않는 이유: 시안의 헤더가 표준 헤더와 달라서
 * (위치 표시 + 아바타) 여기서 직접 그립니다.
 */
export default async function HomePage() {
  const session = await requireSession();

  return (
    <>
      <HomeHeader />

      <main className="flex flex-col w-full pt-14 pb-24 min-h-dvh bg-surface">
        <div className="flex flex-col w-full gap-space-base pt-space-xs max-w-lg mx-auto">
          <section className="px-layout-margin-mobile">
            <HomeQuick login={session.login} />
          </section>

          <section className="px-layout-margin-mobile">
            <ModeGrid />
          </section>

          <section className="px-layout-margin-mobile">
            <ComingUp />
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
  /**
   * 무엇으로 도는지. "가능" 같은 말은 배지 자리를 쓰고도 아무 정보를
   * 주지 않습니다. 어떤 데이터를 쓰는지 적습니다.
   */
  badge?: string;
};

const MODES: Mode[] = [
  { icon: "subway", label: "지하철", href: "/search?mode=subway", badge: "공공API" },
  { icon: "directions_bus", label: "시내버스", href: "/search?mode=bus", badge: "공공API" },
  { icon: "commute", label: "전체", href: "/search?mode=all", badge: "복합" },
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
          <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary font-label-md text-[9px] font-bold leading-none whitespace-nowrap">
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

/* ---------------- 준비 중인 것들 (한 덩어리) ---------------- */

/**
 * 예전에는 이 내용이 카드 셋(주변 정류장 / 리워드 / 안내 배너)으로 흩어져
 * 있었습니다. 셋 다 "아직 없습니다"라는 같은 말을 하면서 화면의 절반을
 * 썼습니다. 한 덩어리로 줄이되, **무엇이 왜 없는지는 그대로 남깁니다.**
 * 이유 없이 "준비 중"이라고만 적으면 언제 열리는지 판단할 수 없습니다.
 */
const PLANNED: { icon: string; title: string; why: string }[] = [
  {
    icon: "schedule",
    title: "주변 정류장 실시간 도착",
    why: "공공데이터포털 버스도착정보 활용신청이 선행입니다",
  },
  {
    icon: "bookmark",
    title: "자주 가는 곳 (회사·집)",
    why: "장소를 저장하는 기능이 아직 없습니다",
  },
  {
    icon: "pedal_bike",
    title: "내려서 먼 거리는 따릉이 추천",
    why: "하차 지점부터의 도보 거리를 먼저 계산해야 합니다",
  },
  {
    icon: "eco",
    title: "환승 리워드",
    why: "제휴가 있어야 채울 수 있습니다",
  },
];

function ComingUp() {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div className="px-space-base pt-space-base pb-space-sm flex items-center gap-space-sm">
        <span className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">
          <Icon name="science" size={18} className="text-secondary" />
        </span>
        <div className="min-w-0">
          <p className="font-headline-sm text-headline-sm text-on-surface">준비 중</p>
          <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
            지금 동작하는 것은 대중교통 경로 검색입니다
          </p>
        </div>
      </div>

      <ul className="divide-y divide-outline-variant/60">
        {PLANNED.map((item) => (
          <li key={item.title} className="flex items-start gap-space-sm px-space-base py-space-md">
            <Icon name={item.icon} size={18} className="text-outline mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-body-md-bold text-body-md-bold text-on-surface">{item.title}</p>
              <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
                {item.why}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
