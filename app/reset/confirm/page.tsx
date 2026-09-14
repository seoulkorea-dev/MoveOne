export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  password: "비밀번호는 8자 이상이어야 합니다.",
  mismatch: "비밀번호 확인이 일치하지 않습니다.",
  server: "처리 중 오류가 발생했습니다.",
};

export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  // 만료됐는지 이미 썼는지는 구분해 알리지 않습니다.
  if (!token || error === "invalid_token") {
    return (
      <main>
        <header className="app"><h1>링크가 유효하지 않습니다</h1></header>
        <p className="note">
          <strong>이 링크는 사용할 수 없습니다.</strong> 만료되었거나 이미 사용된 링크입니다.
          재설정 링크는 30분 동안 한 번만 사용할 수 있습니다.
        </p>
        <p className="hint"><a href="/reset">재설정을 다시 요청</a>하세요.</p>
      </main>
    );
  }

  return (
    <main>
      <header className="app"><h1>새 비밀번호 설정</h1></header>
      <p className="sub">새 비밀번호를 설정하면 계정 잠금도 함께 해제됩니다.</p>

      {error ? <p className="note">{MESSAGES[error] ?? `오류: ${error}`}</p> : null}

      <div className="search-card">
        <form action="/api/auth/reset/confirm" method="post">
          <input type="hidden" name="token" value={token} />
          <div className="field">
            <label htmlFor="password">새 비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="new-password"
                   required minLength={8} placeholder="8자 이상" />
          </div>
          <div className="field">
            <label htmlFor="password_confirm">새 비밀번호 확인</label>
            <input id="password_confirm" name="password_confirm" type="password"
                   autoComplete="new-password" required minLength={8} />
          </div>
          <button className="btn" type="submit">비밀번호 변경</button>
        </form>
      </div>

      <footer className="app">
        <p>변경 후에는 새 비밀번호로 다시 로그인하셔야 합니다.</p>
      </footer>
    </main>
  );
}
