/** @spec spec://modules/khl/FEAT-002-khl-squad#layout */
import { formatToi, formatKhlNumber, type KhlPlayer } from "@/khl/contracts";
import styles from "./KhlSquadPlanner.module.css";

export function KhlSquadCard({ player: p, keep, disabled, onKeep, onRemove, onMove, onDetails }: {
  disabled?: boolean;
  player: KhlPlayer; keep: boolean; onKeep: (keep: boolean) => void;
  onRemove: () => void; onMove: (delta: number) => void; onDetails: () => void;
}) {
  const lock = p.providerLock.value === null ? "Lock: неизвестно" : p.providerLock.value ? "Заблокирован" : "Свободен по снимку";
  return <article className={`squad-contact-card ${styles.card}`}>
    <div className={`squad-contact-card__portrait ${styles.portrait}`}>
      <div aria-hidden="true" className="squad-contact-card__photo squad-contact-card__photo--fallback">{p.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</div>
      <span className="squad-contact-card__club" title={p.clubName}>{p.clubName}</span>
      <span className="squad-contact-card__position">{p.position}</span>
      <span className="squad-contact-card__price">{formatKhlNumber(p.price.value)}</span>
    </div>
    <h3 className={`squad-contact-card__name ${styles.playerName}`} title={p.name}>{p.name}</h3>
    <p className={styles.mobileIdentity}>{p.clubName} · {p.position} · {formatKhlNumber(p.price.value)}</p>
    <dl className={`squad-contact-card__metrics ${styles.metrics}`}>
      {[["FP", formatKhlNumber(p.officialFp.value)], ["EP", formatKhlNumber(p.ep.value)], ["TOI", formatToi(p.toiSeconds.value)]].map(([label, value]) => <div key={label}><dt className="squad-contact-card__metric-label">{label}</dt><dd className="squad-contact-card__metric-value">{value}</dd></div>)}
    </dl>
    <p className={styles.fixture}>{p.fixtures[0] ? `${p.fixtures[0].opponent} · ${new Date(p.fixtures[0].startsAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" })}` : "Матчи: —"}</p>
    <p className={styles.lock}>{lock}</p>
    <details className={styles.cardDetails}>
      <summary>Подробнее</summary>
      <div>
        <p>Травмы: {p.injury.value ?? "неизвестно"}</p>
        <p>PP {formatToi(p.ppToiSeconds.value)} · PK {formatToi(p.pkToiSeconds.value)} · Атака {formatToi(p.attackZoneSeconds?.value ?? null)}</p>
        <p>Изменение цены: {formatKhlNumber(p.priceDelta)}</p>
        <p>Снимок lock: {p.providerLock.asOf ? new Date(p.providerLock.asOf).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "неизвестно"}</p>
        {p.position === "G" && <p>Старт по матчам: {p.fixtures.length ? p.fixtures.map(f => `${f.opponent}: ${formatKhlNumber(f.startProbability.value)}`).join("; ") : "нет данных"}</p>}
        <button onClick={onDetails}>Карточка и история</button>
        <div className={styles.move}><button disabled={disabled} aria-label={`Переместить ${p.name} выше`} onClick={() => onMove(-1)}>↑</button><button disabled={disabled} aria-label={`Переместить ${p.name} ниже`} onClick={() => onMove(1)}>↓</button></div>
      </div>
    </details>
    <div className={`squad-contact-card__actions ${styles.actions}`}>
      <label title="Сохранить в подборе"><input type="checkbox" disabled={disabled} checked={keep} onChange={e => onKeep(e.target.checked)}/><span className="sr-only">Сохранить в подборе</span><span aria-hidden="true">Закрепить</span></label>
      <button disabled={disabled} className="squad-contact-card__remove" onClick={onRemove} aria-label={`Убрать ${p.name}`} title="Убрать">×</button>
    </div>
  </article>;
}
