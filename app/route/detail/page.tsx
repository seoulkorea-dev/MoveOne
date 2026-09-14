import { Suspense } from "react";
import { requireSession } from "@/lib/auth-guard";
import { Shell } from "@/components/app-chrome";
import DetailView from "./detail-view";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage() {
  await requireSession();

  // JavaScript 키만 브라우저로 내려보냅니다. REST 키는 서버 전용입니다.
  // 클라이언트 컴포넌트가 직접 process.env 를 읽지 않도록 여기서 읽어 넘깁니다.
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  return (
    <Shell title="ROUTE" back="/search/result">
      {/* useSearchParams 를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 필요합니다 */}
      <Suspense fallback={<div className="skeleton h-64" aria-busy="true" />}>
        <DetailView kakaoKey={kakaoKey} />
      </Suspense>
    </Shell>
  );
}
