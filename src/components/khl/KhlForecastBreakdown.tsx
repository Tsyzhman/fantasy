/** @spec spec://modules/khl/FEAT-002-khl-squad#cards
 * @spec spec://modules/khl/FEAT-003-khl-projections-and-optimizer#rolling-beta */
import { expectedStatKeys, formatKhlNumber as n, type KhlPlayer } from '@/khl/contracts';
import { expectedStatLabels, expectedTotals, forecastFixtures, goalCalculation, rateCalculation } from '@/khl/forecast-explanation';

export function KhlForecastBreakdown({ player, period }: { player: KhlPlayer; period: string }) {
  const e = player.forecastExplanation, d = e?.details;
  if (!e) return <p>Ожидаемые показатели: прогноз ещё не готов.</p>;
  if (!d) return <p>Подробный расчёт ожидаемых показателей появится после обновления прогноза.</p>;
  const total = expectedTotals(player), fixtures = forecastFixtures(player);
  return <section aria-label="Формула EP" tabIndex={-1} className="space-y-4 border-t pt-4">
    <h3 className="text-lg font-bold">Ожидаемые показатели</h3>
    <p className="text-sm">{period} · {fixtures.length} матчей. Оценочная частота участия: {n(e.appearanceRate * 100)}%. Это частота выхода на лёд, не вероятность старта вратаря.</p>
    {d.mode !== 'events' && <p>Для {player.position === 'G' ? 'вратаря' : 'неполной событийной истории'} используется среднее официальных FP. Отдельный прогноз событий недоступен.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Показатель</th><th className="p-2">База за сыгранный матч</th><th className="p-2">За выбранный период</th></tr></thead><tbody>
      {expectedStatKeys.map(key => <tr key={key}><th className="p-2 font-medium" scope="row">{expectedStatLabels[key]}</th><td className="p-2" title={key === 'goals' ? goalCalculation(e) : rateCalculation(d.rates[key])}>{n(d.expected[key])}</td><td className="p-2" title={`Сумма ожиданий по всем матчам периода × частота участия ${n(e.appearanceRate * 100)}%. Поправка каждого соперника показана ниже.`}>{n(total[key])}</td></tr>)}
      <tr className="font-bold"><th className="p-2" scope="row">Ожидаемые очки</th><td className="p-2">{n(e.perGame)}</td><td className="p-2">{n(player.ep.value)}</td></tr>
    </tbody></table></div>
    <p className="text-sm">За период суммируются прогнозы отдельных матчей с поправкой соперника и участием. Дробные голы и передачи — среднее ожидание, не обещанный счёт. Отображение округлено до двух знаков; расчёт использует полную точность.</p>
    <div className="space-y-2" aria-label="Прогнозы по соперникам">{fixtures.map(f => <article key={f.id} className="rounded border p-3 text-sm">
      <h4 className="font-semibold">{new Date(f.startsAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} МСК · {f.opponent}</h4>
      <p>EP матча: {n(f.expectedPoints?.value)}{f.forecast && ` = ${n(f.forecast.perGame)} × ${n(e.appearanceRate * 100)}%`}</p>
      {f.forecast && <><p>{expectedStatKeys.map(k => `${expectedStatLabels[k]} ${n(f.forecast!.expected[k] === null ? null : f.forecast!.expected[k]! * e.appearanceRate)}`).join(' · ')}</p><p>Поправка атаки ×{n(f.forecast.adjustment.factor)}. {f.forecast.adjustment.reason}</p>{f.forecast.adjustment.probability !== null && <p>Сила по линии: {n(f.forecast.adjustment.probability * 100)}%. Поправка = 0,75 + 0,5 × сила. {f.forecast.adjustment.source && <a className="underline" href={f.forecast.adjustment.source} target="_blank" rel="noreferrer">Линия Фонбет</a>} · {f.forecast.adjustment.observedAt && new Date(f.forecast.adjustment.observedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК.</p>}</>}
    </article>)}</div>
    <details className="rounded border p-3"><summary className="min-h-11 cursor-pointer font-semibold">Из чего получился прогноз</summary><div className="space-y-3 text-sm">
      <p>Текущая выборка — последние 10 записей PLAYED/DNP: {e.currentGames} сыгранных матчей. Для каждого показателя учитываются только известные значения. Прошлый сезон {e.previousSeason ?? 'недоступен'}: {e.previousGames} сыгранных матчей; вес не более 20. Переключатель средних 5/10/20 в каталоге не меняет окно модели.</p>
      {expectedStatKeys.map(key => <div key={key}><h4 className="font-semibold">{expectedStatLabels[key]}: исходное среднее</h4><p>{rateCalculation(d.rates[key])}</p>{d.rates[key].previousSource && <p className="break-all">Архив: {d.rates[key].previousSource}</p>}</div>)}
      <p>{goalCalculation(e)}</p>
      <p>Участие: {rateCalculation(d.appearance)} Здесь число наблюдений включает PLAYED и DNP, а сумма — только PLAYED.</p>
      <p>Прочие FP — остаток официальных очков после вычитания 10 × G + 5 × A + 2 × плюс-минус − PIM на матчах с полной разбивкой. {rateCalculation(d.rates.otherPoints)}</p>
      <p>Официальные FP: {rateCalculation(d.rates.officialFp)}</p>
      <p>Базовые очки за сыгранный матч: {d.mode === 'events' ? `10 × ${n(d.expected.goals)} + 5 × ${n(d.expected.assists)} + 2 × (${n(d.expected.plusMinus)}) − ${n(d.expected.pimMinutes)} + ${n(d.rates.otherPoints.mean)} = ${n(e.perGame)}` : n(e.perGame)}.</p>
      <p>Поправка соперника меняет голы, передачи и броски. Штраф, плюс-минус и прочие FP сохраняют базовое ожидание. Бросок не даёт отдельного бонуса FP. TOI, PP, PK и время в атаке пока не входят в эту модель. Это beta с фиксированными весами, без подтверждённой точности на архиве; оценка голов не является ixG.</p>
    </div></details>
  </section>;
}
