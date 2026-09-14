import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 비밀번호 재설정 토큰.
 *
 * 원문은 메일로만 나가고, DB에는 SHA-256 해시만 저장합니다.
 * DB가 유출돼도 그 값으로는 재설정을 할 수 없습니다.
 *
 * 비밀번호와 달리 느린 해시(scrypt)를 쓰지 않는 이유:
 *   토큰은 256비트 난수라 무차별 대입이 애초에 불가능합니다.
 *   느리게 만들 이유가 없고, 검증이 요청마다 일어나므로 빠른 편이 낫습니다.
 */

export const RESET_TTL_MINUTES = 30;

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 토큰 형식 검증. DB를 때리기 전에 명백히 잘못된 값을 걸러냅니다. */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** 두 해시 비교 (길이가 같을 때만 상수 시간 비교) */
export function hashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
