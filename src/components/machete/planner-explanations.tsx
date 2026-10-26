"use client";


/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { localizedText, useLanguage } from "@/components/localized-option";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { nextAlternativeFantasyPoints, nextFantasyPoints, playerAlternativeHorizonPoints, type FantasyPlannerPlayer, type FantasyProjectionFixtureInputs } from "@/machete/squad_logic";

export type UiLanguage = ReturnType<typeof useLanguage>;

export function fantasyForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage) {
  const lines = [
    player.name,
    localizedText(language, `Next-round forecast: ${formatScore(nextFantasyPoints(player))} FP`, `Прогноз на следующий тур: ${formatScore(nextFantasyPoints(player))} FP`)
  ];
  if (player.expectedMinutes !== null && player.expectedMinutes !== undefined) {
    lines.push(localizedText(language, `Expected minutes: ${Math.round(player.expectedMinutes)}`, `Ожидаемые минуты: ${Math.round(player.expectedMinutes)}`));
  }
  if (player.startProbability !== null && player.startProbability !== undefined) {
    lines.push(localizedText(language, `Historical start rate: ${Math.round(player.startProbability * 100)}%`, `Историческая доля стартов: ${Math.round(player.startProbability * 100)}%`));
  }
  if (player.forecastConfidence !== null && player.forecastConfidence !== undefined) {
    lines.push(localizedText(language, `Confidence heuristic: ${Math.round(player.forecastConfidence * 100)}%`, `Эвристика уверенности: ${Math.round(player.forecastConfidence * 100)}%`));
  }
  if (player.forecastFactors?.length) {
    lines.push(localizedText(language, "Positive factors:", "Положительные факторы:"), ...player.forecastFactors.map((factor) => `+ ${localizeForecastNote(factor, language)}`));
  }
  if (player.forecastRisks?.length) {
    lines.push(localizedText(language, "Risks:", "Риски:"), ...player.forecastRisks.map((risk) => `- ${localizeForecastNote(risk, language)}`));
  }
  if (player.forecastModelVersion) lines.push(localizedText(language, `Model: ${player.forecastModelVersion}`, `Модель: ${player.forecastModelVersion}`));
  if (player.forecastCalculatedAt) lines.push(localizedText(language, `Calculated: ${formatDate(player.forecastCalculatedAt)}`, `Расчёт: ${formatDate(player.forecastCalculatedAt)}`));
  if (player.forecastDataUpdatedAt) lines.push(localizedText(language, `Data updated: ${formatDate(player.forecastDataUpdatedAt)}`, `Данные обновлены: ${formatDate(player.forecastDataUpdatedAt)}`));
  return lines.join("\n");
}

export function averageForecastValue(baseForecast: number | null, alternativeForecast: number | null) {
  if (baseForecast === null || alternativeForecast === null) return null;
  if (!Number.isFinite(baseForecast) || !Number.isFinite(alternativeForecast)) return null;
  return Math.round(((baseForecast + alternativeForecast) / 2) * 100) / 100;
}

export function addProjectionTermLine(
  lines: string[],
  language: UiLanguage,
  label: string,
  value: number | null | undefined,
  formula?: string
) {
  if (value === null || value === undefined || Number.isNaN(value)) return;
  const valueText = formatNumber(value, 4);
  const localizedLabel = projectionBreakdownText(label, language);
  const localizedFormula = formula ? projectionBreakdownText(formula, language) : null;
  if (!formula) {
    lines.push(localizedText(language, `- ${localizedLabel}: ${valueText} FP`, `- ${localizedLabel}: ${valueText} ФО`));
    return;
  }
  lines.push(localizedText(language, `- ${localizedLabel}: ${localizedFormula} = ${valueText} FP`, `- ${localizedLabel}: ${localizedFormula} = ${valueText} ФО`));
}

export function projectionBreakdownText(value: string, language: UiLanguage) {
  if (language !== "ru") return value;
  const exact: Record<string, string> = {
    "Appearance FP": "ФО за выход",
    "60+ minutes FP": "ФО за 60+ минут",
    "Full match FP": "ФО за полный матч",
    "Goal FP": "ФО за голы",
    "Assist FP": "ФО за ассисты",
    "Clean sheet FP": "ФО за сухой матч",
    "Save FP": "ФО за сейвы",
    "Recovery FP": "ФО за возвраты",
    "Penalty save FP": "ФО за отражённые пенальти",
    "Penalty miss FP": "ФО за незабитые пенальти",
    "Own goal FP": "ФО за автоголы",
    "Bonus FP": "Бонусные ФО",
    "Defensive contribution FP": "ФО за защитные действия",
    "Goals conceded FP": "ФО за пропущенные голы",
    "Yellow card FP": "ФО за жёлтые карточки",
    "Red card FP": "ФО за красные карточки",
    "Total": "Итого",
    "Alternative total": "Итого Альт",
    "not awarded for this position": "не начисляется для этой позиции",
    "not applicable for this position": "не применяется для этой позиции",
    "negative Poisson groups of 2 from expected goals conceded": "отрицательные пуассоновские группы по 2 из ожидаемых пропущенных голов",
    "not available": "нет данных"
  };
  if (exact[value]) return exact[value];
  return value
    .replaceAll("Expected clean sheets", "Ожидаемые сухие матчи")
    .replaceAll("Expected recoveries", "Ожидаемые возвраты")
    .replaceAll("Expected yellow cards", "Ожидаемые жёлтые карточки")
    .replaceAll("Expected red cards", "Ожидаемые красные карточки")
    .replaceAll("Expected assists", "Ожидаемые ассисты")
    .replaceAll("Expected goals", "Ожидаемые голы")
    .replaceAll("Expected saves", "Ожидаемые сейвы")
    .replaceAll("when unavailable", "если данных нет")
    .replaceAll("from", "из");
}

export function formatProjectionMetric(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return formatNumber(value, digits);
}

