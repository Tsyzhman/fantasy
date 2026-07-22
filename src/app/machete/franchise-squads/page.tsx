import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<{ leagueId?: string; franchise?: string }>;
};

export default async function LegacyFranchiseSquadsPage({ searchParams }: PageProps) {
  const source = (await searchParams) ?? {};
  const params = new URLSearchParams();
  if (source.leagueId) params.set("leagueId", source.leagueId);
  if (source.franchise) params.set("franchise", source.franchise);
  const query = params.toString();
  redirect(`/machete/squad${query ? `?${query}` : ""}#franchise-squads`);
}
