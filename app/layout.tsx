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
          next/font 를 쓰지 않고 link 로 두는 이유:
          Atkinson Hyperlegible Next 는 이름이 길고 변형이 잦아
          next/font/google 의 타입 목록과 어긋나면 빌드가 통째로 깨집니다.
          시안(Stitch code.html)도 같은 방식으로 불러옵니다.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap"
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
