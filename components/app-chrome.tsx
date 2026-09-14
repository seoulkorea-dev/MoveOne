import type { InputHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./icon";

/* ============================================================
   화면 껍데기 — 헤더 / 본문 / 하단 탭바
   Stitch 시안의 마크업 구조를 그대로 옮겼습니다. 새 화면을 만들 때는
   여기 있는 것을 쓰고, 헤더나 탭바를 화면마다 다시 그리지 마세요.
   ============================================================ */

export type TabKey = "home" | "search" | "saved" | "settings";

/** 상단 헤더. back 을 주면 로고 대신 뒤로가기가 나옵니다. */
export function AppHeader({
  title,
  back,
  actions = true,
}: {
  title: string;
  /** 뒤로 갈 경로. 없으면 로고를 보여줍니다 */
  back?: string;
  /** 알림·프로필 노출 여부. 인증 화면에서는 끕니다 */
  actions?: boolean;
}) {
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl pt-safe shadow-[0_1px_8px_rgba(25,28,31,0.04)]">
      <div className="h-14 px-layout-margin-mobile flex items-center justify-between">
        <div className="flex items-center gap-space-sm min-w-0">
          {back ? (
            <Link
              href={back}
              aria-label="이전 화면으로"
              className="w-11 h-11 -ml-2 rounded-lg flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all"
            >
              <Icon name="arrow_back" size={24} />
            </Link>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Icon name="directions_transit" size={20} className="text-on-primary" />
            </div>
          )}
          <h1 className="font-headline-md text-headline-md text-primary tracking-tight uppercase truncate">
            {title}
          </h1>
        </div>

        {actions ? (
          <div className="flex items-center gap-space-xs">
            <button
              type="button"
              aria-label="운행 알림"
              className="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <Icon name="notifications" size={22} />
            </button>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                aria-label="로그아웃"
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
              >
                <Icon name="person" size={18} className="text-on-primary" />
              </button>
            </form>
          </div>
        ) : (
          <div className="w-11" />
        )}
      </div>
    </header>
  );
}

const TABS: { key: TabKey; icon: string; label: string; href: string }[] = [
  { key: "home", icon: "directions_subway", label: "Home", href: "/" },
  { key: "search", icon: "search", label: "Search", href: "/search" },
  // 저장 경로와 설정은 1차 범위 밖입니다. 시안의 탭 구조를 유지하되
  // 아직 화면이 없으므로 홈으로 보냅니다.
  { key: "saved", icon: "bookmark", label: "Saved", href: "/" },
  { key: "settings", icon: "settings", label: "Settings", href: "/" },
];

export function BottomNav({ active }: { active: TabKey }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface/90 backdrop-blur-xl shadow-[0_-2px_12px_rgba(25,28,31,0.06)]">
      <div className="h-[60px] px-layout-margin-mobile grid grid-cols-4 items-center justify-items-center max-w-lg mx-auto">
        {TABS.map((tab) => {
          const on = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center justify-center w-full h-full min-h-[44px] min-w-[44px] gap-space-xxs transition-colors ${
                on ? "text-secondary" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon name={tab.icon} size={24} />
              <span className="font-label-md text-label-md tracking-wider uppercase">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * 본문 래퍼.
 * tab 을 주면 하단 탭바 높이만큼 아래 여백을 잡고 탭바를 그립니다.
 */
export function Shell({
  title,
  back,
  tab,
  actions,
  children,
}: {
  title: string;
  back?: string;
  tab?: TabKey;
  actions?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader title={title} back={back} actions={actions} />
      <main
        className={`flex-1 flex flex-col w-full pt-14 bg-surface px-layout-margin-mobile ${
          tab ? "pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]" : "pb-space-2xl"
        }`}
      >
        <div className="flex flex-col w-full py-space-base gap-space-md max-w-lg mx-auto">
          {children}
        </div>
      </main>
      {tab ? <BottomNav active={tab} /> : null}
    </>
  );
}

/* ---------------- 상태 배너 ---------------- */

const BANNER_TONE = {
  error: { bg: "bg-error-container", fg: "text-on-error-container", ic: "text-error" },
  info: { bg: "bg-surface-container-low", fg: "text-on-surface-variant", ic: "text-secondary" },
  ok: { bg: "bg-primary-fixed", fg: "text-on-primary-fixed", ic: "text-primary" },
} as const;

export function Banner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: keyof typeof BANNER_TONE;
  icon: string;
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  const t = BANNER_TONE[tone];
  return (
    <aside role="status" className={`${t.bg} rounded-xl px-space-base py-space-md flex items-start gap-space-sm`}>
      <Icon name={icon} size={20} className={`${t.ic} mt-0.5`} />
      <div className={`min-w-0 ${t.fg}`}>
        <p className="font-body-md-bold text-body-md-bold">{title}</p>
        {children ? <p className="font-body-md text-body-md mt-0.5">{children}</p> : null}
        {action ? (
          <Link
            href={action.href}
            className="font-label-lg text-label-lg underline underline-offset-2 mt-1 inline-block"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

/* ---------------- 폼 조각 ---------------- */

export const INPUT_CLASS =
  "h-12 w-full rounded-lg bg-surface-container-lowest border-[1.5px] border-outline-variant " +
  "px-space-md font-body-md text-body-md text-on-surface placeholder:text-outline " +
  "focus:outline-none focus:border-secondary-container focus:ring-2 focus:ring-secondary-container/40 transition-all";

export const BTN_PRIMARY =
  "w-full h-12 bg-secondary-container text-on-secondary rounded-lg font-body-md-bold text-body-md-bold " +
  "flex items-center justify-center gap-2 hover:bg-secondary active:scale-[0.99] transition-all shadow-sm " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

export const BTN_SECONDARY =
  "w-full h-12 bg-surface-container-lowest border border-secondary-container text-secondary rounded-lg " +
  "font-body-md-bold text-body-md-bold flex items-center justify-center gap-2 hover:bg-primary-fixed/40 " +
  "active:scale-[0.99] transition-all";

export const CARD =
  "bg-surface-container-lowest rounded-xl p-space-base shadow-sm flex flex-col gap-space-md";

export function Field({
  id,
  label,
  hint,
  ...input
}: {
  id: string;
  label: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-space-xs">
      <label
        htmlFor={id}
        className="font-label-lg text-label-lg text-on-surface-variant tracking-normal"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={INPUT_CLASS}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint ? (
        <p
          id={`${id}-hint`}
          className="font-label-md text-label-md text-on-surface-variant tracking-normal"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SectionTitle({ children, more }: { children: ReactNode; more?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between pt-space-xs">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">{children}</h2>
      {more ? (
        <Link
          href={more.href}
          className="font-label-lg text-label-lg text-secondary min-h-[44px] flex items-center"
        >
          {more.label}
          <Icon name="chevron_right" size={16} />
        </Link>
      ) : null}
    </div>
  );
}
