import { redirect } from "next/navigation";

type PageProps = {
  params: {
    leagueId: string;
    teamId: string;
  };
};

export default function AdminTeamRedirect({ params }: PageProps) {
  redirect(`/baltika/leagues/${params.leagueId}/teams/${params.teamId}`);
}
