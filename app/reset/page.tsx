export const dynamic = "force-dynamic";

export default async function ResetRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  // 보냈는지 여부를 이메일 등록 여부와 무관하게 똑같이 보여줍니다.
  // 여기서 차이를 두면 어떤 이메일이 가입돼 있는지 알아낼 수 있습니다.
  if (sent) {
    return (
      <main>
        <header className="app"><h1>메일을 확인하세요</h1></header>
        <p className="note info">
          <strong>입력하신 주소가 등록돼 있다면</strong> 비밀번호 재설정 링크를 보냈습니다.
          링크는 30분 동안만 유효하며 한 번만 사용할 수 있습니다.
        </p>
        <p className="hint">
          메일이 오지 않으면 스팸함을 확인하시고, 주소가 맞는지 다시 확인해 주세요.
          {" "}<a href="/reset">다시 요청하기</a> · <a href="/login">로그인으로</a>
        </p>
        <footer className="app">
          <p>개발 중에는 메일이 실제로 발송되지 않고 서버 터미널에 링크가 출력됩니다.</p>
        </footer>
      </main>
    );
  }

  return (
    <main>
      <header className="app"><h1>비밀번호 재설정</h1></header>
      <p className="sub">가입할 때 등록한 이메일 주소를 입력하시면 재설정 링크를 보내드립니다.</p>

      <div className="search-card">
        <form action="/api/auth/reset/request" method="post">
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input id="email" name="email" type="email" autoComplete="email"
                   required maxLength={254} />
          </div>
          <button className="btn" type="submit">재설정 링크 받기</button>
        </form>
        <p className="hint"><a href="/login">로그인으로 돌아가기</a></p>
      </div>
    </main>
  );
}
