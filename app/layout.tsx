import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { ActionLogger } from "@/components/action-logger";
import { pretendard } from "./fonts";
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
    // pretendard.variable 이 이 요소에 --font-pretendard 를 심습니다.
    // globals.css 의 --font-kr 이 그 값을 씁니다. html 에 붙이는 이유는
    // @theme 가 :root 에 토큰을 내보내기 때문입니다 — 같은 요소여야
    // 변수가 서로 보입니다.
    <html lang="ko" className={pretendard.variable}>
      <head>
        {/*
          본문 폰트는 app/fonts.ts 에서 next/font/local 로 처리합니다.
          여기 남은 것은 아이콘(Material Symbols) 하나뿐입니다. 이건 글자가
          아니라 아이콘 글리프라 대체할 시스템 폰트가 없습니다.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
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
