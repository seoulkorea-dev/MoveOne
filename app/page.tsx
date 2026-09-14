import Link from "next/link";
import { requireSession } from "@/lib/auth-guard";
import { Banner, SectionTitle, Shell } from "@/components/app-chrome";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

/**
 * 메인 대시보드.
 *
 * 로그인하지 않았으면 requireSession 이 /login 으로 보냅니다.
 * 여기서 무엇을 할지 고르고, 실제 작업은 /search 부터 시작합니다.
 *
 * 아래 "자주 찾는 경로"와 "최근 이용 정류장"은 Stitch 시안의 예시입니다.
 * 저장 경로(s5)와 실시간 도착정보(s4)는 1차 범위 밖이라 아직 붙일 데이터가
 * 없습니다. 화면 구조를 먼저 잡아두고 2차에서 채웁니다.
 */
export default async function HomePage() {
  const session = await requireSession();

  return (
    <Shell title="MOVEONE" tab="home">
      {/* 검색 진입 */}
      <Link
        href="/search"
        className="bg-surface-container-lowest rounded-xl p-space-base shadow-md flex items-center gap-space-sm min-h-[44px]"
      >
        <Icon name="search" size={22} className="text-secondary" />
        <span className="font-body-lg text-body-lg text-outline flex-1">어디로 가시나요?</span>
        <span className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center">
          <Icon name="my_location" size={18} className="text-on-surface-variant" />
        </span>
      </Link>

      <p className="font-label-md text-label-md text-on-surface-variant tracking-normal -mt-1">
        {session.login}님, 수도권 대중교통 경로를 검색할 수 있습니다.
      </p>

      {/* 퀵 메뉴 */}
      <div className="grid grid-cols-4 gap-space-sm">
        <Quick icon="work" label="출근길" sub="집 → 회사" />
        <Quick icon="home" label="퇴근길" sub="회사 → 집" />
        <Quick icon="bookmark" label="즐겨찾기" sub="준비 중" />
        <Quick icon="history" label="최근" sub="검색에서" />
      </div>

      {/* 운행 알림 — 시안 예시 */}
      <article className="bg-surface-container-lowest rounded-xl p-space-base shadow-sm flex items-start gap-space-sm border-l-4 border-l-alert">
        <Icon name="warning" size={22} className="text-alert mt-0.5" />
        <div className="min-w-0 flex flex-col gap-space-xxs">
          <div className="flex items-center gap-space-xs flex-wrap">
            <span className="font-body-md-bold text-body-md-bold text-on-surface">2호선 지연</span>
            <span className="font-label-md text-label-md text-white bg-alert px-2 py-0.5 rounded-lg">
              평균 7분
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            신도림~사당 구간 신호 장애로 지연 중입니다.
          </p>
        </div>
      </article>

      <SectionTitle>자주 찾는 경로</SectionTitle>

      <SavedRoute icon="work" title="집 → 회사" minutes={42} detail="환승 1회 · 1,600원" />
      <SavedRoute icon="school" title="집 → 판교" minutes={24} detail="환승 0회 · 2,800원" />

      <SectionTitle>최근 이용 정류장</SectionTitle>

      <section className="bg-surface-container-lowest rounded-xl divide-y divide-outline-variant/60 shadow-sm overflow-hidden">
        <StopRow badge="2" color="#00A84D" name="강남역" sub="외선순환 · 성수 방면" eta="2분" />
        <StopRow
          badge="146"
          color="#0068B7"
          name="강남역.강남지하상가"
          sub="상계 방면 · 2정거장 전"
          eta="지연"
          alert
        />
      </section>

      <Banner tone="info" icon="science" title="위 알림과 도착 정보는 예시입니다">
        실시간 운행 정보는 ODsay가 제공하지 않습니다. 공공데이터포털 연동은 2차 범위이며, 지금은
        화면 구조만 잡아둔 상태입니다.
      </Banner>
    </Shell>
  );
}

function Quick({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <Link
      href="/search"
      className="flex flex-col items-center justify-center gap-space-xs py-space-md rounded-xl bg-surface-container-lowest shadow-sm min-h-[44px] hover:shadow transition-shadow"
    >
      <Icon name={icon} size={24} className="text-secondary" />
      <span className="font-body-md-bold text-body-md-bold text-on-surface">{label}</span>
      <span className="font-label-md text-label-md text-on-surface-variant tracking-normal">
        {sub}
      </span>
    </Link>
  );
}

function SavedRoute({
  icon,
  title,
  minutes,
  detail,
}: {
  icon: string;
  title: string;
  minutes: number;
  detail: string;
}) {
  return (
    <Link
      href="/search"
      className="bg-surface-container-lowest rounded-xl p-space-base shadow-sm flex items-center justify-between gap-space-sm"
    >
      <div className="min-w-0 flex flex-col gap-space-xxs">
        <div className="flex items-center gap-space-xs">
          <Icon name={icon} size={18} className="text-primary" />
          <span className="font-headline-sm text-headline-sm text-primary truncate">{title}</span>
        </div>
        <span className="font-label-lg text-label-lg text-on-surface-variant">{detail}</span>
      </div>
      <span className="font-code-time text-headline-md text-secondary leading-none shrink-0 tabular-nums">
        {minutes}
        <span className="font-body-md-bold text-body-md-bold">분</span>
      </span>
    </Link>
  );
}

function StopRow({
  badge,
  color,
  name,
  sub,
  eta,
  alert = false,
}: {
  badge: string;
  color: string;
  name: string;
  sub: string;
  eta: string;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center gap-space-sm p-space-base min-h-[44px]">
      <span
        className="h-6 min-w-6 px-1.5 rounded-full text-white flex items-center justify-center font-label-md text-[10px] font-bold shrink-0"
        style={{ backgroundColor: color }}
      >
        {badge}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-body-md-bold text-body-md-bold text-on-surface truncate">{name}</p>
        <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">{sub}</p>
      </div>
      <span
        className={`font-code-time text-code-time shrink-0 tabular-nums ${alert ? "text-alert" : "text-secondary"}`}
      >
        {eta}
      </span>
    </div>
  );
}
