import Link from "next/link";
import { redirectIfSignedIn } from "@/lib/auth-guard";
import { Banner, BTN_PRIMARY, BTN_SECONDARY, CARD, Field, Shell } from "@/components/app-chrome";
import { Icon } from "@/components/icon";
import { BrandHeadline, BrandStory, LoginBanner } from "@/components/login-hero";

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
  await redirectIfSignedIn();

  const { error, reset } = await searchParams;
  const locked = error === "locked";

  return (
    <Shell title="SIGN IN" actions={false}>
      <LoginBanner />

      {/* 배너 바로 아래는 브랜드 문구입니다.
          예전에는 "다시 오신 것을 환영합니다 / 저장된 경로와 이동 조건을
          이어서 사용하세요"가 있었습니다. 뺀 이유는 두 가지입니다.
            - 처음 오는 사람에게는 "다시 오신"이 맞지 않습니다
            - 아래 BrandStory 와 같은 자리를 두 번 쓰는 셈이었습니다
          BrandHeadline 을 위로 올렸으므로 BrandStory 에서는 같은 문구를
          뺐습니다. 같은 말이 한 화면에 두 번 나오면 안 됩니다. */}
      <BrandHeadline />

      {reset ? (
        <Banner tone="ok" icon="check_circle" title="비밀번호가 변경되었습니다">
          새 비밀번호로 로그인하세요.
        </Banner>
      ) : null}

      {locked ? (
        <Banner
          tone="error"
          icon="lock"
          title="계정이 잠겼습니다"
          action={{ href: "/reset", label: "비밀번호 재설정하기" }}
        >
          비밀번호를 5회 잘못 입력했습니다. 시간이 지나도 자동으로 풀리지 않으며, 비밀번호를
          재설정해야 로그인할 수 있습니다.
        </Banner>
      ) : error ? (
        <Banner tone="error" icon="error" title="로그인하지 못했습니다">
          {MESSAGES[error] ?? `오류: ${error}`}
        </Banner>
      ) : null}

      <form action="/api/auth/login" method="post" className={CARD}>
        <Field
          id="username"
          label="아이디"
          placeholder="아이디를 입력하세요"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={30}
        />
        <Field
          id="password"
          label="비밀번호"
          placeholder="비밀번호를 입력하세요"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />

        <div className="flex items-center justify-end">
          <Link
            href="/reset"
            className="font-label-lg text-label-lg text-secondary min-h-[44px] flex items-center"
          >
            비밀번호 찾기
          </Link>
        </div>

        <button type="submit" className={BTN_PRIMARY}>
          <span>로그인</span>
          <Icon name="login" size={18} />
        </button>
      </form>

      <div className="flex items-center gap-space-md py-space-xs">
        <span className="h-px flex-1 bg-outline-variant" />
        <span className="font-label-md text-label-md text-outline tracking-normal">
          아직 계정이 없으신가요?
        </span>
        <span className="h-px flex-1 bg-outline-variant" />
      </div>

      <Link href="/register" className={BTN_SECONDARY}>
        회원가입
      </Link>

      {/* 브랜드 문구는 맨 아래입니다. 위에 두면 로그인 폼이 한참 밀려 내려갑니다.
          위로 올리시려면 이 한 줄을 <LoginBanner /> 바로 아래로 옮기면 됩니다. */}
      <BrandStory />
    </Shell>
  );
}
