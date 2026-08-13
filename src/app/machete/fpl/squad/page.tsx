import FantasySquadPage, { type FantasySquadPageProps } from "../../fantasy-squad-page";

export const dynamic = "force-dynamic";

type PageProps = Omit<FantasySquadPageProps, "mode">;

export default function FplSquadPage({ searchParams }: PageProps) {
  return <FantasySquadPage searchParams={searchParams} mode="FPL" />;
}