export function minuteHistoryProvenanceLines(
  inputs: FantasyProjectionFixtureInputs | null | undefined,
  language: UiLanguage
) {
  if (!inputs) return [];
  const currentMatches = inputs.currentClubHistoryMatches ?? 0;
  const previousMatches = inputs.previousClubHistoryMatches ?? 0;
  if (previousMatches <= 0) {
    return currentMatches > 0
      ? [localizedText(
          language,
          `Minutes history: ${formatNumber(currentMatches, 0)} current-club matches; no transfer fallback was used.`,
          `История минут: ${formatNumber(currentMatches, 0)} матчей за текущий клуб; резервная выборка трансфера не использовалась.`
        )]
      : [];
  }
  const previousTeam = inputs.previousClubHistoryTeam || localizedText(language, "previous club", "предыдущий клуб");
  const factor = inputs.previousClubPenaltyFactor ?? 0.9;
  const lines = [localizedText(
    language,
    `Transfer fallback: ${formatNumber(currentMatches, 0)} current-club matches + ${formatNumber(previousMatches, 0)} matches for ${previousTeam}. Previous-club minutes and forecast event volumes are weighted by ${formatNumber(factor, 2)} until five current-club matches are available.`,
    `Резервная выборка трансфера: ${formatNumber(currentMatches, 0)} матчей за текущий клуб + ${formatNumber(previousMatches, 0)} матчей за ${previousTeam}. Минуты и объёмы прогнозных событий прошлого клуба учитываются с коэффициентом ${formatNumber(factor, 2)}, пока не накопится пять матчей за текущий клуб.`
  )];
  if (inputs.transferRatePenalty !== null && inputs.transferRatePenalty !== undefined && inputs.transferRatePenalty < 0.999) {
    lines.push(localizedText(
      language,
      `Effective per-90 transfer penalty: raw forecast rates × ${formatNumber(inputs.transferRatePenalty, 3)}. Unlike the old calculation, this factor no longer cancels between event totals and minutes.`,
      `Итоговый трансферный штраф per 90: исходные прогнозные темпы × ${formatNumber(inputs.transferRatePenalty, 3)}. В отличие от старого расчёта, коэффициент больше не сокращается между объёмом событий и минутами.`
    ));
  }
  return lines;
}

export function sparseTeamAttackAllocationLines(
  inputs: FantasyProjectionFixtureInputs | null | undefined,
  language: UiLanguage
) {
  if (!inputs?.sparseTeamAttackAllocationGuard) return [];
  const meaningfulPlayers = inputs.teamAttackMeaningfulPlayers ?? 0;
  const candidates = inputs.teamAttackAllocationCandidates ?? 0;
  const eventMinutes = inputs.teamAttackEventExposureMinutes ?? 0;
  const coverage = (inputs.teamAttackMinuteCoverage ?? 0) * 100;
  const goalReserve = inputs.teamAttackGoalReserveWeight ?? 0;
  const assistReserve = inputs.teamAttackAssistReserveWeight ?? 0;
  return [localizedText(
    language,
    `Sparse team-history guard: only ${formatNumber(meaningfulPlayers, 0)} of ${formatNumber(candidates, 0)} candidates have at least 15 event minutes; known roster exposure is ${formatNumber(eventMinutes, 1)} of 990 minutes (${formatNumber(coverage, 1)}%). Unmodelled teammates reserve goal-allocation weight ${formatNumber(goalReserve, 3)} and assist-allocation weight ${formatNumber(assistReserve, 3)}, so this player receives only the evidenced share of team xG/xA instead of inheriting the missing players' share.`,
    `Защита от неполной истории команды: только ${formatNumber(meaningfulPlayers, 0)} из ${formatNumber(candidates, 0)} кандидатов имеют хотя бы 15 минут экспозиции событий; известная экспозиция состава — ${formatNumber(eventMinutes, 1)} из 990 минут (${formatNumber(coverage, 1)}%). Неописанные игроки резервируют вес распределения голов ${formatNumber(goalReserve, 3)} и ассистов ${formatNumber(assistReserve, 3)}, поэтому футболист получает только подтверждённую долю командных xG/xA, а не долю отсутствующих в истории партнёров.`
  )];
}

