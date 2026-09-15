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
          본문 폰트는 내려받지 않습니다. 맑은 고딕은 Windows 기본 탑재이고,
          다른 OS 는 각자의 시스템 한글 폰트로 내려갑니다(globals.css 의
          --font-kr). 예전에 쓰던 Atkinson Hyperlegible Next / Barlow
          Condensed / Noto Sans KR 스타일시트는 더 이상 참조하는 곳이 없어
          지웠습니다 — 첫 화면이 그만큼 빨라집니다.

          남은 것은 아이콘(Material Symbols) 하나뿐입니다. 이건 글자가 아니라
          아이콘 글리프라 대체할 시스템 폰트가 없습니다.
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
