export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  invalid: "아이디 또는 비밀번호가 올바르지 않습니다.",
  server: "로그인 처리 중 오류가 발생했습니다.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  const locked = error === "locked";

  return (
    <main>
      <header className="app"><h1>로그인</h1></header>
      <p className="sub">로그인하면 검색 기록과 이동 조건이 저장됩니다. 로그인 없이도 경로 검색은 가능합니다.</p>

      {reset ? (
        <p className="note info"><strong>비밀번호가 변경되었습니다.</strong> 새 비밀번호로 로그인하세요.</p>
      ) : null}

      {locked ? (
        <p className="note">
          <strong>비밀번호를 5회 틀려 계정이 잠겼습니다.</strong>
          {" "}시간이 지나도 자동으로 풀리지 않습니다.{" "}
          <a href="/reset">비밀번호를 재설정</a>하면 바로 다시 사용할 수 있습니다.
        </p>
      ) : error ? (
        <p className="note">{MESSAGES[error] ?? `오류: ${error}`}</p>
      ) : null}

      <div className="search-card">
        <form action="/api/auth/login" method="post">
          <div className="field">
            <label htmlFor="username">아이디</label>
            <input id="username" name="username" type="text" autoComplete="username"
                   required minLength={3} maxLength={30} />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="current-password"
                   required minLength={8} />
          </div>
          <button className="btn" type="submit">로그인</button>
        </form>
        <p className="hint">
          <a href="/reset">비밀번호를 잊으셨나요?</a>
        </p>
      </div>

      <footer className="app">
        <p>계정이 없으신가요? <a href="/register">회원가입</a> · <a href="/">경로 검색으로</a></p>
      </footer>
    </main>
  );
}
