import { requireSession } from "@/lib/auth-guard";
import { Shell } from "@/components/app-chrome";
import ResultView from "./result-view";

export const dynamic = "force-dynamic";

export default async function SearchResultPage() {
  await requireSession();

  return (
    <Shell title="SEARCH" back="/search" tab="search">
      <ResultView />
    </Shell>
  );
}
