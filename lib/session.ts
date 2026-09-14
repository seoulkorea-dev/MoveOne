import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "demo_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

export type SessionData = {
  /** users.id — bigserial이라 정밀도 손실을 피하려고 문자열로 다룬다. */
  uid: string;
  login: string;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET이 없거나 32자 미만입니다. `openssl rand -base64 48`로 만들어 .env.local에 넣으세요.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** 쿠키에 담을 토큰을 만든다. 형식: <base64url(json)>.<hmac> */
export function serializeSession(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** 서명이 맞지 않으면 null. 값이 위조되면 여기서 걸린다. */
export function parseSession(token: string | undefined | null): SessionData | null {
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed?.uid === "string" && typeof parsed?.login === "string") {
      return parsed as SessionData;
    }
    return null;
  } catch {
    return null;
  }
}

/** 서버 컴포넌트에서 현재 세션을 읽는다. Next 15+에서 cookies()는 비동기다. */
export async function getSession(): Promise<SessionData | null> {
  const jar = await cookies();
  return parseSession(jar.get(SESSION_COOKIE)?.value);
}
