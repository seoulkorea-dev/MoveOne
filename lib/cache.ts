import "server-only";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import type { Place, TransitRoute } from "@/lib/routes";

/**
 * 경로 검색 결과 캐시.
 *
 * ODsay는 호출 한도가 문서에 명시돼 있지 않고 상업 이용은 별도 문의
 * 대상입니다. 같은 구간을 반복 검색하는 것이 출퇴근 앱의 기본 사용
 * 패턴이므로, 캐시가 없으면 한도를 금방 소진합니다.
 *
 * 캐시 수명이 짧은 이유: 대중교통 경로 자체는 잘 안 변하지만
 * 시간대에 따라 막차·배차가 달라집니다. 10분이면 같은 출근길의
 * 반복 검색은 잡고, 시간대 변화는 놓치지 않습니다.
 */

const TTL_MINUTES = 10;

/** 좌표를 소수점 5자리(약 1m)로 반올림해 캐시 적중률을 올립니다. */
function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

export function buildCacheKey(
  departure: Place,
  arrival: Place,
  extra: Record<string, unknown> = {},
): string {
  const payload = JSON.stringify({
    d: [roundCoord(departure.lat), roundCoord(departure.lng)],
    a: [roundCoord(arrival.lat), roundCoord(arrival.lng)],
    ...extra,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

type CachedPayload = { routes: TransitRoute[]; fetchedAt: string };

export async function readCache(cacheKey: string): Promise<CachedPayload | null> {
  const [row] = await query<{ payload: CachedPayload }>(
    `select payload from route_cache
      where cache_key = $1 and expires_at > now()`,
    [cacheKey],
  );

  if (!row) return null;

  // 적중 횟수는 캐시 효과를 측정하는 근거입니다.
  // 실패해도 응답을 막지 않습니다.
  query(`update route_cache set hit_count = hit_count + 1 where cache_key = $1`, [cacheKey])
    .catch(() => {});

  return row.payload;
}

export async function writeCache(cacheKey: string, payload: CachedPayload): Promise<void> {
  await query(
    `insert into route_cache (cache_key, payload, expires_at)
     values ($1, $2, now() + ($3 || ' minutes')::interval)
     on conflict (cache_key) do update
       set payload    = excluded.payload,
           expires_at = excluded.expires_at`,
    [cacheKey, JSON.stringify(payload), String(TTL_MINUTES)],
  );
}

/** 만료된 항목 정리. 운영에서는 스케줄러로 돌립니다. */
export async function purgeExpiredCache(): Promise<number> {
  const rows = await query<{ count: string }>(
    `with deleted as (delete from route_cache where expires_at <= now() returning 1)
     select count(*)::text as count from deleted`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** 외부 API 호출을 기록합니다. 캐시 적중률과 호출량을 여기서 계산합니다. */
export async function logApiCall(entry: {
  provider: "odsay" | "kakao";
  endpoint: string;
  statusCode?: number;
  responseTimeMs?: number;
  cacheHit?: boolean;
  errorMessage?: string;
  userId?: string | null;
}): Promise<void> {
  try {
    await query(
      `insert into api_logs
         (provider, endpoint, status_code, response_time_ms, cache_hit, error_message, user_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.provider,
        entry.endpoint,
        entry.statusCode ?? null,
        entry.responseTimeMs ?? null,
        entry.cacheHit ?? false,
        entry.errorMessage ?? null,
        entry.userId ?? null,
      ],
    );
  } catch {
    // 로깅 실패가 사용자 요청을 막으면 안 됩니다.
  }
}
