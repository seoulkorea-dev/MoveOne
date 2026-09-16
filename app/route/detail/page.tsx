import { Suspense } from "react";
import { requireSession } from "@/lib/auth-guard";
import { Shell } from "@/components/app-chrome";
import DetailView from "./detail-view";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage() {
  await requireSession();

  // 브라우저로 내려보내도 되는 키만 넘깁니다. 도메인 등록으로 보호되는
  // 공개 키이고, 서버 전용 키(REST·ODsay 서버 키)는 여기 오지 않습니다.
  // 클라이언트 컴포넌트가 직접 process.env 를 읽지 않도록 여기서 읽습니다.
  //
  // NEXT_PUBLIC_ODSAY_WEB_KEY 는 더 이상 넘기지 않습니다. ODsay 노선도
  // 위젯을 걷어냈기 때문입니다 — 그 위젯은 ODsay 역 ID 가 있어야 그리는데
  // 서울시 공공 API 경로에는 그 ID 가 없어서 빈 화면이 됐습니다.
  // 지금은 모든 경로를 카카오 지도 한 곳에서 그립니다.
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
