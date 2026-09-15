import Link from "next/link";
import { redirectIfSignedIn } from "@/lib/auth-guard";
import { Banner, BTN_PRIMARY, CARD, Field, Shell } from "@/components/app-chrome";
import { Icon } from "@/components/icon";
import { CONSENT_ITEMS, consentField } from "@/lib/consent";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  username: "아이디는 영문 소문자·숫자·. _ - 만 사용해 3~30자로 만들어 주세요.",
  email: "이메일 형식이 올바르지 않습니다.",
  email_taken: "이미 사용 중인 이메일입니다.",
  password: "비밀번호는 8자 이상이어야 합니다.",
  mismatch: "비밀번호 확인이 일치하지 않습니다.",
  duplicate: "이미 사용 중인 아이디입니다.",
  consent: "필수 항목에 모두 동의해야 가입할 수 있습니다.",
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

        <ConsentBlock />

        <button type="submit" className={BTN_PRIMARY} data-log="register.submit">
          동의하고 가입하기
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

/**
 * 동의 항목.
 *
 * 필수 항목은 `required` 를 달아 브라우저가 먼저 막고, 서버에서도 다시
 * 확인합니다. 브라우저 검사는 편의일 뿐 방어선이 아닙니다.
 *
 * 전체 동의 체크박스는 두지 않았습니다. 한 번에 켜지는 버튼이 있으면
 * 선택 항목까지 딸려 들어가고, 나중에 "동의한 적 없다" 는 분쟁의 빌미가
 * 됩니다. 항목이 네 개뿐이라 하나씩 누르는 편이 낫습니다.
 */
function ConsentBlock() {
  return (
    <fieldset className="flex flex-col gap-space-sm border-t border-outline-variant pt-space-base mt-space-xs">
      <legend className="sr-only">약관 동의</legend>
      <p className="font-label-lg text-label-lg text-on-surface-variant">
        가입에 필요한 동의
      </p>

      {CONSENT_ITEMS.map((item) => (
        <div key={item.type} className="flex flex-col gap-space-xxs">
          <label className="flex items-start gap-space-sm cursor-pointer min-h-[44px] py-1">
            <input
              type="checkbox"
              name={consentField(item.type)}
              value="on"
              required={item.required}
              data-log={`register.consent.${item.type}`}
              className="mt-1 w-5 h-5 shrink-0 accent-secondary cursor-pointer"
            />
            <span className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5">
              <span
                className={`font-label-md text-label-md px-1.5 py-0.5 rounded ${
                  item.required
                    ? "bg-primary-fixed text-on-primary-fixed"
                    : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {item.required ? "필수" : "선택"}
              </span>
              <span className="font-body-md text-body-md text-on-surface">{item.label}</span>
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-secondary font-label-lg text-label-lg inline-flex items-center gap-0.5 underline underline-offset-2"
                  data-log={`register.consent.view.${item.type}`}
                >
                  전문 보기
                  <Icon name="chevron_right" size={14} />
                </Link>
              ) : null}
            </span>
          </label>
          {item.hint ? (
            <p className="font-label-md text-label-md text-on-surface-variant tracking-normal pl-8">
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}

      <p className="font-label-md text-label-md text-on-surface-variant tracking-normal pl-0.5">
        동의한 항목과 시각은 기록으로 남으며, 회원정보 화면에서 언제든 확인할 수
        있습니다.
      </p>
    </fieldset>
  );
}
