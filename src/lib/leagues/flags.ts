type LeagueFlagInput = {
  id?: string | null;
  name?: string | null;
  code?: string | null;
  country?: string | null;
};

const englandFlag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";

const flagByLeagueId: Record<string, string> = {
  "premier-league": englandFlag,
  championship: "🇬🇧",
  bundesliga: "🇩🇪",
  "ligue-1": "🇫🇷",
  "serie-a": "🇮🇹",
  "la-liga": "🇪🇸",
  "primeira-liga": "🇵🇹",
  eredivisie: "🇳🇱",
  "russian-premier-league": "🇷🇺",
  "turkish-super-lig": "🇹🇷"
};

const flagByLeagueCode: Record<string, string> = {
  EPL: englandFlag,
  CHA: "🇬🇧",
  BUN: "🇩🇪",
  L1: "🇫🇷",
  SA: "🇮🇹",
  LL: "🇪🇸",
  POR: "🇵🇹",
  ERE: "🇳🇱",
  RPL: "🇷🇺",
  TSL: "🇹🇷"
};

const flagByCountry: Record<string, string> = {
  england: englandFlag,
  germany: "🇩🇪",
  france: "🇫🇷",
  italy: "🇮🇹",
  spain: "🇪🇸",
  portugal: "🇵🇹",
  netherlands: "🇳🇱",
  russia: "🇷🇺",
  turkey: "🇹🇷"
};

export function leagueFlag(league: LeagueFlagInput) {
  const id = league.id?.toLowerCase();
  if (id && flagByLeagueId[id]) return flagByLeagueId[id];

  const code = league.code?.toUpperCase();
  if (code && flagByLeagueCode[code]) return flagByLeagueCode[code];

  const name = league.name?.toLowerCase();
  if (name?.includes("championship")) return "🇬🇧";
  if (name?.includes("premier league") && league.country?.toLowerCase() === "england") return englandFlag;

  const country = league.country?.toLowerCase();
  if (country && flagByCountry[country]) return flagByCountry[country];

  return "🏳️";
}