export function starterMinuteFloorLines(
  inputs: FantasyProjectionFixtureInputs | null | undefined,
  language: UiLanguage
) {
  if (
    !inputs?.rosterStarter ||
    inputs.baseExpectedMinutes === null ||
    inputs.baseExpectedMinutes === undefined ||
    inputs.expectedMinutes === null ||
    inputs.expectedMinutes === undefined
  ) return [];
  const adjustment = inputs.rosterStarterMinutesUplift ?? inputs.expectedMinutes - inputs.baseExpectedMinutes;
  const minuteFloor = inputs.rosterStarterMinuteFloor ?? 60;
  const finalReliability = inputs.per90UpliftReliability ?? 0;
  const sampleReliability = inputs.per90SampleReliability ?? finalReliability;
  const roleReliability = inputs.starterRoleReliability ?? finalReliability;
  const historicalStartProbability = inputs.historicalStartProbability ?? 0;
  const baseMinuteReliability = inputs.starterBaseMinuteReliability ?? (
    minuteFloor > 0 ? Math.min(1, Math.max(0, inputs.baseExpectedMinutes / minuteFloor)) : 1
  );
  const lines = [localizedText(
    language,
    `Nearest-fixture starter floor: max(base ${formatNumber(inputs.baseExpectedMinutes, 1)}, ${formatNumber(minuteFloor, 0)}) = ${formatNumber(inputs.expectedMinutes, 1)} expected minutes; adjustment ${adjustment >= 0 ? "+" : ""}${formatNumber(adjustment, 1)}. Goalkeepers marked as starters use 90 minutes; outfield starters use at least 60. It is not applied to later fixtures.`,
    `Минимум основы только на ближайший матч: max(базовые ${formatNumber(inputs.baseExpectedMinutes, 1)}, ${formatNumber(minuteFloor, 0)}) = ${formatNumber(inputs.expectedMinutes, 1)} ожидаемых минут; корректировка ${adjustment >= 0 ? "+" : ""}${formatNumber(adjustment, 1)}. У отмеченного вратаря используются 90 минут, у полевого — минимум 60. На последующие матчи правило не переносится.`
  )];
  if (
    inputs.eventExposureMinutes !== null &&
    inputs.eventExposureMinutes !== undefined &&
    inputs.eventExposureMinutes < inputs.expectedMinutes - 0.01
  ) {
    lines.push(localizedText(
      language,
      `Cautious per-90 exposure: base ${formatNumber(inputs.baseExpectedMinutes, 1)} + starter uplift ${formatNumber(adjustment, 1)} × final reliability min(sample ${formatNumber(sampleReliability * 100, 1)}% from ${formatNumber(inputs.per90SampleMinutes ?? 0, 0)} historical minutes; role ${formatNumber(roleReliability * 100, 1)}% from max(historical starts ${formatNumber(historicalStartProbability * 100, 1)}%, base/floor ${formatNumber(baseMinuteReliability * 100, 1)}%)) = ${formatNumber(finalReliability * 100, 1)}% = ${formatNumber(inputs.eventExposureMinutes, 1)} event minutes. Appearance and 60-minute points still use ${formatNumber(inputs.expectedMinutes, 1)} minutes; xG/xA, recoveries, saves and cards use the cautious exposure.`,
      `Осторожная экспозиция per 90: базовые ${formatNumber(inputs.baseExpectedMinutes, 1)} + прибавка старта ${formatNumber(adjustment, 1)} × итоговая надёжность min(выборка ${formatNumber(sampleReliability * 100, 1)}% по ${formatNumber(inputs.per90SampleMinutes ?? 0, 0)} минутам истории; роль ${formatNumber(roleReliability * 100, 1)}% из max(исторические старты ${formatNumber(historicalStartProbability * 100, 1)}%, базовые минуты/минимум ${formatNumber(baseMinuteReliability * 100, 1)}%)) = ${formatNumber(finalReliability * 100, 1)}% = ${formatNumber(inputs.eventExposureMinutes, 1)} минуты событий. Очки за выход и 60 минут по-прежнему используют ${formatNumber(inputs.expectedMinutes, 1)} минуты; xG/xA, возвраты, сейвы и карточки используют осторожную экспозицию.`
    ));
    if (
      inputs.preRoleXgRatePer90 != null && inputs.roleAdjustedXgRatePer90 != null && inputs.positionXgPriorPer90 != null &&
      inputs.preRoleXaRatePer90 != null && inputs.roleAdjustedXaRatePer90 != null && inputs.positionXaPriorPer90 != null
    ) {
      lines.push(localizedText(
        language,
        `Starter-role rate blend (${formatNumber(roleReliability * 100, 1)}% historical-role reliability): xG/90 ${formatNumber(inputs.preRoleXgRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXgRatePer90, 3)} toward the ${formatNumber(inputs.positionXgPriorPer90, 3)} position prior; xA/90 ${formatNumber(inputs.preRoleXaRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXaRatePer90, 3)} toward ${formatNumber(inputs.positionXaPriorPer90, 3)}. This prevents substitute per-90 production from being copied unchanged into a new starter role.`,
        `Смешивание темпа при смене роли (${formatNumber(roleReliability * 100, 1)}% надёжности исторической роли): xG/90 ${formatNumber(inputs.preRoleXgRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXgRatePer90, 3)} к позиционному prior ${formatNumber(inputs.positionXgPriorPer90, 3)}; xA/90 ${formatNumber(inputs.preRoleXaRatePer90, 3)} → ${formatNumber(inputs.roleAdjustedXaRatePer90, 3)} к ${formatNumber(inputs.positionXaPriorPer90, 3)}. Так темп запасного per 90 не переносится без изменений в новую роль стартера.`
      ));
    }
  }
  return lines;
}

export function addProjectionWeightedTermLine(
  lines: string[],
  language: UiLanguage,
  label: string,
  value: number | null | undefined,
  weight: number,
  variableName: string,
  variableValue: number | null | undefined
) {
  if (value === null || value === undefined || Number.isNaN(value)) return;
  const metric = formatProjectionMetric(variableValue);
  const formula = metric === null ? `${variableName} * ${weight}` : `${variableName} (${metric}) * ${weight}`;
  addProjectionTermLine(lines, language, label, value, formula);
}

export function forecastEfficiencyTitle(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  forecastLabel: string,
  forecast: number | null,
  efficiency: number | null
) {
  const price = typeof player.price === "number" && Number.isFinite(player.price) && player.price > 0 ? player.price : null;
  const lines = [
    localizedText(
      language,
      `${player.name} · ${forecastLabel} asset efficiency: ${efficiency === null ? "—" : formatNumber(efficiency, 3)} points per price unit.`,
      `${player.name} · эффективность ${forecastLabel}: ${efficiency === null ? "—" : formatNumber(efficiency, 3)} очка на единицу стоимости.`
    )
  ];
  if (forecast === null || !Number.isFinite(forecast)) {
    lines.push(localizedText(language, `No ${forecastLabel} forecast is available.`, `Прогноз ${forecastLabel} отсутствует.`));
  } else if (price === null) {
    lines.push(localizedText(language, "A positive verified Sports.ru price is required.", "Нужна положительная подтверждённая цена Sports.ru."));
  } else {
    lines.push(`${formatNumber(forecast, 2)} ÷ ${formatNumber(price, 2)} = ${formatNumber(efficiency, 3)}`);
    lines.push(localizedText(
      language,
      "This is a relative asset-value indicator for the next round, not an additional points forecast.",
      "Это относительный показатель выгодности ассета на следующий тур, а не дополнительный прогноз очков."
    ));
  }
  return lines.join("\n");
}

export function foontasyForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage, horizon: number) {
  const value = horizon === 1 ? player.foontasyPoints : player.foontasyHorizonPoints;
  if (value === null || value === undefined) {
    return localizedText(language, `FFO ${horizon === 1 ? "" : `T${horizon} `}is unavailable. Foontasy currently publishes only the current-round forecast.`, `FFO${horizon === 1 ? "" : ` Т${horizon}`} недоступен: Foontasy сейчас публикует прогноз только текущего тура.`);
  }
  return localizedText(language, `FFO${horizon === 1 ? "" : ` T${horizon}`}: ${formatScore(value)} FP.`, `FFO${horizon === 1 ? "" : ` Т${horizon}`}: ${formatScore(value)} ФО.`);
}

