import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

/** POST로만 받는다 — GET 로그아웃은 링크 미리보기 등에 의해 의도치 않게 호출될 수 있다. */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  // 303: POST 이후에는 GET으로 바꿔 리다이렉트해야 한다(307은 POST를 유지한다).
  const response = NextResponse.redirect(new URL("/", origin).toString(), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
