export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  username: "아이디는 영문 소문자·숫자·. _ - 만 사용해 3~30자로 만들어 주세요.",
  email: "이메일 형식이 올바르지 않습니다.",
  email_taken: "이미 사용 중인 이메일입니다.",
  password: "비밀번호는 8자 이상이어야 합니다.",
  mismatch: "비밀번호 확인이 일치하지 않습니다.",
  duplicate: "이미 사용 중인 아이디입니다.",
  server: "가입 처리 중 오류가 발생했습니다.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <header className="app"><h1>회원가입</h1></header>
      <p className="sub">비밀번호는 scrypt 단방향 해시로만 저장됩니다. 이메일은 비밀번호 재설정에만 사용합니다.</p>

      {error ? <p className="note">{MESSAGES[error] ?? `오류: ${error}`}</p> : null}

      <div className="search-card">
        <form action="/api/auth/register" method="post">
          <div className="field">
            <label htmlFor="username">아이디</label>
            <input id="username" name="username" type="text" autoComplete="username"
                   required minLength={3} maxLength={30} placeholder="영문 소문자, 숫자, . _ -" />
          </div>
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input id="email" name="email" type="email" autoComplete="email"
                   required maxLength={254} placeholder="비밀번호 재설정에 사용됩니다" />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="new-password"
                   required minLength={8} placeholder="8자 이상" />
          </div>
          <div className="field">
            <label htmlFor="password_confirm">비밀번호 확인</label>
            <input id="password_confirm" name="password_confirm" type="password"
                   autoComplete="new-password" required minLength={8} />
          </div>
          <button className="btn" type="submit">가입하고 로그인</button>
        </form>
        <p className="hint">이미 계정이 있으신가요? <a href="/login">로그인</a></p>
      </div>

      <footer className="app">
        <p>비밀번호를 5회 틀리면 계정이 잠기고, 이메일로 재설정해야 풀립니다.</p>
      </footer>
    </main>
  );
}
