/**
 * MoveOne 로거.
 *
 * 브라우저와 서버 양쪽에서 같은 모양으로 찍습니다. 화면에서 무엇을 눌렀고
 * 서버에서 어떤 요청이 얼마나 걸렸는지를 한 줄씩 이어 보기 위한 것입니다.
 *
 * 레벨은 환경변수 하나로 바꿉니다. .env.local 에:
 *
 *   NEXT_PUBLIC_LOG_LEVEL=debug     모두 (개발 기본값)
 *   NEXT_PUBLIC_LOG_LEVEL=info      동작·요청만
 *   NEXT_PUBLIC_LOG_LEVEL=error     오류만 (운영에서 쓸 값)
 *   NEXT_PUBLIC_LOG_LEVEL=silent    끔
 *
 * NEXT_PUBLIC_ 접두어라 브라우저 번들에도 들어갑니다. 레벨 이름 말고는
 * 아무 비밀도 담기지 않으므로 노출돼도 문제가 없습니다. 다만 값은
 * **빌드 시점에 박히므로** 바꾸면 개발 서버를 재시작해야 합니다.
 *
 * 규칙(20-security.md): 로그에 비밀번호·토큰·세션 ID·이메일 전문을 남기지
 * 않습니다. 아래 redact() 가 흔한 키 이름을 자동으로 가립니다. 자동 장치를
 * 믿고 아무거나 넘기지는 마세요 — 애초에 안 넘기는 것이 맞습니다.
 */

export type LogLevel = "debug" | "info" | "error" | "silent";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, error: 40, silent: 99 };

function resolveLevel(): LogLevel {
  // process.env.NEXT_PUBLIC_* 는 빌드 시점에 문자열로 치환됩니다.
  // 변수로 키를 만들면 치환되지 않으므로 반드시 직접 씁니다.
  const raw = process.env.NEXT_PUBLIC_LOG_LEVEL;
  return raw === "debug" || raw === "info" || raw === "error" || raw === "silent"
    ? raw
    : "debug";
}

const LEVEL = resolveLevel();

export function isEnabled(level: Exclude<LogLevel, "silent">): boolean {
  return ORDER[level] >= ORDER[LEVEL];
}

/** 로그에 남으면 안 되는 값을 가립니다. */
const SENSITIVE = /(pass|secret|token|session|cookie|auth|apikey|api_key|email)/i;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 3) return "[깊이 초과]";

  if (Array.isArray(value)) {
    return value.length > 20
      ? [...value.slice(0, 20).map((v) => redact(v, depth + 1)), `…외 ${value.length - 20}개`]
      : value.map((v) => redact(v, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE.test(key) ? "[가림]" : redact(item, depth + 1);
    }
    return out;
  }

  if (typeof value === "string" && value.length > 200) {
    return `${value.slice(0, 200)}…(${value.length}자)`;
  }

  return value;
}

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function stamp(): string {
  const now = new Date();
  return `${TIME.format(now)}.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

const WHERE = typeof window === "undefined" ? "server" : "client";

function emit(level: Exclude<LogLevel, "silent">, event: string, detail?: unknown): void {
  if (!isEnabled(level)) return;

  const prefix = `[MoveOne ${stamp()} ${WHERE}] ${level.toUpperCase().padEnd(5)} ${event}`;

  // 이 파일에서만 console 을 직접 씁니다 (eslint.config.mjs 의 예외).
  const sink = level === "error" ? console.error : level === "info" ? console.info : console.debug;

  if (detail === undefined) sink(prefix);
  else sink(prefix, redact(detail));
}

export const log = {
  /** 세세한 흐름. 화면 클릭, 캐시 히트, 중간 상태 */
  debug: (event: string, detail?: unknown) => emit("debug", event, detail),
  /** 의미 있는 사건. 검색 실행, 로그인, 외부 API 호출 결과 */
  info: (event: string, detail?: unknown) => emit("info", event, detail),
  /** 실패. 사용자에게 보이는 오류는 여기에도 남깁니다 */
  error: (event: string, detail?: unknown) => emit("error", event, detail),
  level: LEVEL,
};

/**
 * 서버 라우트에서 걸린 시간을 재서 한 줄로 남깁니다.
 *
 *   const done = log.start("api.places", { q });
 *   ...
 *   done({ count: places.length });
 */
export function startTimer(event: string, detail?: unknown) {
  const began = Date.now();
  log.debug(`${event} 시작`, detail);

  return function finish(result?: unknown, level: "info" | "error" = "info") {
    emit(level, `${event} 완료 ${Date.now() - began}ms`, result);
  };
}
