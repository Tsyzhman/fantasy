import { redirect } from "next/navigation";

type PageProps = {
  params: {
    leagueId: string;
  };
};

export default function AdminLeagueRedirect({ params }: PageProps) {
  redirect(`/baltika/leagues/${params.leagueId}`);
}
