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
        en="Administrator-only global formulas for Expected FP and Actual FP. Each user manages only their own Alt FP formula."
        ru="Глобальные формулы Expected FP и Actual FP доступны только администратору. Каждый пользователь настраивает только собственную формулу Alt FP."
      />
    ),
    backHref: "/admin",
    backLabel: <I18nText en="Back to administration" ru="Назад в администрирование" />,
    searchParams: await searchParams
  });
}