export function addPoissonProjectionTermLine(
  lines: string[],
  language: UiLanguage,
  label: string,
  value: number | null | undefined,
  groupSize: 2 | 3,
  variableName: string,
  variableValue: number | null | undefined,
  fallback = 0
) {
  if (value === null || value === undefined || Number.isNaN(value)) return;
  const metric = formatProjectionMetric(variableValue);
  const formula = metric === null
    ? `${fallback} (from ${variableName} when unavailable)`
    : `poisson_groups(${metric}, ${groupSize})`;
  addProjectionTermLine(lines, language, label, value, formula);
}

export function compactFormulaArithmeticLines(
  language: UiLanguage,
  formulaData: NonNullable<FantasyPlannerPlayer["projectionFormula"]> | NonNullable<FantasyPlannerPlayer["alternativeProjectionFormula"]>,
  totalOverride: number | null
) {
  const total = totalOverride === null ? formulaData.total : totalOverride;
  const lines = [`${language === "ru" ? "Итого" : "Total"}: ${formatNumber(total, 3)}`];
  for (const term of formulaData.terms) {
    const expression = readableResolvedFormulaExpression(term.resolvedExpression, language);
    const sign = term.sign < 0 ? "−" : "+";
    const fixturePrefix = term.fixtureLabel ? `[${term.fixtureLabel}] ` : "";
    lines.push(`${sign} ${fixturePrefix}${expression} = ${formatNumber(term.value, 3)}`);
  }
  return lines;
}

export function buildFormulaBreakdownLines(
  language: UiLanguage,
  formulaData: NonNullable<FantasyPlannerPlayer["projectionFormula"]> | NonNullable<FantasyPlannerPlayer["alternativeProjectionFormula"]>,
  totalLabel: string,
  totalOverride: number | null
) {
  const lines: string[] = [];

  if (formulaData.terms.length === 0) {
    lines.push(localizedText(language, "- No formula terms available.", "- Нет доступных слагаемых формулы."));
  } else {
    formulaData.terms.forEach((term) => {
      const valueText = formatNumber(term.value, 4);
      const moduleLabel = formulaTermLabel(term.expression, language);
      const fixturePrefix = term.fixtureLabel ? `${term.fixtureLabel} — ` : "";
      const resolvedExpression = readableResolvedFormulaExpression(term.resolvedExpression, language);
      const signedExpression = term.sign === -1
        ? `-(${resolvedExpression})`
        : resolvedExpression;
      lines.push(localizedText(
        language,
        `- ${fixturePrefix}${moduleLabel}: ${signedExpression} = ${valueText} FP`,
        `- ${fixturePrefix}${moduleLabel}: ${signedExpression} = ${valueText} ФО`
      ));
    });
  }

  const total = totalOverride === null ? formulaData.total : totalOverride;
  lines.push(formulaContributionTotalLine(
    language,
    totalLabel,
    formulaData.terms.map((term) => term.value),
    total
  ));
  return lines;
}

export function readableResolvedFormulaExpression(expression: string, language: UiLanguage) {
  const readable = expression
    .replaceAll(" * ", " × ")
    .replaceAll(" / ", " ÷ ");
  if (language !== "ru") return readable;
  return projectionBreakdownText(readable, language)
    .replaceAll("expected goals conceded", "ожидаемые пропущенные голы")
    .replaceAll("expected clean sheets", "ожидаемые сухие матчи")
    .replaceAll("expected recoveries", "ожидаемые возвраты")
    .replaceAll("expected yellow cards", "ожидаемые жёлтые карточки")
    .replaceAll("expected red cards", "ожидаемые красные карточки")
    .replaceAll("expected assists", "ожидаемые ассисты")
    .replaceAll("expected goals", "ожидаемые голы")
    .replaceAll("expected saves", "ожидаемые сейвы")
    .replaceAll("full match probability", "вероятность полного матча")
    .replaceAll("60 minute probability", "вероятность 60+ минут")
    .replaceAll("appearance probability", "вероятность выхода");
}

export function formulaContributionTotalLine(
  language: UiLanguage,
  totalLabel: string,
  contributions: number[],
  total: number
) {
  const arithmetic = contributions.length > 0
    ? contributions.map((value, index) => {
        const absolute = formatNumber(Math.abs(value), 4);
        if (index === 0) return value < 0 || Object.is(value, -0) ? `-${absolute}` : absolute;
        return value < 0 || Object.is(value, -0) ? `- ${absolute}` : `+ ${absolute}`;
      }).join(" ")
    : "0";
  const unroundedTotal = contributions.reduce((sum, value) => sum + value, 0);
  const totalArithmetic = Math.abs(unroundedTotal - total) > 0.00005
    ? `${arithmetic} = ${formatNumber(unroundedTotal, 4)} → ${formatScore(total)}`
    : `${arithmetic} = ${formatScore(total)}`;
  return localizedText(
    language,
    `- ${totalLabel}: ${totalArithmetic} FP`,
    `- ${projectionBreakdownText(totalLabel, language)}: ${totalArithmetic} ФО`
  );
}

export function formulaTermLabel(expression: string, language: UiLanguage) {
  const normalized = expression.toLowerCase();
  const english = normalized.includes("expected goals conceded") ? "Goals conceded"
    : normalized.includes("expected goals") ? "Goals"
    : normalized.includes("expected assists") ? "Assists"
    : normalized.includes("expected clean sheets") ? "Clean sheet"
    : normalized.includes("expected saves") ? "Saves"
    : normalized.includes("expected recoveries") ? "Recoveries"
    : normalized.includes("expected yellow cards") ? "Yellow cards"
    : normalized.includes("expected red cards") ? "Red cards"
    : normalized.includes("full match probability") ? "Full match"
    : normalized.includes("60 minute probability") ? "60+ minutes"
    : normalized.includes("appearance probability") ? "Appearance"
    : "Formula module";
  if (language !== "ru") return english;
  return english === "Goals conceded" ? "Пропущенные голы"
    : english === "Goals" ? "Голы"
    : english === "Assists" ? "Ассисты"
    : english === "Clean sheet" ? "Сухой матч"
    : english === "Saves" ? "Сейвы"
    : english === "Recoveries" ? "Возвраты"
    : english === "Yellow cards" ? "Жёлтые карточки"
    : english === "Red cards" ? "Красные карточки"
    : english === "Full match" ? "Полный матч"
    : english === "60+ minutes" ? "60+ минут"
    : english === "Appearance" ? "Выход на поле"
    : "Модуль формулы";
}

