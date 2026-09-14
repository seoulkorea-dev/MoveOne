/**
 * KST 표시 전용 유틸.
 *
 * 원칙: 저장은 UTC(timestamptz), 표시는 KST.
 * 서버의 TZ 환경변수에 의존하지 않고 timeZone을 명시하므로,
 * 로컬에서든 Vercel 서울 리전에서든 결과가 같다.
 */

const TIME_ZONE = "Asia/Seoul";

function partsOf(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    ...options,
  }).formatToParts(date);
}

function pick(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((p) => p.type === type)?.value ?? "";
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "2026-09-11 15:04:05" */
export function formatKST(value: Date | string | number): string {
  const p = partsOf(toDate(value), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    `${pick(p, "year")}-${pick(p, "month")}-${pick(p, "day")} ` +
    `${pick(p, "hour")}:${pick(p, "minute")}:${pick(p, "second")}`
  );
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "2026년 9월 11일 (금) 15:04" */
export function formatKSTLong(value: Date | string | number): string {
  const date = toDate(value);
  const p = partsOf(date, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });

  // 요일은 KST 기준으로 다시 구한다 (en-US 약어를 한글로 매핑).
  const enWeekday = pick(p, "weekday");
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(enWeekday);
  const weekday = index >= 0 ? WEEKDAY_KO[index] : "";

  return (
    `${pick(p, "year")}년 ${pick(p, "month")}월 ${pick(p, "day")}일` +
    (weekday ? ` (${weekday})` : "") +
    ` ${pick(p, "hour")}:${pick(p, "minute")}`
  );
}

/** "3분 전", "2시간 전" — 목록에서 최근 로그인을 빨리 읽게 해준다. */
export function relativeKo(value: Date | string | number, now: Date = new Date()): string {
  const diffSec = Math.round((now.getTime() - toDate(value).getTime()) / 1000);
  if (diffSec < 10) return "방금";
  if (diffSec < 60) return `${diffSec}초 전`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return formatKST(value);
}

/** UTC 원본도 같이 보여주기 위한 값. "2026-09-11T06:04:05Z" */
export function toUtcIso(value: Date | string | number): string {
  return toDate(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** "08:32" — 경로 카드의 출발·도착 시각처럼 시:분만 필요할 때. */
export function formatClockKST(value: Date | string | number): string {
  const p = partsOf(toDate(value), { hour: "2-digit", minute: "2-digit" });
  return `${pick(p, "hour")}:${pick(p, "minute")}`;
}
