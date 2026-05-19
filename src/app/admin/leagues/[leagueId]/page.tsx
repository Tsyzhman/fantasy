import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    leagueId: string;
  }>;
};

export default async function AdminLeagueRedirect({ params }: PageProps) {
  const { leagueId } = await params;
  redirect(`/baltika/leagues/${leagueId}`);
}
