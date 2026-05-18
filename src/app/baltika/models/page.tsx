import { ModelSettingsPage } from "@/components/model-settings-page";

type PageProps = {
  searchParams?: {
    error?: string;
    saved?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function BaltikaModelsPage({ searchParams }: PageProps) {
  return ModelSettingsPage({
    source: "WYSCOUT",
    modeName: "Baltika",
    title: "Fantasy model",
    description: "Baltika model settings for Wyscout Excel imports. Primary and alternative formulas are separate from Machete.",
    backHref: "/baltika/leagues",
    backLabel: "Back to Baltika leagues",
    searchParams
  });
}
