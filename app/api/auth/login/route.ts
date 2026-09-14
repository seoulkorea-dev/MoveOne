import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { DUMMY_HASH, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_MAX_AGE, serializeSession } from "@/lib/session";

export const runtime = "nodejs";

const MAX_FAILS = 5;

function back(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url.toString(), 303);
}

type AuthRow = {
  user_id: string;
  auth_id: string;
  password_hash: string | null;
  failed_attempts: number;
  locked_at: Date | null;
  email: string | null;
};

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();

  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");

  if (!username || !password) return back(origin, "invalid");

  /** 시도는 결과와 무관하게 항상 남깁니다 (감사 추적). */
  const record = (success: boolean, outcome: string) =>
    query(
      `insert into login_attempts (username, ip, user_agent, success, outcome)
       values ($1, $2, $3, $4, $5)`,
      [username, ip, userAgent, success, outcome],
    ).catch(() => {});

  try {
    // 인증 조회는 SECURITY DEFINER 함수를 통합니다.
    // RLS가 걸려 있어 일반 조회로는 읽히지 않습니다.
    const [row] = await query<AuthRow>(`select * from auth_lookup_local($1)`, [username]);

    // 계정이 잠긴 경우.
    //
    // 잠금 사실을 알려주면 "그 아이디는 존재한다"가 노출됩니다.
    // 그럼에도 알려주는 이유: 사용자가 재설정이라는 행동을 해야
    // 풀리기 때문입니다. 안내하지 않으면 영원히 못 들어옵니다.
    // 금융권 계정 잠금도 같은 이유로 상태를 알려줍니다.
    if (row?.locked_at) {
      // 잠긴 경우에도 해시 검증을 한 번 수행해 응답 시간을 맞춥니다.
      await verifyPassword(password, DUMMY_HASH);
      await record(false, "locked");
      return back(origin, "locked");
    }

    // 아이디가 없어도 검증을 수행합니다.
    // 그러지 않으면 응답이 빨리 오는 것만으로 존재 여부가 새어나갑니다.
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);

    if (!row) {
      await record(false, "no_such_user");
      return back(origin, "invalid");
    }

    if (!ok) {
      // 실패를 누적하고, 임계치에 닿으면 계정을 잠급니다.
      const [locked] = await query<{ record_login_failure: boolean }>(
        `select record_login_failure($1, $2)`,
        [row.auth_id, MAX_FAILS],
      );
      await record(false, "bad_password");
      return back(origin, locked?.record_login_failure ? "locked" : "invalid");
    }

    await query(`select record_login_success($1)`, [row.auth_id]);
    await record(true, "success");

    const response = NextResponse.redirect(new URL("/", origin).toString(), 303);
    response.cookies.set(SESSION_COOKIE, serializeSession({ uid: row.user_id, login: username }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    console.error("로그인 실패:", error);
    await record(false, "unknown");
    return back(origin, "server");
  }
}