export function buildProjectionBreakdownLines(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  components: NonNullable<FantasyPlannerPlayer["projectionComponents"]>,
  fixtureInputs: FantasyProjectionFixtureInputs | null | undefined
) {
  const lines: string[] = [];
  const goalWeight = player.positionGroup === "MID" ? 5 : player.positionGroup === "FWD" ? 4 : 6;
  const cleanSheetWeight = player.positionGroup === "GK" || player.positionGroup === "DEF" ? 4 : 1;
  const showFullMatch = player.positionGroup === "MID" || player.positionGroup === "FWD";
  const showSaves = player.positionGroup === "GK";
  const showRecoveries = player.positionGroup !== "GK";
  const showGoalsConceded = player.positionGroup === "GK" || player.positionGroup === "DEF";

  if (fixtureInputs?.expectedMinutes !== null && fixtureInputs?.expectedMinutes !== undefined) {
    const expectedMinutes = formatProjectionMetric(fixtureInputs.expectedMinutes, 1);
    if (expectedMinutes) lines.push(localizedText(language, `- Expected minutes: ${expectedMinutes}`, `- Ожидаемые минуты: ${expectedMinutes}`));
  }
  lines.push(...starterMinuteFloorLines(fixtureInputs, language));
  lines.push(...minuteHistoryProvenanceLines(fixtureInputs, language));
  lines.push(...sparseTeamAttackAllocationLines(fixtureInputs, language));

  addProjectionWeightedTermLine(
    lines,
    language,
    "Appearance FP",
    components.appearance,
    1,
    "P(appearance)",
    fixtureInputs?.appearanceProbability
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "60+ minutes FP",
    components.sixtyMinutes,
    1,
    "P(60+ min)",
    fixtureInputs?.sixtyMinutesProbability
  );
  if (showFullMatch) {
    addProjectionWeightedTermLine(
      lines,
      language,
      "Full match FP",
      components.fullMatch,
      1,
      "P(full match)",
      fixtureInputs?.fullMatchProbability
    );
  } else {
    addProjectionTermLine(lines, language, "Full match FP", components.fullMatch, "not awarded for this position");
  }

  addProjectionWeightedTermLine(
    lines,
    language,
    "Goal FP",
    components.goals,
    goalWeight,
    "Expected goals",
    fixtureInputs?.expectedGoals
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Assist FP",
    components.assists,
    3,
    "Expected assists",
    fixtureInputs?.expectedAssists
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Clean sheet FP",
    components.cleanSheet,
    cleanSheetWeight,
    "Expected clean sheets",
    fixtureInputs?.expectedCleanSheets
  );

  if (showSaves) {
    addPoissonProjectionTermLine(
      lines,
      language,
      "Save FP",
      components.saves,
      3,
      "Expected saves",
      fixtureInputs?.expectedSaves,
      0
    );
  } else {
    addProjectionTermLine(lines, language, "Save FP", components.saves, "not applicable for this position");
  }

  if (showRecoveries) {
    addPoissonProjectionTermLine(
      lines,
      language,
      "Recovery FP",
      components.recoveries,
      3,
      "Expected recoveries",
      fixtureInputs?.expectedRecoveries,
      0
    );
  } else {
    addProjectionTermLine(lines, language, "Recovery FP", components.recoveries, "not applicable for this position");
  }

  if (showGoalsConceded) {
    if (fixtureInputs?.expectedGoalsConceded !== null && fixtureInputs?.expectedGoalsConceded !== undefined && Number.isFinite(fixtureInputs.expectedGoalsConceded)) {
      const expected = fixtureInputs.expectedGoalsConceded;
      const formula = `-poisson_groups(${formatProjectionMetric(expected, 3)}, 2)`;
      addProjectionTermLine(lines, language, "Goals conceded FP", components.goalsConceded, formula);
    } else {
      addProjectionTermLine(lines, language, "Goals conceded FP", components.goalsConceded, "not available");
    }
  } else {
    addProjectionTermLine(lines, language, "Goals conceded FP", components.goalsConceded, "not awarded for this position");
  }

  addProjectionWeightedTermLine(
    lines,
    language,
    "Yellow card FP",
    components.yellowCards,
    -1,
    "Expected yellow cards",
    fixtureInputs?.expectedYellowCards
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Red card FP",
    components.redCards,
    -3,
    "Expected red cards",
    fixtureInputs?.expectedRedCards
  );
  const contributions = [
    components.appearance,
    components.sixtyMinutes,
    components.fullMatch,
    components.goals,
    components.assists,
    components.cleanSheet,
    components.saves,
    components.recoveries,
    components.goalsConceded,
    components.yellowCards,
    components.redCards
  ];
  lines.push(formulaContributionTotalLine(language, "Total", contributions, components.total));

  const computedTotal = contributions.reduce((total, value) => total + (value ?? 0), 0);
  if (Math.abs(computedTotal - components.total) > 0.001) {
    lines.push(localizedText(language, "Total differs from module sum: custom weights/order were applied during scoring.", "Итог отличается от суммы модулей: применены пользовательские веса или порядок расчёта."));
  }

  return lines;
}

