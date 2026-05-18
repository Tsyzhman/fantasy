type PositionPoints = {
  GK?: string;
  DEF?: string;
  MID?: string;
  FWD?: string;
};

export type ScoringFieldGuideItem = {
  action: string;
  meaning: string;
  formulaAliases: string[];
  normalizedKeys: string[];
  points: PositionPoints;
  note?: string;
};

export const scoringFieldGuide: ScoringFieldGuideItem[] = [
  {
    action: "Выход на поле",
    meaning: "В дефолтной модели это прогнозный бонус за выход в ближайшем туре: +1, если средние минуты больше 0.",
    formulaAliases: ["{Matches played}"],
    normalizedKeys: ["matches_played"],
    points: { GK: "+1", DEF: "+1", MID: "+1", FWD: "+1" }
  },
  {
    action: "60+ минут на поле",
    meaning: "В дефолтной модели это прогнозный бонус за 60+ минут: +1, если minutes_played / matches_played >= 60.",
    formulaAliases: ["{Minutes played}"],
    normalizedKeys: ["minutes_played"],
    points: { GK: "+1", DEF: "+1", MID: "+1", FWD: "+1" },
    note: "В кастомной формуле можно использовать {Minutes played} напрямую или перейти на per-90 поля."
  },
  {
    action: "Полный матч",
    meaning: "В дефолтной модели это прогнозный бонус за полный матч: +1, если средние минуты почти 90.",
    formulaAliases: ["{Minutes played}"],
    normalizedKeys: ["minutes_played"],
    points: { MID: "+1", FWD: "+1" },
    note: "В дефолтной модели применяется только для ПЗЩ и НАП."
  },
  {
    action: "Гол",
    meaning: "Забитые голы.",
    formulaAliases: ["{Goals}"],
    normalizedKeys: ["goals"],
    points: { GK: "+6", DEF: "+6", MID: "+5", FWD: "+4" }
  },
  {
    action: "Голевой пас",
    meaning: "Официальные ассисты.",
    formulaAliases: ["{Assists}"],
    normalizedKeys: ["assists"],
    points: { GK: "+3", DEF: "+3", MID: "+3", FWD: "+3" }
  },
  {
    action: "Фэнтези-ассист",
    meaning: "Фэнтези-ассисты из источника данных, если такая колонка есть в файле.",
    formulaAliases: ["{Fantasy assists}", "{Fantasy assist}"],
    normalizedKeys: ["fantasy_assists", "fantasy_assist"],
    points: { GK: "+3", DEF: "+3", MID: "+3", FWD: "+3" }
  },
  {
    action: "Сухой матч, если 60+ минут",
    meaning: "Clean sheets из источника данных.",
    formulaAliases: ["{Clean sheets}", "{Clean sheet}"],
    normalizedKeys: ["clean_sheets", "clean_sheet"],
    points: { GK: "+4", DEF: "+4", MID: "+1" }
  },
  {
    action: "Каждые 3 сейва",
    meaning: "Количество сейвов вратаря.",
    formulaAliases: ["{Saves}"],
    normalizedKeys: ["saves"],
    points: { GK: "+1" },
    note: "В дефолтной модели считается как ожидаемые сейвы за тур / 3."
  },
  {
    action: "Каждые 3 возврата владения",
    meaning: "Возвраты владения или recovery-метрика из источника.",
    formulaAliases: ["{Recoveries}", "{Possession recoveries}"],
    normalizedKeys: ["recoveries", "possession_recoveries"],
    points: { DEF: "+1", MID: "+1", FWD: "+1" },
    note: "В дефолтной модели считается как ожидаемые возвраты владения за тур / 3."
  },
  {
    action: "Сэйв пенальти",
    meaning: "Отбитые пенальти.",
    formulaAliases: ["{Penalties saved}", "{Penalty saves}"],
    normalizedKeys: ["penalties_saved", "penalty_saves"],
    points: { GK: "+5" }
  },
  {
    action: "Фол, приведший к пенальти",
    meaning: "Фолы игрока, после которых назначен пенальти.",
    formulaAliases: ["{Fouls leading to penalty}", "{Penalties conceded}"],
    normalizedKeys: ["fouls_leading_to_penalty", "penalties_conceded"],
    points: { GK: "-2", DEF: "-2", MID: "-2", FWD: "-2" }
  },
  {
    action: "Незабитый пенальти",
    meaning: "Нереализованные пенальти.",
    formulaAliases: ["{Missed penalties}", "{Penalties missed}"],
    normalizedKeys: ["missed_penalties", "penalties_missed"],
    points: { GK: "-2", DEF: "-2", MID: "-2", FWD: "-2" }
  },
  {
    action: "Автогол",
    meaning: "Автоголы.",
    formulaAliases: ["{Own goals}", "{Own goal}"],
    normalizedKeys: ["own_goals", "own_goal"],
    points: { GK: "-2", DEF: "-2", MID: "-2", FWD: "-2" }
  },
  {
    action: "Каждые 2 пропущенных гола",
    meaning: "Голы, пропущенные командой/игроком в источнике.",
    formulaAliases: ["{Goals conceded}", "{Conceded goals}"],
    normalizedKeys: ["goals_conceded", "conceded_goals"],
    points: { GK: "-1", DEF: "-1" },
    note: "В дефолтной модели считается как ожидаемые пропущенные голы за тур / 2."
  },
  {
    action: "Желтая карточка",
    meaning: "Желтые карточки.",
    formulaAliases: ["{Yellow cards}", "{Yellow card}"],
    normalizedKeys: ["yellow_cards", "yellow_card"],
    points: { GK: "-1", DEF: "-1", MID: "-1", FWD: "-1" }
  },
  {
    action: "Красная карточка",
    meaning: "Красные карточки.",
    formulaAliases: ["{Red cards}", "{Red card}"],
    normalizedKeys: ["red_cards", "red_card"],
    points: { GK: "-3", DEF: "-3", MID: "-3", FWD: "-3" }
  }
];

export function formatPositionPoints(points: PositionPoints, position: keyof PositionPoints) {
  return points[position] ?? "-";
}
