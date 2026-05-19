import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    leagueId: string;
    teamId: string;
  }>;
};

export default async function AdminTeamRedirect({ params }: PageProps) {
  const { leagueId, teamId } = await params;
  redirect(`/baltika/leagues/${leagueId}/teams/${teamId}`);
}
