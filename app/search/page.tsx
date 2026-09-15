import { Suspense } from "react";
import { requireSession } from "@/lib/auth-guard";
import { Shell } from "@/components/app-chrome";
import SearchForm from "./search-form";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  await requireSession();

  return (
    <Shell title="SEARCH" back="/" tab="search">
      {/* useSearchParams 를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 필요합니다 */}
      <Suspense fallback={<div className="skeleton h-64" aria-busy="true" />}>
        <SearchForm />
      </Suspense>
    </Shell>
  );
}
