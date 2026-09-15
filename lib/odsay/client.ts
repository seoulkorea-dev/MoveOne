import "server-only";
import { log } from "@/lib/logger";
import type {
  OdsayErrorBody,
  OdsayLoadLaneResponse,
  OdsaySearchPathResponse,
} from "./types";

/**
 * ODsay 호출은 반드시 서버에서만 합니다.
 *
 * ODsay는 API 키를 URL 쿼리 파라미터로 받습니다. 브라우저에서 직접
 * 호출하면 개발자도구 네트워크 탭에 키가 그대로 노출되고, 누구나
 * 가져다 쓸 수 있습니다. 맨 위의 "server-only" import가 이 파일을
 * 클라이언트 컴포넌트에서 import하면 빌드가 실패하게 만듭니다.
 */

const BASE_URL = "https://api.odsay.com/v1/api";

export class OdsayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    /** ODsay 가 실제로 보낸 본문. 원인을 추측하지 않기 위해 남깁니다 */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "OdsayError";
  }
}

/**
 * ODsay 오류 본문을 코드·메시지로 정규화합니다.
 * 객체/배열, msg/message 가 섞여 오므로 한 곳에서 흡수합니다.
 */
function toOdsayError(raw: unknown, status: number): OdsayError {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const item = (first ?? {}) as Record<string, unknown>;

  const code = item.code ?? item.errorCode ?? item.status;
  const message = item.msg ?? item.message ?? item.errorMessage;

  return new OdsayError(
    code === undefined || code === null ? "unknown" : String(code),
    typeof message === "string" && message ? message : "ODsay가 오류를 반환했습니다.",
    status,
    JSON.stringify(raw).slice(0, 400),
  );
}

let keyShapeLogged = false;

/**
 * ODsay API 키를 "보낼 수 있는 모양"으로 정리합니다.
 *
 * 여기서 두 가지를 흡수합니다. 둘 다 ApiKeyAuthFailed 로만 보여서
 * 원인을 찾기 어려운 함정입니다.
 *
 * 1. 앞뒤 공백·개행
 *    .env.local 을 Windows 편집기로 저장하면 줄 끝에 \r 이 남을 수 있고,
 *    값 끝의 공백도 그대로 키에 붙습니다.
 *
 * 2. 이미 URL 인코딩된 키
 *    ODsay 콘솔이 키를 인코딩된 형태(%2F, %2B …)로 보여주는 경우가 있습니다.
 *    그대로 두면 URLSearchParams 가 한 번 더 인코딩해서 %2F → %252F 가 되고
 *    인증이 깨집니다. %XX 패턴이 보이면 한 번 되돌립니다.
 */
function apiKey(): string {
  const raw = process.env.ODSAY_API_KEY?.trim();
  if (!raw) {
    throw new OdsayError(
      "config",
      "ODSAY_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.",
    );
  }

  let key = raw;
  if (/%[0-9A-Fa-f]{2}/.test(raw)) {
    try {
      key = decodeURIComponent(raw);
    } catch {
      // 잘못된 이스케이프면 원본을 그대로 씁니다.
    }
  }

  // 키 값은 절대 남기지 않고 "모양"만 한 번 남깁니다.
  // 인증이 실패할 때 길이나 공백 혼입을 먼저 의심할 수 있게 하려는 것입니다.
  if (!keyShapeLogged) {
    keyShapeLogged = true;
    log.debug("ODsay 키 모양", {
      length: key.length,
      trimmed: raw.length !== (process.env.ODSAY_API_KEY?.length ?? 0),
      wasUrlEncoded: key !== raw,
      hasSpace: /\s/.test(key),
    });
  }

  return key;
}

type SearchPathParams = {
  /** 출발 경도 */
  sx: number;
  /** 출발 위도 */
  sy: number;
  /** 도착 경도 */
  ex: number;
  /** 도착 위도 */
  ey: number;
  /** 0:전체, 1:지하철, 2:버스 */
  searchPathType?: 0 | 1 | 2;
};

export type OdsayCallResult = {
  data: OdsaySearchPathResponse;
  elapsedMs: number;
};

/**
 * 대중교통 길찾기.
 *
 * ODsay는 HTTP 200에 error 필드를 실어 보내는 경우가 있어,
 * 상태 코드만 보고 성공으로 판단하면 안 됩니다.
 */
/**
 * ODsay 호출 공통부.
 *
 * ODsay는 HTTP 200에 error 필드를 실어 보내는 경우가 있어,
 * 상태 코드만 보고 성공으로 판단하면 안 됩니다.
 */
async function callOdsay<T extends { error?: OdsayErrorBody }>(
  endpoint: string,
  params: Record<string, string>,
  options: { timeoutMs?: number } = {},
): Promise<{ data: T; elapsedMs: number }> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("apiKey", apiKey());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("output", "json");
  url.searchParams.set("lang", "0");

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const elapsedMs = Date.now() - started;

    if (!response.ok) {
      throw new OdsayError("http", `ODsay가 ${response.status}로 응답했습니다.`, response.status);
    }

    const data = (await response.json()) as T;

    if (data.error) {
      // 대표적인 코드:
      //   -8   검색 반경 내 대중교통 정류장 없음
      //   500  API 키 문제 (플랫폼 유형 불일치·IP 미등록 포함)
      throw toOdsayError(data.error, response.status);
    }

    return { data, elapsedMs };
  } catch (cause) {
    if (cause instanceof OdsayError) throw cause;
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new OdsayError("timeout", "ODsay 응답이 시간 내에 오지 않았습니다.");
    }
    throw new OdsayError("network", "ODsay에 연결하지 못했습니다.");
  } finally {
    clearTimeout(timer);
  }
}

/** 대중교통 길찾기. 가이드 1단계. */
export function searchPubTransPath(
  params: SearchPathParams,
  options: { timeoutMs?: number } = {},
): Promise<OdsayCallResult> {
  return callOdsay<OdsaySearchPathResponse>(
    "searchPubTransPathT",
    {
      SX: String(params.sx),
      SY: String(params.sy),
      EX: String(params.ex),
      EY: String(params.ey),
      SearchPathType: String(params.searchPathType ?? 0),
    },
    options,
  );
}

/**
 * 노선 그래픽 데이터. 가이드 2단계.
 *
 * 1단계 응답의 info.mapObj 를 그대로 넘깁니다. 가이드는
 * `mapObject=0:0@{mapObj}` 형식을 쓰는데, 응답이 이미 접두어를 달고
 * 오는 경우가 있어 있으면 그대로 두고 없을 때만 붙입니다.
 */
export function loadLane(
  mapObj: string,
  options: { timeoutMs?: number } = {},
): Promise<{ data: OdsayLoadLaneResponse; elapsedMs: number }> {
  const mapObject = /^\d+:\d+@/.test(mapObj) ? mapObj : `0:0@${mapObj}`;
  return callOdsay<OdsayLoadLaneResponse>("loadLane", { mapObject }, options);
}

/** 오류 코드를 사용자에게 보여줄 한국어 문장으로 바꿉니다. */
export function odsayErrorMessage(error: OdsayError): string {
  switch (error.code) {
    case "config":
      return error.message;
    case "timeout":
      return "경로 조회가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
    case "network":
      return "교통 정보 서버에 연결하지 못했습니다.";
    case "-8":
      return "출발지 또는 도착지 주변에 대중교통 정류장이 없습니다. 위치를 조금 옮겨 다시 검색해 보세요.";
    case "500":
      return "교통 정보 API 인증에 실패했습니다. API 키와 등록된 플랫폼(Server/IP)을 확인하세요.";
    default:
      return "경로를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
