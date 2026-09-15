import { Suspense } from "react";
import { requireSession } from "@/lib/auth-guard";
import { Shell } from "@/components/app-chrome";
import DetailView from "./detail-view";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage() {
  await requireSession();

  // 브라우저로 내려보내도 되는 키만 넘깁니다. 둘 다 도메인 등록으로
  // 보호되는 공개 키이고, 서버 전용 키(REST·ODsay 서버 키)는 여기 오지 않습니다.
  // 클라이언트 컴포넌트가 직접 process.env 를 읽지 않도록 여기서 읽습니다.
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const odsayWebKey = process.env.NEXT_PUBLIC_ODSAY_WEB_KEY;

  return (
    <Shell title="ROUTE" back="/search/result">
      {/* useSearchParams 를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 필요합니다 */}
      <Suspense fallback={<div className="skeleton h-64" aria-busy="true" />}>
        <DetailView kakaoKey={kakaoKey} odsayWebKey={odsayWebKey} />
      </Suspense>
    </Shell>
  );
}
