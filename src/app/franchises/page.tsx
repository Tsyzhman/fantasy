/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
import { requireCurrentUser } from "@/lib/auth";
import { FranchiseAnalytics } from "./ui";
export const dynamic = "force-dynamic";
export default async function FranchisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCurrentUser();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const v of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, v);
  return <FranchiseAnalytics initialQuery={query.toString()} />;
}
