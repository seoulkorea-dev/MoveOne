import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { ActionLogger } from "@/components/action-logger";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoveOne — 수도권 대중교통 경로 검색",
  description: "출발지와 도착지를 입력하면 수도권 대중교통 경로를 비교해 보여줍니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 하이브리드(Capacitor) 전환을 대비해 노치 영역까지 그리고,
  // safe-area 는 pt-safe / pb-safe 유틸리티로 각 화면이 처리합니다.
  viewportFit: "cover",
  themeColor: "#f8f9fd",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/*
          본문 폰트 — Pretendard, dynamic subset.

          ★ next/font/local 에서 CDN 으로 바꾼 이유

          PretendardVariable.woff2 한 덩어리는 2.0MB 입니다. 한글 전체 글리프가
          들어 있어서인데, 한 화면에 실제로 쓰이는 글자는 수백 자뿐입니다.
          그래서 첫 방문에서 2MB 를 다 받을 때까지 맑은 고딕으로 보이다가
          한 번 확 바뀌는 현상이 있었습니다.

          dynamic subset 은 같은 폰트를 유니코드 범위별로 86조각으로 나눠 두고,
          브라우저가 **화면에 실제로 필요한 조각만** 받습니다. 실사용 40~80KB 입니다.

          ★ 여기에 `import { pretendard } from "./fonts"` 가 없는 것이 정상입니다.
            app/fonts.ts 와 app/fonts/PretendardVariable.woff2 는 제거되었습니다.
            폰트 지정은 app/globals.css 의 --font-kr 이 합니다. 그 변수는 @theme
            **바깥**의 :root 에 있어야 합니다 — Tailwind v4 의 @theme 는 생성된
            유틸리티가 쓰지 않는 변수를 빌드에서 지웁니다.

          주의: 네트워크가 필요합니다. 오프라인에서는 폴백(system-ui →
          맑은 고딕)으로 내려갑니다. 아래 Material Symbols 도 이미 같은 조건이라
          새로 생기는 제약은 아닙니다.

          Material Symbols 는 글자가 아니라 아이콘 글리프라 대체할 시스템 폰트가
          없습니다. 그래서 그대로 둡니다.
        */}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/pretendard/1.3.9/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="bg-surface text-on-surface font-body-md text-body-md min-h-dvh flex flex-col antialiased selection:bg-primary-fixed selection:text-on-primary-fixed">
        <ActionLogger />
        {children}
      </body>
    </html>
  );
}
