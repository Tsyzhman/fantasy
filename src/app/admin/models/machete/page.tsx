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
        en="Administrator-only global formulas for Expected FP and Actual FP. Alt FP has a shared adapted baseline; each user can replace it only for their own account."
        ru="Глобальные формулы Expected FP и Actual FP доступны только администратору. У Alt FP есть общая адаптированная базовая методика; каждый пользователь может заменить её только для своей учётной записи."
      />
    ),
    backHref: "/admin",
    backLabel: <I18nText en="Back to administration" ru="Назад в администрирование" />,
    searchParams: await searchParams
  });
}
