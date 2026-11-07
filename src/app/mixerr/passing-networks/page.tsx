/** @spec spec://modules/mixerr/FEAT-001-passing-networks#view */

import { I18nText } from "@/components/i18n-text";
import { PassingNetworks } from "@/components/mixerr/PassingNetworks";
import { SectionCrumb } from "@/components/section-crumb";

export default function PassingNetworksPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
      <SectionCrumb items={[
        { label: <I18nText en="MiXerr" ru="Миксер" />, href: "/mixerr" },
        { label: <I18nText en="Passing networks" ru="Карты передач" /> }
      ]} />
      <PassingNetworks />
    </main>
  );
}
