/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
// Reviewed 2026-09-08 against Sports.ru contest 107/profile club links and
// mobile stage 407 (official 1436). Explicit IDs, never a fuzzy name join.
export const hockeyTeamLinks = [
  ["3600", "53", "ak-bars"], ["3601", "1", "lokomotiv-yaroslavl"], ["3602", "38", "salavat"], ["3603", "2", "cska"],
  ["3605", "37", "metallurg-magnitogorsk"], ["3607", "24", "ska"], ["3608", "7", "spartak"], ["3610", "26", "torpedo-nn"],
  ["3611", "25", "traktor"], ["3612", "66", "lada"], ["3613", "71", "neftekhimik"], ["3614", "198", "barys"],
  ["3615", "34", "avangard"], ["3616", "56", "severstal"], ["3618", "29", "sibir"], ["3619", "54", "amur"],
  ["3621", "207", "dynamo-minsk"], ["3624", "190", "avtomobilist"], ["8850", "719", "dinamo"], ["22433", "418", "admiral"],
  ["25813", "451", "sochi"], ["31015", "568", "shanghai-dragons"]
] as const;
