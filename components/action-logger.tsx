"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { log } from "@/lib/logger";

/**
 * 사용자 동작 로거.
 *
 * layout 에 한 번만 올려두면 화면마다 손댈 필요 없이 클릭과 엔터를 잡습니다.
 * 개별 컨트롤에 `data-log="이름"` 을 붙이면 그 이름으로 찍히고, 없으면
 * 태그와 보이는 글자로 대신합니다.
 *
 * 절대 하지 않는 것: **입력값을 찍지 않습니다.**
 * 출발지·도착지·비밀번호가 그대로 로그에 남으면 안 됩니다. 입력 요소는
 * id 와 name 만 남깁니다.
 */
export function ActionLogger() {
  const pathname = usePathname();
  const first = useRef(true);

  // 화면 이동
  useEffect(() => {
    log.info(first.current ? "화면 진입" : "화면 이동", { path: pathname });
    first.current = false;
  }, [pathname]);

  // 클릭 · 엔터
  useEffect(() => {
    function describe(target: EventTarget | null): Record<string, unknown> | null {
      if (!(target instanceof Element)) return null;

      const tagged = target.closest<HTMLElement>("[data-log]");
      const el = tagged ?? target.closest<HTMLElement>("button,a,input,select,label,[role]");
      if (!el) return null;

      const info: Record<string, unknown> = { tag: el.tagName.toLowerCase() };

      if (tagged?.dataset.log) info.name = tagged.dataset.log;
      if (el.id) info.id = el.id;

      const role = el.getAttribute("role");
      if (role) info.role = role;

      const pressed = el.getAttribute("aria-pressed") ?? el.getAttribute("aria-checked");
      if (pressed) info.state = pressed;

      if (el instanceof HTMLAnchorElement) info.href = el.getAttribute("href");
      if (el instanceof HTMLButtonElement && el.disabled) info.disabled = true;

      // 입력 요소는 값을 절대 담지 않습니다.
      if (el instanceof HTMLInputElement) {
        info.name = info.name ?? (el.name || el.id);
        info.type = el.type;
      } else if (!info.name) {
        const label =
          el.getAttribute("aria-label") ?? el.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (label) info.label = label.slice(0, 40);
      }

      return info;
    }

    function onClick(event: MouseEvent) {
      const info = describe(event.target);
      if (info) log.debug("클릭", info);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      const info = describe(event.target);
      log.debug("엔터", info ?? { tag: "document" });
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // 잡히지 않은 오류도 같은 형식으로 남깁니다.
  useEffect(() => {
    function onError(event: ErrorEvent) {
      log.error("처리되지 않은 오류", { message: event.message, source: event.filename });
    }
    function onRejection(event: PromiseRejectionEvent) {
      log.error("처리되지 않은 거부", { reason: String(event.reason).slice(0, 200) });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
