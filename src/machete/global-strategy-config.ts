/** @spec spec://modules/machete/FEAT-002-global-strategy-formula#contracts */
export type GlobalStrategyProvider = "SPORTS_RU" | "FPL";
export type GlobalStrategyConfig = {
  version: string;
  provider: GlobalStrategyProvider;
  tournamentKey: string;
  calibration: "uncalibrated";
  kMax: number;
  rankWeight: number;
  gapWeight: number;
  gapScaleRounds: number;
  urgencyExponent: number;
  ownershipBonusScale: number;
  maxExpectedPointsLossFraction: number;
};

export function globalStrategyConfig(provider: GlobalStrategyProvider, tournamentKey: string): GlobalStrategyConfig {
  return Object.freeze({
    version: `${provider}:${tournamentKey}:global-v1`, provider, tournamentKey, calibration: "uncalibrated",
    kMax: 0.8, rankWeight: 0.4, gapWeight: 0.6, gapScaleRounds: 3, urgencyExponent: 2,
    ownershipBonusScale: 0.15, maxExpectedPointsLossFraction: 0.03
  });
}

export function validGlobalStrategyConfig(config: GlobalStrategyConfig): boolean {
  return Boolean(config.version && config.tournamentKey && ["FPL", "SPORTS_RU"].includes(config.provider))
    && [config.kMax, config.rankWeight, config.gapWeight, config.gapScaleRounds, config.urgencyExponent,
      config.ownershipBonusScale, config.maxExpectedPointsLossFraction].every(Number.isFinite)
    && config.kMax > 0 && config.kMax <= 1 && config.rankWeight >= 0 && config.gapWeight >= 0
    && Math.abs(config.rankWeight + config.gapWeight - 1) <= 1e-12
    && config.gapScaleRounds > 0 && config.urgencyExponent > 0 && config.ownershipBonusScale >= 0
    && config.maxExpectedPointsLossFraction >= 0 && config.maxExpectedPointsLossFraction < 1;
}
