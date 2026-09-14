import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, validatePassword } from "@/lib/password";
import { hashResetToken, looksLikeToken } from "@/lib/reset-token";

export const runtime = "nodejs";

function back(origin: string, token: string, reason: string) {
  const url = new URL("/reset/confirm", origin);
  if (looksLikeToken(token)) url.searchParams.set("token", token);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url.toString(), 303);
}

/** 재설정 확정. 성공하면 계정 잠금도 함께 풀립니다. */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();

  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const passwordConfirm = String(form.get("password_confirm") ?? "");

  if (!looksLikeToken(token)) return back(origin, "", "invalid_token");
  if (validatePassword(password)) return back(origin, token, "password");
  if (password !== passwordConfirm) return back(origin, token, "mismatch");

  try {
    const newHash = await hashPassword(password);

    const [row] = await query<{ confirm_password_reset: boolean }>(
      `select confirm_password_reset($1, $2)`,
      [hashResetToken(token), newHash],
    );

    if (!row?.confirm_password_reset) {
      // 만료됐거나 이미 쓴 토큰입니다. 어느 쪽인지는 구분해 알리지 않습니다.
      return back(origin, "", "invalid_token");
    }

    // 재설정 후에는 자동 로그인하지 않습니다.
    // 새 비밀번호로 직접 로그인해야 본인 확인이 한 번 더 이루어집니다.
    return NextResponse.redirect(new URL("/login?reset=1", origin).toString(), 303);
  } catch (error) {
    console.error("재설정 확정 실패:", error);
    return back(origin, token, "server");
  }
}