export function buildFplForecastBreakdownLines(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  breakdown: NonNullable<FantasyPlannerPlayer["fplForecastBreakdown"]>,
  totalLabel: string
) {
  const lines: string[] = [];
  if ((breakdown.fixtureCount ?? 1) > 1) {
    lines.push(localizedText(
      language,
      `- Provider-round total: ${breakdown.fixtureCount} fixtures scored independently and summed.`,
      `- Итог provider-тура: ${breakdown.fixtureCount} матча рассчитаны отдельно и сложены.`
    ));
  }
  const defensiveThreshold = player.positionGroup === "DEF" ? 10
    : player.positionGroup === "MID" || player.positionGroup === "FWD" ? 12
    : null;
  const defensiveMetric = player.positionGroup === "DEF" ? "CBIT" : "CBIRT";
  const explanation = (en: string, ru: string) => localizedText(language, en, ru);
  const componentRows: Array<[string, number, string]> = [
    ["Appearance FP", breakdown.appearance, explanation("official FPL appearance probabilities", "официальные правила FPL и вероятности выхода")],
    ["Goal FP", breakdown.goals, explanation("expected goals × official position weight", "ожидаемые голы × официальный вес позиции")],
    ["Assist FP", breakdown.assists, explanation("expected assists × 3", "ожидаемые ассисты × 3")],
    ["Clean sheet FP", breakdown.cleanSheets, explanation("expected clean sheets × official position weight", "ожидаемые сухие матчи × официальный вес позиции")],
    ["Save FP", breakdown.saves, player.positionGroup === "GK" ? explanation("expected complete groups of 3 saves", "ожидаемые полные группы по 3 сейва") : "not applicable for this position"],
    ["Goals conceded FP", breakdown.goalsConceded, player.positionGroup === "GK" || player.positionGroup === "DEF" ? explanation("negative expected complete groups of 2 conceded", "штраф за ожидаемые полные группы по 2 пропущенных гола") : "not applicable for this position"],
    ["Yellow card FP", breakdown.yellowCards, explanation("expected yellow cards × −1", "ожидаемые жёлтые карточки × −1")],
    ["Red card FP", breakdown.redCards, explanation("expected red cards × −3", "ожидаемые красные карточки × −3")],
    ["Penalty save FP", breakdown.penaltySaves, player.positionGroup === "GK" ? explanation("not forecast without official event probability", "нет прогноза без официальной вероятности события") : "not applicable for this position"],
    ["Penalty miss FP", breakdown.penaltyMisses, explanation("not forecast without official event probability", "нет прогноза без официальной вероятности события")],
    ["Own goal FP", breakdown.ownGoals, explanation("not forecast without official event probability", "нет прогноза без официальной вероятности события")],
    ["Bonus FP", breakdown.bonus, explanation("appearance probability × official finalized bonus mean", "вероятность выхода × среднее официальных итоговых бонусов")],
    ["Defensive contribution FP", breakdown.defensiveContributions, defensiveThreshold === null
      ? "not applicable for this position"
      : explanation(
          `appearance probability × official finalized ${defensiveThreshold}-${defensiveMetric} threshold outcomes; capped at +2`,
          `вероятность выхода × доля официальных матчей с порогом ${defensiveThreshold} ${defensiveMetric}; максимум +2`
        )]
  ];
  componentRows.forEach(([label, value, formula]) => addProjectionTermLine(lines, language, label, value, formula));
  lines.push(formulaContributionTotalLine(language, totalLabel, componentRows.map(([, value]) => value), breakdown.total));
  lines.push(localizedText(
    language,
    "Generic recoveries are excluded: FPL does not award one point per three recoveries.",
    "Обычные возвраты исключены: в FPL нет начисления одного очка за три возврата."
  ));
  return lines;
}

export function buildAlternativeProjectionBreakdownLines(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  components: NonNullable<FantasyPlannerPlayer["alternativeProjectionComponents"]>,
  fixtureInputs: FantasyProjectionFixtureInputs | null | undefined
) {
  const lines: string[] = [];
  const goalWeight = player.positionGroup === "MID" ? 5 : player.positionGroup === "FWD" ? 4 : 6;
  const cleanSheetWeight = player.positionGroup === "GK" || player.positionGroup === "DEF" ? 4 : 1;
  const showFullMatch = player.positionGroup === "MID" || player.positionGroup === "FWD";
  const showSaves = player.positionGroup === "GK";
  const showRecoveries = player.positionGroup !== "GK";

  if (fixtureInputs?.expectedMinutes !== null && fixtureInputs?.expectedMinutes !== undefined) {
    const expectedMinutes = formatProjectionMetric(fixtureInputs.expectedMinutes, 1);
    if (expectedMinutes) lines.push(localizedText(language, `- Expected minutes: ${expectedMinutes}`, `- Ожидаемые минуты: ${expectedMinutes}`));
  }
  lines.push(...minuteHistoryProvenanceLines(fixtureInputs, language));
  lines.push(...sparseTeamAttackAllocationLines(fixtureInputs, language));

  addProjectionWeightedTermLine(
    lines,
    language,
    "Appearance FP",
    components.appearance,
    1,
    "P(appearance)",
    fixtureInputs?.appearanceProbability
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "60+ minutes FP",
    components.sixtyMinutes,
    1,
    "P(60+ min)",
    fixtureInputs?.sixtyMinutesProbability
  );
  if (showFullMatch) {
    addProjectionWeightedTermLine(
      lines,
      language,
      "Full match FP",
      components.fullMatch,
      1,
      "P(full match)",
      fixtureInputs?.fullMatchProbability
    );
  } else {
    addProjectionTermLine(lines, language, "Full match FP", components.fullMatch, "not awarded for this position");
  }

  addProjectionWeightedTermLine(
    lines,
    language,
    "Goal FP",
    components.goals,
    goalWeight,
    "Expected goals",
    fixtureInputs?.expectedGoals
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Assist FP",
    components.assists,
    3,
    "Expected assists",
    fixtureInputs?.expectedAssists
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Clean sheet FP",
    components.cleanSheet,
    cleanSheetWeight,
    "Expected clean sheets",
    fixtureInputs?.expectedCleanSheets
  );

  if (showSaves) {
    const savesMetric = formatProjectionMetric(fixtureInputs?.expectedSaves);
    const savesFormula = savesMetric === null ? "Expected saves / 3" : `${savesMetric} / 3`;
    addProjectionTermLine(lines, language, "Save FP", components.saves, `${savesFormula}`);
  } else {
    addProjectionTermLine(lines, language, "Save FP", components.saves, "not applicable for this position");
  }

  if (showRecoveries) {
    const recoveriesMetric = formatProjectionMetric(fixtureInputs?.expectedRecoveries);
    const recoveriesFormula = recoveriesMetric === null ? "Expected recoveries / 3" : `${recoveriesMetric} / 3`;
    addProjectionTermLine(lines, language, "Recovery FP", components.recoveries, recoveriesFormula);
  } else {
    addProjectionTermLine(lines, language, "Recovery FP", components.recoveries, "not applicable for this position");
  }

  const concededPenaltyApplies = player.positionGroup === "GK" || player.positionGroup === "DEF";
  const expectedGoalsConceded = formatProjectionMetric(fixtureInputs?.expectedGoalsConceded);
  addProjectionTermLine(
    lines,
    language,
    "Goals conceded FP",
    components.goalsConceded,
    concededPenaltyApplies
      ? expectedGoalsConceded === null
        ? "negative Poisson groups of 2 from expected goals conceded"
        : `-poisson_groups(${expectedGoalsConceded}, 2)`
      : "not applicable for this position"
  );

  addProjectionWeightedTermLine(
    lines,
    language,
    "Yellow card FP",
    components.yellowCards,
    -1,
    "Expected yellow cards",
    fixtureInputs?.expectedYellowCards
  );
  addProjectionWeightedTermLine(
    lines,
    language,
    "Red card FP",
    components.redCards,
    -3,
    "Expected red cards",
    fixtureInputs?.expectedRedCards
  );
  const contributions = [
    components.appearance,
    components.sixtyMinutes,
    components.fullMatch,
    components.goals,
    components.assists,
    components.cleanSheet,
    components.saves,
    components.recoveries,
    components.goalsConceded,
    components.yellowCards,
    components.redCards
  ];
  lines.push(formulaContributionTotalLine(language, "Alternative total", contributions, components.total));

  const computedTotal = contributions.reduce((total, value) => total + (value ?? 0), 0);
  if (Math.abs(computedTotal - components.total) > 0.001) {
    lines.push(localizedText(language, "Total differs from module sum: custom weights/order were applied during scoring.", "Итог отличается от суммы модулей: применены пользовательские веса или порядок расчёта."));
  }

  return lines;
}

