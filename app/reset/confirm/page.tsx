import { Banner, BTN_PRIMARY, CARD, Field, Shell } from "@/components/app-chrome";

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
      <Shell title="NEW PASSWORD" actions={false}>
        <div className="flex flex-col gap-space-xs pt-space-sm">
          <h2 className="font-headline-lg text-headline-lg text-primary">
            링크가 유효하지 않습니다
          </h2>
        </div>

        <Banner
          tone="error"
          icon="link_off"
          title="이 링크는 사용할 수 없습니다"
          action={{ href: "/reset", label: "재설정 링크 다시 받기" }}
        >
          만료되었거나 이미 사용된 링크입니다. 재설정 링크는 30분 동안 한 번만 사용할 수 있습니다.
        </Banner>
      </Shell>
    );
  }

  return (
    <Shell title="NEW PASSWORD" actions={false}>
      <div className="flex flex-col gap-space-xs pt-space-sm">
        <h2 className="font-headline-lg text-headline-lg text-primary">새 비밀번호 설정</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          변경하면 기존에 로그인된 모든 기기에서 로그아웃됩니다.
        </p>
      </div>

      {error ? (
        <Banner tone="error" icon="error" title="변경하지 못했습니다">
          {MESSAGES[error] ?? `오류: ${error}`}
        </Banner>
      ) : null}

      <form action="/api/auth/reset/confirm" method="post" className={CARD}>
        <input type="hidden" name="token" value={token} />
        <Field
          id="password"
          label="새 비밀번호"
          placeholder="8자 이상"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <Field
          id="password_confirm"
          label="새 비밀번호 확인"
          placeholder="다시 한 번 입력하세요"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <button type="submit" className={BTN_PRIMARY}>
          비밀번호 변경
        </button>
      </form>

      <Banner tone="info" icon="lock_open" title="계정 잠금도 함께 해제됩니다">
        로그인 5회 실패로 잠긴 계정은 비밀번호를 재설정하면 다시 사용할 수 있습니다.
      </Banner>
    </Shell>
  );
}
