import Link from "next/link";
import { requireSession } from "@/lib/auth-guard";
import { withUser } from "@/lib/db";
import { formatKSTLong, relativeKo } from "@/lib/kst";
import { Banner, BTN_SECONDARY, SectionTitle, Shell } from "@/components/app-chrome";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  username: string;
  email: string | null;
  nickname: string | null;
  status: string;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
};

/**
 * 회원 정보.
 *
 * users·user_auth 는 RLS가 걸려 있어 query() 로는 아무것도 안 보입니다.
 * withUser() 로 사용자 컨텍스트를 심어야 자기 행만 보입니다 —
 * 이 화면이 RLS가 실제로 도는지 확인하는 가장 쉬운 자리이기도 합니다.
 */
export default async function AccountPage() {
  const session = await requireSession();

  const rows = await withUser(session.uid, (q) =>
    q<AccountRow>(
      `select u.id::text        as id,
              a.provider_user_id as username,
              u.email,
              u.nickname,
              u.status,
              u.created_at,
              a.last_login_at,
              a.login_count
         from users u
         join user_auth a on a.user_id = u.id and a.provider = 'local'
        where u.id = $1`,
      [session.uid],
    ),
  ).catch(() => [] as AccountRow[]);

  const me = rows[0];

  return (
    <Shell title="ACCOUNT" back="/" actions={false}>
      <div className="flex flex-col items-center gap-space-sm pt-space-sm">
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
          <Icon name="person" size={32} className="text-on-primary" />
        </div>
        <h2 className="font-headline-lg text-headline-lg text-primary">
          {me?.nickname ?? session.login}
        </h2>
      </div>

      {me ? (
        <>
          <SectionTitle>계정</SectionTitle>
          <section className="bg-surface-container-lowest rounded-xl divide-y divide-outline-variant/60 shadow-sm overflow-hidden">
            <Row label="아이디" value={me.username} />
            <Row
              label="이메일"
              value={me.email ?? "등록되지 않음"}
              muted={!me.email}
            />
            <Row label="상태" value={me.status === "active" ? "정상" : me.status} />
            <Row label="가입일" value={formatKSTLong(me.created_at)} />
            <Row
              label="마지막 로그인"
              value={me.last_login_at ? relativeKo(me.last_login_at) : "기록 없음"}
            />
            <Row label="로그인 횟수" value={`${me.login_count}회`} />
          </section>

          {!me.email ? (
            <Banner tone="error" icon="mail" title="이메일이 등록되어 있지 않습니다">
              비밀번호를 잊으면 재설정할 방법이 없습니다. 이메일 등록 기능은 다음 단계입니다.
            </Banner>
          ) : null}
        </>
      ) : (
        <Banner tone="error" icon="error" title="회원 정보를 불러오지 못했습니다">
          세션은 유효하지만 사용자 행이 보이지 않습니다. DATABASE_URL 이 moveone_app 역할인지,
          RLS 정책이 적용됐는지 확인하세요.
        </Banner>
      )}

      <SectionTitle>보안</SectionTitle>

      <Link href="/reset" className={BTN_SECONDARY}>
        <Icon name="lock_reset" size={18} />
        <span>비밀번호 변경</span>
      </Link>

      <form action="/api/auth/logout" method="post" className="pt-space-xs">
        <button
          type="submit"
          className="w-full h-12 bg-surface-container-lowest border border-error text-error rounded-lg font-body-md-bold text-body-md-bold flex items-center justify-center gap-2 hover:bg-error-container/50 active:scale-[0.99] transition-all"
        >
          <Icon name="logout" size={18} />
          <span>로그아웃</span>
        </button>
      </form>
    </Shell>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-space-sm p-space-base min-h-[44px]">
      <span className="font-label-lg text-label-lg text-on-surface-variant tracking-normal shrink-0 w-28">
        {label}
      </span>
      <span
        className={`font-body-md text-body-md flex-1 min-w-0 break-all ${
          muted ? "text-outline" : "text-on-surface"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
