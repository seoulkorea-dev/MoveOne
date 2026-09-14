import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, validatePassword, validateUsername } from "@/lib/password";
import { SESSION_COOKIE, SESSION_MAX_AGE, serializeSession } from "@/lib/session";

export const runtime = "nodejs";

function back(origin: string, reason: string) {
  const url = new URL("/register", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url.toString(), 303);
}

/** 형식만 봅니다. 실제 도달 여부는 재설정 메일이 증명합니다. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();

  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const passwordConfirm = String(form.get("password_confirm") ?? "");

  if (validateUsername(username)) return back(origin, "username");
  // 이메일은 필수입니다. 없으면 계정이 잠겼을 때 풀 방법이 없습니다.
  if (!looksLikeEmail(email)) return back(origin, "email");
  if (validatePassword(password)) return back(origin, "password");
  if (password !== passwordConfirm) return back(origin, "mismatch");

  try {
    const passwordHash = await hashPassword(password);

    const [row] = await query<{ register_local_user: string }>(
      `select register_local_user($1, $2, $3)`,
      [username, passwordHash, email],
    );

    const userId = row.register_local_user;

    const response = NextResponse.redirect(new URL("/", origin).toString(), 303);
    response.cookies.set(SESSION_COOKIE, serializeSession({ uid: userId, login: username }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    // 23505 = unique_violation — 아이디 또는 이메일 중복
    const code = (error as { code?: string })?.code;
    if (code === "23505") {
      const detail = String((error as { detail?: string })?.detail ?? "");
      return back(origin, detail.includes("email") ? "email_taken" : "duplicate");
    }
    console.error("회원가입 실패:", error);
    return back(origin, "server");
  }
}
