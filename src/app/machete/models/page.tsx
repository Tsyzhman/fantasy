import { ModelSettingsPage } from "@/components/model-settings-page";

type PageProps = {
  searchParams?: {
    error?: string;
    saved?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function MacheteModelsPage({ searchParams }: PageProps) {
  return ModelSettingsPage({
    source: "MACHETE",
    modeName: "Machete",
    title: "Fantasy model",
    description: "Machete model settings for FotMob snapshots. It starts from the same default formula as Baltika but can diverge independently.",
    backHref: "/machete",
    backLabel: "Back to Machete",
    searchParams
  });
}
