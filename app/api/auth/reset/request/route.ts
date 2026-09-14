import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { passwordResetMail, sendMail } from "@/lib/mailer";
import { RESET_TTL_MINUTES, generateResetToken } from "@/lib/reset-token";

export const runtime = "nodejs";

/**
 * 재설정 요청.
 *
 * 핵심 원칙: 이메일이 등록돼 있든 아니든 **똑같이 응답합니다.**
 * "그 이메일은 없습니다"를 알려주면 어떤 이메일이 가입돼 있는지
 * 하나씩 확인할 수 있게 됩니다(계정 열거).
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");

  // 성공·실패 구분 없이 항상 이 화면으로 보냅니다.
  const done = NextResponse.redirect(new URL("/reset?sent=1", origin).toString(), 303);

  if (!email) return done;

  try {
    const { token, tokenHash } = generateResetToken();

    const [row] = await query<{ request_password_reset: string | null }>(
      `select request_password_reset($1, $2, $3, $4)`,
      [email, tokenHash, RESET_TTL_MINUTES, ip],
    );

    // 등록된 이메일일 때만 실제로 보냅니다.
    if (row?.request_password_reset) {
      const resetUrl = new URL(`/reset/confirm?token=${token}`, origin).toString();
      await sendMail(passwordResetMail(email, resetUrl, RESET_TTL_MINUTES));
    }
  } catch (error) {
    // 오류도 사용자에게는 드러내지 않습니다. 로그로만 남깁니다.
    console.error("재설정 요청 실패:", error);
  }

  return done;
}
