/** @spec spec://modules/khl/FEAT-002-khl-squad#table */
import {expectedTooltip} from './forecast-explanation';
import {formatKhlNumber,formatToi,type KhlPlayer,type Observation} from './contracts';
export const khlStatHelp = {
  player: 'Игрок из каталога Sports. Статистика КХЛ привязана к тому же хоккеисту по подтверждённой идентичности.',
  club: 'Текущий клуб и позиция в fantasy Sports: G — вратарь, D — защитник, F — нападающий. Прошлая статистика сохраняется и после перехода.',
  selection: 'Добавить игрока в локальный состав или убрать из него. Все 17 мест активны: 2 вратаря, 6 защитников, 9 нападающих.',
  compare: 'Выберите от 2 до 4 игроков для сравнения показателей в выбранном периоде.',
  price: 'Цена Sports в сотых долях fantasy-балла: 924 единицы = 9,24. Для бюджета 20000 единиц = 200 баллов. Это не деньги.',
  toiSeconds: 'TOI — время на льду. В сезонных режимах это точная сумма сыгранных матчей; в последних матчах — среднее известных наблюдений. Формат минуты:секунды.',
  ppToiSeconds: 'PP — время на льду в большинстве. Сумма протоколов сезона или среднее известных наблюдений выбранного окна. Не число голов в большинстве.',
  pkToiSeconds: 'PK — время на льду в меньшинстве. Сумма протоколов сезона или среднее известных наблюдений выбранного окна.',
  attackZoneSeconds: 'Атака — индивидуальное время в атаке (ВВА) из протоколов КХЛ. Не владение команды и не весь TOI. Сплошные нули телеметрии считаются отсутствием данных.',
  officialFp: 'FP — сумма официальных очков Sports, делённая на число последних матчей с оценкой в выбранном окне. Если хотя бы одна оценка окна неизвестна, среднее не публикуется. Переключение на прошлый сезон меняет статистику, но не текущие FP.',
  ep: 'EP — ожидаемые очки будущих матчей. Бета: (10 × ожидаемые голы + 5 × передачи + 2 × плюс-минус − штрафные минуты + прочие FP) × частота участия отдельно для каждого матча; EP периода — сумма матчей с поправками соперников. Для вратаря — средние официальные FP × участие × игры. Прошлый сезон имеет вес до 20 матчей; голы оцениваются поровну по темпу голов и броскам × реализации. Это оценка, не готовый xG.',
  ixg: 'ixG — индивидуальные ожидаемые голы из подтверждённой модели качества бросков. Среднее последних известных матчей в выбранном окне, только при едином источнике и версии модели. Прочерк означает отсутствие данных, а не ноль. Броски и их реализация не подменяют готовый ixG.',
  shotsOnGoal: 'Броски в створ (SOG). Сумма или среднее по известным сыгранным матчам. Броски и реализация участвуют в оценке голов для EP, отдельного бонуса FP за бросок нет.',
  goals: 'Голы игрока. Сумма или среднее выбранного периода. В формуле Sports один гол даёт 10 FP; в EP используется ожидаемый темп голов.',
  assists: 'Голевые передачи. Сумма или среднее выбранного периода. Одна передача даёт 5 FP.',
  pimMinutes: 'Штрафные минуты, а не количество удалений: двухминутный штраф даёт 2 минуты. В формуле вычитается 1 FP за каждую штрафную минуту.',
  plusMinus: 'Плюс-минус из официального протокола. В формуле 2 FP за единицу показателя; отрицательное значение уменьшает результат.',
  blockedShots: 'Броски соперника, заблокированные игроком. Известные значения суммируются; прочерк не заменяется нулём.',
  saves: 'Сэйвы вратаря — отражённые броски. Сумма или среднее выбранного периода; данные полевого игрока здесь неприменимы.',
  goalsAgainst: 'Шайбы, пропущенные вратарём. Сумма или среднее выбранного периода. Это показатель вратаря, а не общий счёт команды.',
} as const;
export type KhlHelpKey = keyof typeof khlStatHelp;
export function khlCellHelp(player:KhlPlayer,key:KhlHelpKey,period:string) {
  const header=`${player.name} · ${period}\n${khlStatHelp[key]}`;
  if(key==='player')return header;
  if(key==='club')return `${header}\n${player.clubName} / ${player.position}`;
  if(key==='selection'||key==='compare')return header;
  const value=(player as unknown as Partial<Record<KhlHelpKey,Observation<number>>>)[key];
  const text=value?.value==null?'Нет данных':key.endsWith('Seconds')?formatToi(value.value):formatKhlNumber(value.value);
  const lines=[header,`Значение: ${text}`,value?.totalGames!=null?`Известно в ${value.knownGames??0} из ${value.totalGames} матчей. Пропуски не считаются нулями.`:'',value?.source?`Источник: ${value.source}`:'',value?.asOf?`Обновлено: ${value.asOf}`:'',value?.reason??''];
  if(key==='ep'&&player.forecastExplanation){const e=player.forecastExplanation;lines.push(`За сыгранный матч: ${formatKhlNumber(e.perGame)} FP; участие ${formatKhlNumber(e.appearanceRate*100)}%; текущих матчей ${e.currentGames}, прошлых ${e.previousGames}, вес прошлого ${e.priorWeight}.`,Object.entries(e.components).map(([k,v])=>`${({goals:'Голы, FP',assists:'Передачи, FP',plusMinus:'Плюс-минус, FP',penalty:'Штраф, FP',other:'Прочие FP',officialFp:'Средние FP',shotsPerGame:'Броски/матч',shotConversion:'Реализация (доля)',previousShotGames:'Матчей прошлого сезона с бросками'} as Record<string,string>)[k]??k}: ${formatKhlNumber(v)}`).join('; '));}
  if(key==='ep')lines.push(expectedTooltip(player));
  return lines.filter(Boolean).join('\n');
}
