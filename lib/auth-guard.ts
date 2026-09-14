import { redirect } from "next/navigation";
import { getSession, type SessionData } from "./session";

/**
 * 로그인이 필요한 서버 컴포넌트의 첫 줄에서 부릅니다.
 *
 * 미들웨어로 막지 않는 이유: 세션 서명에 node:crypto 의 createHmac 을 쓰는데
 * 미들웨어는 엣지 런타임에서 돌아 이 모듈을 쓸 수 없습니다. 화면마다
 * 명시적으로 부르는 편이 어디가 보호되는지도 눈에 보입니다.
 */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * 인증 화면(로그인·회원가입)에서 부릅니다.
 * 이미 로그인한 사람에게 로그인 화면을 다시 보여줄 이유가 없습니다.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const session = await getSession();
  if (session) redirect("/");
}
