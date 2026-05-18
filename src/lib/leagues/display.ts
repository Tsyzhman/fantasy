type LeagueDisplayInput = {
  id?: string | null;
  name?: string | null;
  code?: string | null;
  country?: string | null;
  providerLeagueId?: string | null;
};

const macheteLeagueDisplayNamesByFotMobId: Record<string, string> = {
  "47": "England Premier League",
  "48": "England Championship",
  "53": "France Ligue 1",
  "54": "Germany Bundesliga",
  "55": "Italy Serie A",
  "57": "Netherlands Eredivisie",
  "61": "Portugal Primeira Liga",
  "63": "Russia Premier League",
  "71": "Turkey Super Lig",
  "77": "FIFA World Cup 2026"
};

export function leagueSubtitle(league: LeagueDisplayInput, seasonName?: string | null) {
  const name = league.name ?? "";
  const season = seasonName ?? "";
  const isChampionship =
    league.id === "championship" || league.code === "CHA" || name.toLowerCase().includes("championship");

  if (isChampionship) return [name, season].filter(Boolean).join(" ");

  return [league.country, season].filter(Boolean).join(" · ");
}

export function macheteLeagueDisplayName(league: LeagueDisplayInput) {
  const providerLeagueId = league.providerLeagueId ?? null;
  if (providerLeagueId && macheteLeagueDisplayNamesByFotMobId[providerLeagueId]) {
    return macheteLeagueDisplayNamesByFotMobId[providerLeagueId];
  }

  const name = league.name?.trim();
  if (!name) return league.country?.trim() || "League";

  const country = league.country?.trim();
  if (!country || country === "International") return name;

  const normalizedName = name.toLowerCase();
  const normalizedCountry = country.toLowerCase();
  if (normalizedName.includes(normalizedCountry) || normalizedName.includes(countryAdjective(normalizedCountry))) {
    return name;
  }

  return `${country} ${name}`;
}

function countryAdjective(country: string) {
  const adjectives: Record<string, string> = {
    england: "english",
    france: "french",
    germany: "german",
    italy: "italian",
    netherlands: "dutch",
    portugal: "portuguese",
    russia: "russian",
    turkey: "turkish"
  };

  return adjectives[country] ?? country;
}
