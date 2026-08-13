import FantasySquadPage, { type FantasySquadPageProps } from "../fantasy-squad-page";
import { FPL_PROVIDER } from "@/lib/providers/fpl";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = Omit<FantasySquadPageProps, "mode">;

export default async function MacheteSquadPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (params.provider?.trim().toUpperCase() === FPL_PROVIDER) {
    const query = new URLSearchParams();
    for (const key of ["squadId", "historyScope", "historyWindow", "franchise"]) {
      const value = params[key as keyof typeof params];
      if (typeof value === "string" && value) query.set(key, value);
    }
    const historySeasons = Array.isArray(params.historySeason) ? params.historySeason : params.historySeason ? [params.historySeason] : [];
    for (const season of historySeasons) query.append("historySeason", season);
    const suffix = query.toString();
    redirect(`/machete/fpl/squad${suffix ? `?${suffix}` : ""}`);
  }
  return <FantasySquadPage searchParams={Promise.resolve(params)} mode="SPORTS_RU" />;
}
