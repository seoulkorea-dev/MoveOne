import Link from "next/link";
import { BTN_PRIMARY, BTN_SECONDARY, SectionTitle, Shell } from "@/components/app-chrome";
import { Icon } from "@/components/icon";
import { formatKST } from "@/lib/kst";
import LastResult from "./last-result";

export const dynamic = "force-dynamic";

/**
 * 경로 데이터를 못 불러왔을 때의 화면.
 *
 * "경로 없음"과 "불러오기 실패"는 사용자가 할 일이 다릅니다.
 * 경로가 없으면 출발·도착을 바꿔야 하고, 실패면 잠시 뒤 다시 시도해야 합니다.
 * 그래서 빈 결과는 결과 화면 안에서 안내하고, 실패만 이 화면으로 보냅니다.
 */

const DIAGNOSIS: Record<string, { label: string; detail: string }> = {
  network: {
    label: "네트워크 오류",
    detail: "브라우저가 서버에 닿지 못했습니다. 연결 상태를 확인해 주세요.",
  },
  timeout: {
    label: "응답 지연",
    detail: "교통 데이터 서버가 제한 시간 안에 응답하지 않았습니다.",
  },
  unauthorized: {
    label: "API 키 문제",
    detail:
      "ODsay 키가 없거나 Server(IP) 타입이 아닙니다. 콘솔에서 서버 공인 IP를 등록했는지 확인하세요.",
  },
  unknown: {
    label: "알 수 없는 오류",
    detail: "서버 로그에 원인이 남아 있습니다.",
  },
};

export default async function ErrorDataPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = "unknown" } = await searchParams;
  const diagnosis = DIAGNOSIS[code] ?? DIAGNOSIS.unknown;
  const now = new Date();

  return (
    <Shell title="ERROR" back="/search" tab="search">
      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col items-center text-center gap-space-md">
        <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center">
          <Icon name="cloud_off" size={32} className="text-error" />
        </div>

        <div className="flex flex-col gap-space-xs">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">
            경로 정보를 불러오지 못했습니다
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">{diagnosis.detail}</p>
        </div>

        <span className="font-label-md text-label-md text-on-surface-variant bg-surface-container-low px-space-md py-1.5 rounded-lg tracking-normal">
          진단 코드 <span className="text-on-surface font-bold">{code}</span> · {formatKST(now)}
        </span>

        <div className="flex flex-col gap-space-sm w-full pt-space-xs">
          <Link href="/search" className={BTN_PRIMARY}>
            <span>다시 시도</span>
            <Icon name="refresh" size={18} />
          </Link>
          <Link href="/" className={BTN_SECONDARY}>
            홈으로 이동
          </Link>
        </div>
      </section>

      <SectionTitle>진단</SectionTitle>

      <section className="bg-surface-container-lowest rounded-xl divide-y divide-outline-variant/60 shadow-sm overflow-hidden">
        <Row label="경로 데이터 (ODsay)" state={diagnosis.label} ok={false} />
        <Row label="장소 검색 (카카오)" state="확인 필요" ok />
        <Row label="로그인 세션" state="정상" ok />
      </section>

      <LastResult />
    </Shell>
  );
}

function Row({ label, state, ok }: { label: string; state: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-space-sm p-space-base min-h-[44px]">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-ontime" : "bg-alert"}`}
        aria-hidden="true"
      />
      <span className="font-body-md text-body-md text-on-surface flex-1 min-w-0 truncate">
        {label}
      </span>
      <span className={`font-label-lg text-label-lg shrink-0 ${ok ? "text-ontime" : "text-alert"}`}>
        {state}
      </span>
    </div>
  );
}
