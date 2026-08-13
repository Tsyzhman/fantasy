import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

const statusStyles: Record<string, string> = {
  NOT_CONFIGURED: "bg-slate-100 text-slate-700 ring-slate-200",
  READY: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  SYNCING: "bg-blue-50 text-blue-700 ring-blue-200",
  SYNCED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  XI_COMPLETE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  XI_PARTIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  XI_NONE: "bg-rose-50 text-rose-700 ring-rose-200",
  XI_EMPTY: "bg-rose-50 text-rose-700 ring-rose-200",
  XI_OVERSIZED: "bg-rose-50 text-rose-700 ring-rose-200",
  FORECAST_FULL: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FORECAST_PARTIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  FORECAST_NONE: "bg-orange-50 text-orange-800 ring-orange-200",
  NEEDS_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  ERROR: "bg-rose-50 text-rose-700 ring-rose-200",
  PENDING: "bg-slate-100 text-slate-700 ring-slate-200",
  RUNNING: "bg-blue-50 text-blue-700 ring-blue-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 ring-emerald-200"
};

export function MacheteStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyles[status] ?? statusStyles.NOT_CONFIGURED,
        className
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, { en: string; ru: string }> = {
    NOT_CONFIGURED: { en: "Not configured", ru: "Не настроено" },
    READY: { en: "Ready", ru: "Готово" },
    SYNCING: { en: "Syncing", ru: "Синхронизация" },
    SYNCED: { en: "Synced", ru: "Синхр." },
    XI_COMPLETE: { en: "Full XI", ru: "Полный XI" },
    XI_PARTIAL: { en: "Partial XI", ru: "Неполный XI" },
    XI_NONE: { en: "No XI flags", ru: "Нет флагов XI" },
    XI_EMPTY: { en: "No roster", ru: "Нет состава" },
    XI_OVERSIZED: { en: "Oversized XI", ru: "XI больше 11" },
    FORECAST_FULL: { en: "Forecasts ready", ru: "Прогнозы есть" },
    FORECAST_PARTIAL: { en: "Partial forecasts", ru: "Прогнозы частично" },
    FORECAST_NONE: { en: "No forecasts", ru: "Нет прогнозов" },
    NEEDS_REVIEW: { en: "Needs review", ru: "Нужна проверка" },
    ERROR: { en: "Error", ru: "Ошибка" },
    PENDING: { en: "Pending", ru: "В очереди" },
    RUNNING: { en: "Running", ru: "Выполняется" },
    SUCCEEDED: { en: "Succeeded", ru: "Успешно" }
  };
  const label = labels[status] ?? { en: status.replace(/_/g, " "), ru: status.replace(/_/g, " ") };
  return <I18nText en={label.en} ru={label.ru} />;
}