export function playerPrimaryNextForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage, nextForecast: number | null) {
  if (player.projectionFormula) {
    return compactFormulaArithmeticLines(language, player.projectionFormula, nextForecast).join("\n");
  }
  const fixtureCount = player.roundFixtureCounts?.[0] ?? 0;
  const lines = [localizedText(
    language,
    `Primary forecast for next provider round${fixtureCount > 1 ? ` (${fixtureCount} fixtures)` : ""}: ${formatScore(nextForecast)} FP`,
    `Основной прогноз на следующий тур провайдера${fixtureCount > 1 ? ` (${fixtureCount} матча)` : ""}: ${formatScore(nextForecast)} ФО`
  )];
  if (player.fplForecastBreakdown) {
    lines.push(...buildFplForecastBreakdownLines(player, language, player.fplForecastBreakdown, "Total"));
  } else if (player.projectionEngine === "COMPONENT_XFP_V1" && player.projectionComponents) {
    lines.push(...buildProjectionBreakdownLines(player, language, player.projectionComponents, player.projectedFixtureComponents));
  } else if (player.projectionEngine === "LEGACY_RIDGE19_V1") {
    lines.push(localizedText(
      language,
      "The legacy calibrated forecast does not expose a component-level arithmetic breakdown; component-model values are intentionally not shown as if they formed this total.",
      "Калиброванный legacy-прогноз не сохраняет арифметический разбор по компонентам; значения компонентной модели намеренно не показываются так, будто из них получен этот итог."
    ));
  }
  return lines.join("\n");
}

export function playerPrimaryHorizonForecastTitle(
  player: FantasyPlannerPlayer,
  language: UiLanguage,
  primaryHorizonForecast: number | null,
  horizon: number
) {
  const available = player.roundPoints.slice(0, horizon).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const lines = [localizedText(language, `Primary forecast total over ${horizon} rounds: ${formatScore(primaryHorizonForecast)} FP`, `Основной прогноз на ${horizon} тура: ${formatScore(primaryHorizonForecast)} ФО`)];
  if (available.length > 0) {
    lines.push(localizedText(language, "Round-by-round values:", "По турам:"));
    available.forEach((value, index) => lines.push(localizedText(language, `Round ${index + 1}: ${formatScore(value)} FP`, `Тур ${index + 1}: ${formatScore(value)} ФО`)));
  }
  if (available.length === 0) {
    lines.push(localizedText(language, "No round-by-round values available yet.", "Значений по отдельным турам пока нет."));
  }
  if (player.forecastModelVersion) {
    lines.push(localizedText(language, `Model: ${player.forecastModelVersion}`, `Модель: ${player.forecastModelVersion}`));
  }
  return lines.join("\n");
}

export function playerAverageForecastTitle(
  language: UiLanguage,
  averageForecast: number | null,
  primaryForecast: number | null,
  alternativeForecast: number | null,
  horizon: number
) {
  const base = formatScore(primaryForecast);
  const alternative = formatScore(alternativeForecast);
  const lines = [
    localizedText(language, `Average forecast (${horizon} rounds): ${formatScore(averageForecast)} FP`, `Средний прогноз (${horizon} туров): ${formatScore(averageForecast)} ФО`),
  ];
  if (primaryForecast === null || alternativeForecast === null) {
    lines.push(
      localizedText(language, "Average is not available because one source is missing for this player.", "Среднее недоступно: для игрока отсутствует один из источников.")
    );
  }
  return lines.join("\n");
}

export function alternativePlayerForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage) {
  const nextAlternative = nextAlternativeFantasyPoints(player);
  if (player.alternativeProjectionFormula) {
    return compactFormulaArithmeticLines(language, player.alternativeProjectionFormula, nextAlternative).join("\n");
  }
  const fixtureCount = player.roundFixtureCounts?.[0] ?? 0;
  const lines = [localizedText(
    language,
    `Alternative forecast for next provider round${fixtureCount > 1 ? ` (${fixtureCount} fixtures)` : ""}: ${formatScore(nextAlternative)} FP`,
    `Альтернативный прогноз на следующий тур провайдера${fixtureCount > 1 ? ` (${fixtureCount} матча)` : ""}: ${formatScore(nextAlternative)} ФО`
  )];
  if (player.alternativeFplForecastBreakdown) {
    lines.push(...buildFplForecastBreakdownLines(player, language, player.alternativeFplForecastBreakdown, "Alternative total"));
  } else if (player.alternativeProjectionComponents) {
    lines.push(
      ...buildAlternativeProjectionBreakdownLines(
        player,
        language,
        player.alternativeProjectionComponents,
        player.alternativeProjectedFixtureComponents
      )
    );
  } else {
    lines.push(localizedText(language, "This player does not expose component-level alternative decomposition.", "Для этого игрока нет покомпонентной расшифровки Альт."));
  }
  return lines.join("\n");
}

