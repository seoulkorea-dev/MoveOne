import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, validatePassword, validateUsername } from "@/lib/password";
import { SESSION_COOKIE, SESSION_MAX_AGE, serializeSession } from "@/lib/session";
import {
  CONSENT_ITEMS,
  REQUIRED_CONSENTS,
  consentField,
  recordSignupConsents,
  type ConsentType,
} from "@/lib/consent";
import { log } from "@/lib/logger";

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

  // 동의는 브라우저의 required 로 한 번, 여기서 다시 확인합니다.
  // 브라우저 검사는 편의일 뿐 방어선이 아닙니다 — 폼은 얼마든지 조작됩니다.
  const agreed = Object.fromEntries(
    CONSENT_ITEMS.map((item) => [item.type, form.get(consentField(item.type)) !== null]),
  ) as Record<ConsentType, boolean>;

  if (REQUIRED_CONSENTS.some((item) => !agreed[item.type])) {
    return back(origin, "consent");
  }

  try {
    const passwordHash = await hashPassword(password);

    const [row] = await query<{ register_local_user: string }>(
      `select register_local_user($1, $2, $3)`,
      [username, passwordHash, email],
    );

    const userId = row.register_local_user;

    // 동의 기록. 실패해도 가입은 되돌리지 않습니다 — 계정은 이미 만들어졌고,
    // 여기서 예외를 던지면 사용자는 "가입 실패" 를 보지만 실제로는 계정이
    // 생긴 상태가 됩니다. 대신 오류로 남겨 반드시 눈에 띄게 합니다.
    try {
      await recordSignupConsents(userId, agreed);
      log.info("가입 동의 기록", {
        userId,
        marketing: agreed.marketing,
      });
    } catch (cause) {
      log.error("가입 동의 기록 실패 — 계정은 생성됨", {
        userId,
        message: String(cause).slice(0, 200),
      });
    }

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
