import { requireSession } from "@/lib/auth-guard";
import { Banner, SectionTitle, Shell } from "@/components/app-chrome";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

/**
 * 패스·지갑 — 시안의 세 번째 탭.
 *
 * 결제수단 관리 화면이 들어올 자리입니다. 아직 만들지 않은 이유:
 *   - 카드번호는 **우리 DB 로 받지 않습니다.** PG(토스페이먼츠 등) 화면으로
 *     넘기고 우리는 빌링키만 보관하는 구조가 맞습니다. 그 계약이 선행입니다
 *   - 예약·결제는 CLAUDE.md 상 1차 범위 밖입니다
 *
 * 빈 화면을 두는 대신 무엇이 들어올 자리인지 적어 둡니다. 탭을 눌렀는데
 * 아무 일도 없는 것보다 낫습니다.
 */
export default async function WalletPage() {
  await requireSession();

  return (
    <Shell title="PASS" tab="wallet">
      <div className="flex flex-col gap-space-xs pt-space-sm">
        <h2 className="font-headline-lg text-headline-lg text-primary">패스 · 지갑</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          교통카드와 결제수단을 관리하는 자리입니다.
        </p>
      </div>

      <SectionTitle>들어올 기능</SectionTitle>

      <section className="bg-surface-container-lowest rounded-xl divide-y divide-outline-variant/60 shadow-sm overflow-hidden">
        <Planned
          icon="credit_card"
          title="결제수단 관리"
          detail="카드 등록·삭제와 기본 결제수단 지정"
        />
        <Planned
          icon="receipt_long"
          title="이용 내역 · 영수증"
          detail="결제 내역과 영수증 상세"
        />
        <Planned
          icon="confirmation_number"
          title="정기권 · 패스"
          detail="기후동행카드 등 정기권 연동"
        />
      </section>

      <Banner tone="info" icon="lock" title="카드번호는 서비스가 보관하지 않습니다">
        결제수단을 붙일 때도 카드번호는 결제대행사 화면에서 직접 입력받고, 서비스는
        결제에 쓰는 키만 보관합니다. 우리 데이터베이스에 카드번호가 들어오지 않는
        구조로 만듭니다.
      </Banner>
    </Shell>
  );
}

function Planned({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-space-sm p-space-base min-h-[44px]">
      <span className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
        <Icon name={icon} size={20} className="text-outline" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-body-md-bold text-body-md-bold text-on-surface">{title}</p>
        <p className="font-label-md text-label-md text-on-surface-variant tracking-normal">
          {detail}
        </p>
      </div>
      <span className="font-label-md text-label-md bg-surface-container text-on-surface-variant px-2 py-0.5 rounded shrink-0">
        예정
      </span>
    </div>
  );
}
