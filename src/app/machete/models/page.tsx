import { ModelSettingsPage } from "@/components/model-settings-page";
import { I18nText } from "@/components/i18n-text";

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
    title: <I18nText en="Fantasy model" ru="Fantasy-модель" />,
    description: (
      <I18nText
        en="Machete model settings for FotMob snapshots. Expected FP, Scoring FP and Alt FP can be tuned independently from Baltika."
        ru="Настройки модели Machete для снапшотов FotMob. Expected FP, Scoring FP и Alt FP можно настраивать отдельно от Балтики."
      />
    ),
    backHref: "/machete/leagues",
    backLabel: <I18nText en="Back to Machete leagues" ru="Назад к лигам Machete" />,
    searchParams
  });
}
