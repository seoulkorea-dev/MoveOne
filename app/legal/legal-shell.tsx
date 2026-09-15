import type { ReactNode } from "react";
import { LegalBack } from "./back-button";

/**
 * 약관·방침 문서의 공통 껍데기.
 *
 * 로그인 없이 볼 수 있어야 합니다 — 가입 화면에서 링크로 들어오기 때문입니다.
 * 그래서 Shell(하단 탭바·헤더 액션)을 쓰지 않고 별도로 둡니다.
 */
export function LegalShell({
  title,
  version,
  effective,
  children,
}: {
  title: string;
  version: string;
  /** 시행일. 보통 버전과 같지만 다를 수 있어 따로 받습니다. */
  effective: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface flex flex-col">
      <header className="sticky top-0 z-40 pt-safe bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-14 px-layout-margin-mobile flex items-center gap-space-xs max-w-2xl mx-auto w-full">
          <LegalBack />
          <span className="font-headline-sm text-headline-sm text-on-surface truncate">
            {title}
          </span>
        </div>
      </header>

      <main className="flex-1 px-layout-margin-mobile py-space-lg max-w-2xl mx-auto w-full flex flex-col gap-space-base">
        <div className="flex flex-wrap items-center gap-space-xs">
          <span className="font-label-md text-label-md bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-lg">
            버전 {version}
          </span>
          <span className="font-label-md text-label-md text-on-surface-variant">
            시행일 {effective}
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}

export function Article({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-space-base shadow-sm flex flex-col gap-space-sm">
      <h2 className="font-headline-sm text-headline-sm text-primary">{heading}</h2>
      <div className="flex flex-col gap-space-sm font-body-md text-body-md text-on-surface">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-space-xs">
      {items.map((item, i) => (
        <li key={i} className="flex gap-space-xs">
          <span className="text-outline-variant shrink-0">·</span>
          <span className="flex-1 min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** 표. 모바일에서 넘치지 않도록 가로 스크롤을 답니다. */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[420px] border-collapse font-body-md text-body-md">
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                key={cell}
                className="text-left align-top bg-surface-container text-on-surface-variant font-body-md-bold text-body-md-bold px-space-sm py-space-xs border border-outline-variant"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="align-top px-space-sm py-space-xs border border-outline-variant"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 서비스를 열기 전에 반드시 채워야 하는 자리를 눈에 띄게 표시합니다.
 * 개발 중에만 보이고, 운영 빌드에서는 값이 채워져 있어야 합니다.
 */
export function Blank({ children }: { children: ReactNode }) {
  return (
    <mark className="bg-error-container text-on-error-container px-1.5 py-0.5 rounded font-body-md-bold text-body-md-bold">
      {children}
    </mark>
  );
}
