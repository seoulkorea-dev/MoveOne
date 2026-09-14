import { requireSession } from "@/lib/auth-guard";
import { Shell } from "@/components/app-chrome";
import SearchForm from "./search-form";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  await requireSession();

  return (
    <Shell title="SEARCH" back="/" tab="search">
      <SearchForm />
    </Shell>
  );
}
