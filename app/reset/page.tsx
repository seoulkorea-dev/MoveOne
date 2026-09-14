import Link from "next/link";
import { Banner, BTN_PRIMARY, BTN_SECONDARY, CARD, Field, Shell } from "@/components/app-chrome";
import { Icon } from "@/components/icon";

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
      <Shell title="RESET" back="/login" actions={false}>
        <div className="flex flex-col gap-space-xs pt-space-sm">
          <h2 className="font-headline-lg text-headline-lg text-primary">메일을 확인하세요</h2>
        </div>

        <Banner tone="ok" icon="mark_email_read" title="메일을 보냈습니다">
          입력하신 주소로 가입된 계정이 있다면 재설정 링크를 보냈습니다. 링크는 30분 동안, 한 번만
          사용할 수 있습니다.
        </Banner>

        <Banner tone="info" icon="info" title="메일이 오지 않나요?">
          스팸함을 확인해 주세요. 그래도 없으면 다른 주소로 가입했을 수 있습니다. 개발 중에는 메일이
          실제로 발송되지 않고 서버 터미널에 링크가 출력됩니다.
        </Banner>

        <Link href="/reset" className={BTN_SECONDARY}>
          다시 요청하기
        </Link>
        <Link
          href="/login"
          className="text-center font-label-lg text-label-lg text-secondary min-h-[44px] flex items-center justify-center"
        >
          로그인으로 돌아가기
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="RESET" back="/login" actions={false}>
      <div className="flex flex-col gap-space-xs pt-space-sm">
        <h2 className="font-headline-lg text-headline-lg text-primary">비밀번호 재설정</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          가입할 때 등록한 이메일 주소를 입력하세요.
        </p>
      </div>

      <form action="/api/auth/reset/request" method="post" className={CARD}>
        <Field
          id="email"
          label="이메일"
          placeholder="name@example.com"
          type="email"
          autoComplete="email"
          required
        />
        <button type="submit" className={BTN_PRIMARY}>
          <span>재설정 링크 보내기</span>
          <Icon name="mail" size={18} />
        </button>
      </form>

      <Banner tone="info" icon="lock_open" title="계정 잠금도 함께 해제됩니다">
        로그인 5회 실패로 잠긴 계정은 비밀번호를 재설정하면 다시 사용할 수 있습니다.
      </Banner>
    </Shell>
  );
}