export function alternativePlayerHorizonForecastTitle(player: FantasyPlannerPlayer, language: UiLanguage, horizon: number) {
  const alternativeTotal = playerAlternativeHorizonPoints(player, horizon);
  const values = player.alternativeRoundPoints?.slice(0, horizon) ?? [];
  const lines = [localizedText(language, `Alternative forecast total over ${horizon} rounds: ${formatScore(alternativeTotal)} FP`, `Альтернативный прогноз на ${horizon} тура: ${formatScore(alternativeTotal)} ФО`)];
  lines.push(localizedText(language, "Round-by-round values:", "По турам:"));
  for (let index = 0; index < horizon; index += 1) {
    const value = values[index];
    lines.push(
      typeof value === "number" && Number.isFinite(value)
        ? localizedText(language, `Round ${index + 1}: ${formatScore(value)} FP`, `Тур ${index + 1}: ${formatScore(value)} ФО`)
        : localizedText(language, `Round ${index + 1}: unavailable`, `Тур ${index + 1}: нет прогноза`)
    );
  }
  if (alternativeTotal === null) {
    lines.push(localizedText(
      language,
      "The horizon total is withheld because at least one requested round has no valid Alt projection. Missing rounds are not silently treated as zero.",
      "Итог горизонта не показывается: хотя бы для одного выбранного тура нет корректного прогноза Alt. Пропущенные туры не подменяются нулём."
    ));
  }
  if (horizon > 1) {
    lines.push(localizedText(
      language,
      "The manual starting-XI minute floor affects only Round 1; later rounds use the player's ordinary expected minutes.",
      "Ручная отметка основы повышает минуты только в туре 1; дальнейшие туры используют обычный прогноз минут игрока."
    ));
  }
  return lines.join("\n");
}

export function squadCardForecastTitle(details: string, baseValue: number | null, isCaptain: boolean, language: UiLanguage) {
  if (!isCaptain || baseValue === null || !Number.isFinite(baseValue)) return details;
  return [
    details,
    localizedText(
      language,
      `Captain: ${formatScore(baseValue)} × 2 = ${formatScore(baseValue * 2)} FP`,
      `Капитан: ${formatScore(baseValue)} × 2 = ${formatScore(baseValue * 2)} ФО`
    )
  ].join("\n");
}

export function alternativePredictedFpTitle(language: UiLanguage) {
  return localizedText(
    language,
    "Alternative forecast for the next provider round; double-round fixtures are projected independently and summed.",
    "Альтернативный прогноз FP на следующий тур провайдера; матчи двойного тура считаются отдельно и складываются. Только для просмотра: не используется в автоподборе, ценности, трансферах и очках тура."
  );
}

export function alternativeFiveRoundFpTitle(language: UiLanguage, horizon = 5) {
  return localizedText(
    language,
    `Total alternative forecast over ${horizon} rounds.`,
    "Суммарный альтернативный прогноз FP на следующие пять туров, рассчитанный по матчам каждого тура."
  );
}

export function playerPoolColumnTitles(language: UiLanguage, horizon: number) {
  return {
    player: localizedText(language, "Player name and primary fantasy-points forecast.", "Имя игрока и основной прогноз fantasy-очков."),
    team: localizedText(language, "Player's club. The compact code is shown; hover a row value for the full name.", "Клуб игрока. Показан короткий код; полное название доступно при наведении на значение."),
    position: localizedText(language, "Fantasy position: goalkeeper, defender, midfielder, or forward.", "Фэнтези-позиция: вратарь, защитник, полузащитник или нападающий."),
    price: localizedText(language, "Current fantasy price. A tilde marks an estimated price.", "Текущая фэнтези-цена. Тильда означает оценочную цену."),
    next: localizedText(language, "Primary fantasy-points forecast for the next provider round; double-round fixtures are summed.", "Основной прогноз fantasy-очков на следующий тур провайдера; матчи двойного тура складываются."),
    foontasyNext: localizedText(language, "Foontasy current-round forecast (FFO).", "Прогноз Foontasy на текущий тур (FFO)."),
    alternative: alternativePredictedFpTitle(language),
    alternativeFive: alternativeFiveRoundFpTitle(language, horizon),
    horizon: localizedText(language, `Total primary forecast over the selected ${horizon}-round horizon.`, `Суммарный основной прогноз на выбранном горизонте в ${horizon} туров.`),
    fixtures: localizedText(language, "Upcoming opponents. Home fixtures are bold; fill colour shows difficulty from blue (easy) to red (hard). Hover an opponent for the full club name.", "Ближайшие соперники. Домашние матчи выделены жирным; цвет заливки показывает сложность от синего (легко) до красного (сложно). Полное название клуба доступно при наведении."),
    action: localizedText(language, "Add the player to the squad or remove the selected player.", "Добавить игрока в состав или убрать уже выбранного игрока.")
  };
}

export function localizeForecastNote(value: string, language: UiLanguage) {
  if (language !== "ru") return value;
  if (value === "Active-roster starter flag") return "признак игрока основы в активном составе";
  if (value === "Five-match historical sample") return "историческая выборка из пяти матчей";
  if (value === "Recent fantasy-points trend is positive") return "положительный тренд fantasy-очков";
  if (value === "Favourable upcoming fixture") return "благоприятный ближайший матч";
  if (value === "No prior match statistics") return "нет статистики прошлых матчей";
  if (value === "Low forecast confidence") return "низкая уверенность прогноза";
  if (value === "Upcoming fixture strength is unavailable") return "нет оценки силы ближайшего соперника";
  if (value === "Difficult upcoming fixture") return "сложный ближайший матч";
  if (value === "Historical per-match event rates") return "исторические показатели событий за матч";
  if (value.startsWith("Expected minutes only ")) return `ожидается мало минут: ${value.slice("Expected minutes only ".length)}`;
  if (value.startsWith("Expected minutes ")) return `ожидаемые минуты: ${value.slice("Expected minutes ".length)}`;
  return value;
}
