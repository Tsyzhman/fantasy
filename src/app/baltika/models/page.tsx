import { I18nText } from "@/components/i18n-text";
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
    modeName: <I18nText en="Baltika" ru="Балтика" />,
    title: <I18nText en="Fantasy model" ru="Fantasy-модель" />,
    description: (
      <I18nText
        en="Baltika model settings for Wyscout Excel imports. Primary and alternative formulas are separate from Machete."
        ru="Настройки модели Балтики для импортов Wyscout Excel. Основная и альтернативная формулы отделены от Machete."
      />
    ),
    backHref: "/baltika/leagues",
    backLabel: <I18nText en="Back to Baltika leagues" ru="Назад к лигам Балтики" />,
    searchParams
  });
}
