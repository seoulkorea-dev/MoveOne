import { Suspense } from "react";
import { requireSession } from "@/lib/auth-guard";
import { Shell } from "@/components/app-chrome";
import DetailView from "./detail-view";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage() {
  await requireSession();

  return (
    <Shell title="ROUTE" back="/search/result">
      {/* useSearchParams 를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 필요합니다 */}
      <Suspense fallback={<div className="skeleton h-64" aria-busy="true" />}>
        <DetailView />
      </Suspense>
    </Shell>
  );
}
