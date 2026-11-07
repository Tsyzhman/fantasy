"use client";

/** @spec spec://modules/mixerr/FEAT-001-passing-networks#view */

import { useId, useState, type ChangeEvent } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import {
  MAX_PASSING_FILE_BYTES,
  MIN_LINK_PASSES,
  PassingFileError,
  readPassingNetworks,
  type PassingNetwork
} from "@/mixerr/passing-network";

const errors = {
  invalid: { en: "Choose a StatsBomb event JSON file with two starting lineups.", ru: "Выберите JSON событий StatsBomb с двумя стартовыми составами." },
  duplicates: { en: "This file repeats event IDs or sequence numbers.", ru: "В файле повторяются идентификаторы или номера событий." },
  incomplete: { en: "The event file must include the end of the match.", ru: "В файле событий должен быть зафиксирован конец матча." },
  tooLarge: { en: "Use a single-match file up to 5 MiB and 12,000 events.", ru: "Выберите файл одного матча объёмом до 5 МиБ и 12 000 событий." }
};

const cutoffReasons = {
  substitution: { en: "first substitution", ru: "первая замена" },
  dismissal: { en: "dismissal", ru: "удаление" },
  fullTime: { en: "full time", ru: "конец матча" }
};

/** @spec spec://modules/mixerr/FEAT-001-passing-networks#input */
export function PassingNetworks() {
  const inputId = useId();
  const [networks, setNetworks] = useState<PassingNetwork[] | null>(null);
  const [error, setError] = useState<keyof typeof errors | null>(null);
  const [reading, setReading] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    setError(null);
    setNetworks(null);
    if (file.size > MAX_PASSING_FILE_BYTES) {
      setError("tooLarge");
      return;
    }
    setReading(true);
    try {
      setNetworks(readPassingNetworks(JSON.parse(await file.text())));
    } catch (failure) {
      setError(failure instanceof PassingFileError ? failure.code : "invalid");
    } finally {
      setReading(false);
    }
  }

  const maxPasses = Math.max(MIN_LINK_PASSES, ...(networks ?? []).flatMap(({ links }) => links.map(({ count }) => count)));

  return (
    <>
      <section className="ui-card mt-4 p-4 sm:p-5">
        <h2 className="text-xl font-bold text-ink"><I18nText en="Passing networks" ru="Карты передач" /></h2>
        <p id={`${inputId}-help`} className="mt-2 max-w-2xl text-sm text-slate-600">
          <I18nText
            en="Choose the StatsBomb event JSON for one completed match. The maps use completed passes by each starting lineup up to its first substitution or dismissal. The file is processed in your browser."
            ru="Выберите JSON событий StatsBomb для одного завершённого матча. Для каждой команды карта берёт точные передачи игроков старта до её первой замены или удаления. Файл обрабатывается в браузере."
          />
        </p>
        <label htmlFor={inputId} className="mt-4 block text-sm font-semibold text-ink">
          <I18nText en="Match events file" ru="Файл событий матча" />
        </label>
        <input
          id={inputId}
          aria-describedby={`${inputId}-help`}
          type="file"
          accept=".json,application/json"
          disabled={reading}
          onChange={handleFile}
          className="mt-2 block min-h-11 w-full max-w-md rounded text-sm text-slate-600 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-field file:px-3 file:font-semibold file:text-ink"
        />
        {reading ? <p role="status" className="mt-2 text-sm text-slate-600"><I18nText en="Reading match events…" ru="Читаем события матча…" /></p> : null}
        {error ? <p role="alert" className="mt-2 text-sm font-medium text-[color:var(--danger)]"><I18nText {...errors[error]} /></p> : null}
        <a href="https://github.com/statsbomb/open-data" className="mt-3 inline-block text-sm text-ink underline underline-offset-2">
          <I18nText en="StatsBomb Open Data files" ru="Открытые файлы StatsBomb" />
        </a>
      </section>

      {networks ? (
        <section aria-labelledby={`${inputId}-results`} className="mx-auto mt-5 max-w-5xl">
          <h2 id={`${inputId}-results`} className="sr-only"><I18nText en="Starting lineup comparison" ru="Сравнение стартовых составов" /></h2>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {networks.map((network, index) => (
              <NetworkPitch key={network.teamId} network={network} teamColor={`var(--chart-${index + 1})`} maxPasses={maxPasses} />
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-600">
            <I18nText
              en={`An arrow shows ${MIN_LINK_PASSES} or more passes in one direction. Its width shows frequency. Player positions are averages of their pass and reception locations. Source format: StatsBomb.`}
              ru={`Стрелка показывает ${MIN_LINK_PASSES} и более передач в одном направлении. Толщина зависит от их количества. Позиция игрока — среднее по точкам его передач и приёмов. Формат источника — StatsBomb.`}
            />
          </p>
        </section>
      ) : null}
    </>
  );
}

const NODE_RADIUS = 3.1;

/** @spec spec://modules/mixerr/FEAT-001-passing-networks#aggregation */
function NetworkPitch({ network, teamColor, maxPasses }: { network: PassingNetwork; teamColor: string; maxPasses: number }) {
  const arrowId = useId();
  const language = useLanguage();
  const players = new Map(network.players.map((player) => [player.id, { ...player, x: player.y, y: 120 - player.x }]));
  const links = network.links.filter(({ count }) => count >= MIN_LINK_PASSES);
  const directions = new Set(links.map(({ from, to }) => `${from}:${to}`));
  return (
    <article className="ui-card min-w-0 p-3 sm:p-4">
      <h3 className="break-words text-center text-base font-bold text-ink">{network.teamName}</h3>
      <p className="mt-1 text-center text-sm tabular-nums text-slate-600">
        <I18nText en="Stable lineup" ru="Стабильный состав" /> 0:00–{network.cutoff} · <I18nText {...cutoffReasons[network.reason]} />
      </p>
      <p className="mt-1 text-center text-xs text-slate-500">
        <I18nText en={`${network.passes} completed passes used`} ru={`Учтено точных передач: ${network.passes}`} />
      </p>
      {network.passes > 0 ? (
        <>
          <svg viewBox="-4 -4 88 128" role="img" aria-label={localizedText(language, `${network.teamName} passing network`, `Карта передач: ${network.teamName}`)} className="mx-auto mt-3 block w-full max-w-[24rem]">
            <defs>
              <marker id={arrowId} viewBox="0 0 4 4" refX="4" refY="2" markerWidth="3.1" markerHeight="3.1" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0 0L4 2L0 4Z" fill="var(--text-muted)" />
              </marker>
            </defs>
            <g fill="none" stroke="var(--border-strong)" strokeWidth="0.28" aria-hidden="true">
              <rect width="80" height="120" rx="0.4" fill="var(--surface-2)" />
              <path d="M0 60H80 M18 0V18H62V0 M18 120V102H62V120 M30 0V6H50V0 M30 120V114H50V120 M32 18A10 10 0 0 0 48 18 M32 102A10 10 0 0 1 48 102" />
              <circle cx="40" cy="60" r="10" />
              <circle cx="40" cy="60" r="0.5" fill="var(--border-strong)" />
              <circle cx="40" cy="12" r="0.5" fill="var(--border-strong)" />
              <circle cx="40" cy="108" r="0.5" fill="var(--border-strong)" />
            </g>
            {links.map(({ from, to, count }) => {
              const sender = players.get(from);
              const recipient = players.get(to);
              if (!sender || !recipient) return null;
              const path = arrowPath(sender, recipient, directions.has(`${to}:${from}`));
              const strength = Math.sqrt(count / maxPasses);
              return (
                <path key={`${from}:${to}`} d={path} fill="none" stroke="var(--text-muted)" strokeWidth={0.35 + 1.1 * strength} opacity={0.55 + 0.4 * strength} markerEnd={`url(#${arrowId})`}>
                  <title>{sender.name} → {recipient.name} · {count}</title>
                </path>
              );
            })}
            {[...players.values()].map((player) => (
              <g key={player.id} transform={`translate(${player.x} ${player.y})`}>
                <title>{player.shirtNumber} · {player.name}</title>
                <circle r={NODE_RADIUS} fill={`color-mix(in srgb, ${teamColor} 74%, black)`} stroke="var(--surface-1)" strokeWidth="0.45" />
                <text x="0" y="0" dominantBaseline="central" textAnchor="middle" fontSize="3.2" fontWeight="700" fill="white">{player.shirtNumber}</text>
              </g>
            ))}
          </svg>
          <details className="border-t border-slate-200 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-ink"><I18nText en="Players on the map" ru="Игроки на карте" /></summary>
            <ul className="grid gap-x-3 gap-y-1 pb-2 text-xs text-slate-600 lg:grid-cols-2">
              {network.players.map((player) => <li key={player.id}><b className="text-ink">{player.shirtNumber}</b> {player.name}</li>)}
            </ul>
          </details>
        </>
      ) : (
        <p className="mt-4 p-4 text-center text-sm text-slate-600">
          <I18nText en="No completed passes with locations for this lineup interval." ru="На этом отрезке нет точных передач стартового состава с координатами." />
        </p>
      )}
    </article>
  );
}

function arrowPath(from: { x: number; y: number }, to: { x: number; y: number }, reciprocal: boolean) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const inset = NODE_RADIUS + 0.55;
  const ux = length ? dx / length : 1;
  const uy = length ? dy / length : 0;
  if (length < 2 * inset + 1.5) {
    // Curve around close nodes so their circles do not hide the link.
    const bend = inset + 4;
    return `M${from.x - uy * inset} ${from.y + ux * inset} Q${(from.x + to.x) / 2 - uy * bend} ${(from.y + to.y) / 2 + ux * bend} ${to.x - uy * inset} ${to.y + ux * inset}`;
  }
  const offset = reciprocal ? 0.9 : 0;
  return `M${from.x + ux * inset - uy * offset} ${from.y + uy * inset + ux * offset} L${to.x - ux * inset - uy * offset} ${to.y - uy * inset + ux * offset}`;
}
