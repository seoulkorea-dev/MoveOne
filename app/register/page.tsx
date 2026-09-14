import Link from "next/link";
import { redirectIfSignedIn } from "@/lib/auth-guard";
import { Banner, BTN_PRIMARY, CARD, Field, Shell } from "@/components/app-chrome";

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
  await redirectIfSignedIn();

  const { error } = await searchParams;

  return (
    <Shell title="SIGN UP" back="/login" actions={false}>
      <div className="flex flex-col gap-space-xs pt-space-sm">
        <h2 className="font-headline-lg text-headline-lg text-primary">회원가입</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          비밀번호 재설정에 사용하므로 이메일은 필수입니다.
        </p>
      </div>

      {error ? (
        <Banner tone="error" icon="error" title="가입하지 못했습니다">
          {MESSAGES[error] ?? `오류: ${error}`}
        </Banner>
      ) : null}

      <form action="/api/auth/register" method="post" className={CARD}>
        <Field
          id="email"
          label="이메일"
          placeholder="name@example.com"
          type="email"
          autoComplete="email"
          required
          hint="비밀번호를 잊었을 때 재설정 링크를 이 주소로 보냅니다."
        />
        <Field
          id="username"
          label="아이디"
          placeholder="영문 소문자, 숫자, . _ -"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={30}
        />
        <Field
          id="password"
          label="비밀번호"
          placeholder="8자 이상"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="비밀번호는 scrypt 단방향 해시로만 저장됩니다."
        />
        <Field
          id="password_confirm"
          label="비밀번호 확인"
          placeholder="다시 한 번 입력하세요"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />

        <button type="submit" className={BTN_PRIMARY}>
          가입하기
        </button>
      </form>

      <p className="text-center font-body-md text-body-md text-on-surface-variant">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="text-secondary font-body-md-bold text-body-md-bold">
          로그인
        </Link>
      </p>
    </Shell>
  );
}
