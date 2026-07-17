import { I18nText } from "@/components/i18n-text";
import { ModelSettingsPage } from "@/components/model-settings-page";

type PageProps = {
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

export const dynamic = "force-dynamic";

export default async function AdminMacheteModelsPage({ searchParams }: PageProps) {
  return ModelSettingsPage({
    source: "MACHETE",
    modeName: "Machete admin defaults",
    title: <I18nText en="Global Machete fantasy model" ru="Глобальная фэнтези-модель Machete" />,
    description: (
      <I18nText
        en="Administrator defaults for Expected FP, Actual FP and Alt FP. Users may override only Actual FP and Alt FP for their own read-time views."
        ru="Глобальные настройки Expected FP, Actual FP и Alt FP. Пользователи могут переопределять только Actual FP и Alt FP при просмотре данных своей учётной записью."
      />
    ),
    backHref: "/admin",
    backLabel: <I18nText en="Back to administration" ru="Назад в администрирование" />,
    searchParams: await searchParams
  });
}
