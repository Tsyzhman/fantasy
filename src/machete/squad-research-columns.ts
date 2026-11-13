// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
export const squadResearchForecasts = [
  {
    id: "ridge", column: "researchRidge", label: "FIT",
    descriptionEn: "Ridge regression fitted separately by position on past Sports.ru results, using expected minutes, events and recent form.",
    descriptionRu: "Регрессия Ridge обучается по амплуа на прошлых очках Sports.ru и учитывает ожидаемые минуты, события и недавнюю форму."
  },
  {
    id: "blendForm", column: "researchBlendForm", label: "MIX",
    descriptionEn: "70% component forecast with smoothed xG/xA and 30% recency-weighted fantasy form.",
    descriptionRu: "70% компонентного прогноза со сглаженными xG/xA и 30% недавней формы с большим весом последних матчей."
  },
  {
    id: "shrunkXA", column: "researchShrunkXA", label: "GAS",
    descriptionEn: "55% team-allocated attack and 45% player xG/xA smoothed toward position rates. Assist expectation is scaled by 1.10.",
    descriptionRu: "55% атакующего прогноза из распределения по команде и 45% личных xG/xA со сглаживанием по амплуа. Ожидаемые ассисты умножаются на 1,10."
  },
  {
    id: "rules", column: "researchRules", label: "REF",
    descriptionEn: "Expected points by action. Saves, recoveries and goals conceded are scored at the actual scoring thresholds.",
    descriptionRu: "Ожидаемые очки по действиям. Сейвы, возвраты и пропущенные голы рассчитываются с учётом порогов начисления."
  },
  {
    id: "minuteHistory", column: "researchMinuteHistory", label: "TIK",
    descriptionEn: "Averages points across possible playing times, blending projected appearance probabilities with recent match history.",
    descriptionRu: "Среднее очков по сценариям игрового времени. Вероятности выхода и минут уточняются по недавним матчам."
  }
] as const;

export type SquadResearchModel = typeof squadResearchForecasts[number]["id"];
export type SquadResearchRound = Array<number | null>;
export type SquadResearchRounds = Array<SquadResearchRound | null>;

export const squadResearchColumnKeys = squadResearchForecasts.map(({ column }) => column);
const indexByColumn = new Map<string, number>(squadResearchColumnKeys.map((key, index) => [key, index]));

export function squadResearchColumnIndex(key: string) {
  return indexByColumn.get(key);
}
