export const sportsRuCurrentSeason = "2026/2027";
export const sportsRuCurrentLeagueIds = ["47", "48", "57", "61", "63", "71", "87"] as const;
export const sportsRuCurrentExpectedPriceCount = 4_269;
export const sportsOnlyPlayerIdBase = 8_000_000_000_000_000n;

export type VerifiedFotMobProfile = {
  name: string;
  birthDate: string;
};

export type SportsRuFinalMapping = {
  leagueId: string;
  providerPlayerId: string;
  targetPlayerId: string;
  targetTeamId: string;
  targetTeamName: string;
  profile: VerifiedFotMobProfile | null;
  reason: string;
};

export type SportsRuFinalExclusion = {
  leagueId: string;
  providerPlayerId: string;
  verifiedFotMobPlayerId: string;
  profile: VerifiedFotMobProfile;
  reason: string;
};

export type SportsRuSportsOnlySeed = {
  playerId: string;
  providerPlayerId: string;
  name: string;
  birthDate: string;
  country: string;
  evidence: string;
};

export type VerifiedBirthDateDiscrepancy = {
  leagueId: string;
  providerPlayerId: string;
  playerId: string;
  providerBirthDate: string;
  fotmobBirthDate: string;
};

export function sportsRuSportsOnlyPlayerId(providerPlayerId: string) {
  return String(sportsOnlyPlayerIdBase + BigInt(providerPlayerId));
}

// Every row below was checked against the current Sports.ru identity fields,
// the live FotMob profile and the active target team for this league season.
// A null profile means that FotMob does not expose a stable identity for the
// player; those rows use one of the explicit Sports.ru-only seeds below.
export const sportsRuFinalMappings = [
  {
    leagueId: "47", providerPlayerId: "71190", targetPlayerId: "1906025", targetTeamId: "9937", targetTeamName: "Brentford",
    profile: { name: "Joshua Stephenson", birthDate: "2007-09-04" },
    reason: "Replaces the unrelated FotMob profile 1805471; exact Brentford U21 identity and birth date."
  },
  {
    leagueId: "57", providerPlayerId: "68064", targetPlayerId: "1337282", targetTeamId: "8640", targetTeamName: "PSV Eindhoven",
    profile: { name: "Kodai Sano", birthDate: "2003-09-25" },
    reason: "Keeps the verified player and repairs the stale NEC team assignment to PSV."
  },
  {
    leagueId: "57", providerPlayerId: "68166", targetPlayerId: "1087476", targetTeamId: "8611", targetTeamName: "FC Twente",
    profile: { name: "Mathias Kjølø", birthDate: "2001-06-27" },
    reason: "Exact current FC Twente identity."
  },
  {
    leagueId: "57", providerPlayerId: "68338", targetPlayerId: sportsRuSportsOnlyPlayerId("68338"), targetTeamId: "10218", targetTeamName: "Excelsior",
    profile: null,
    reason: "The only searchable FotMob namesake is a different 1993-born player; the 2006-born Excelsior player has no stable FotMob profile."
  },
  {
    leagueId: "57", providerPlayerId: "68936", targetPlayerId: "1664735", targetTeamId: "8593", targetTeamName: "Ajax",
    profile: { name: "Jano Monserrate", birthDate: "2006-01-28" },
    reason: "Jano is the public name of Alejandro Monserrate Pueyo; exact birth date and Jong Ajax affiliation."
  },
  {
    leagueId: "57", providerPlayerId: "68940", targetPlayerId: "1524016", targetTeamId: "8640", targetTeamName: "PSV Eindhoven",
    profile: { name: "Sol Sidibé", birthDate: "2007-02-10" },
    reason: "Exact birth date and Jong PSV affiliation."
  },
  {
    leagueId: "57", providerPlayerId: "70961", targetPlayerId: "1988830", targetTeamId: "6413", targetTeamName: "PEC Zwolle",
    profile: { name: "Maxim de Troije", birthDate: "2007-02-16" },
    reason: "Replaces Maxim Dekker 1286065 with the exact Jong PEC Zwolle identity."
  },
  {
    leagueId: "61", providerPlayerId: "68401", targetPlayerId: "1133015", targetTeamId: "9780", targetTeamName: "Alverca",
    profile: { name: "Matheus Mendes", birthDate: "1999-03-10" },
    reason: "Matheus Mendes is the public name of Matheus Mendes Werneck de Oliveira; exact Alverca identity."
  },
  {
    leagueId: "61", providerPlayerId: "68544", targetPlayerId: "864304", targetTeamId: "158085", targetTeamName: "Arouca",
    profile: { name: "Orest Lebedenko", birthDate: "1998-09-23" },
    reason: "Keeps the verified player and repairs the stale Vitoria team assignment to Arouca."
  },
  {
    leagueId: "61", providerPlayerId: "68597", targetPlayerId: "1436250", targetTeamId: "212821", targetTeamName: "Casa Pia AC",
    profile: { name: "Gabi Pereira", birthDate: "2000-04-18" },
    reason: "Replaces Gabri Martinez 1287941; Gabi Pereira is Marcio Gabriel Ferreira Pereira."
  },
  {
    leagueId: "61", providerPlayerId: "68622", targetPlayerId: sportsRuSportsOnlyPlayerId("68622"), targetTeamId: "10212", targetTeamName: "Maritimo",
    profile: null,
    reason: "Replaces unrelated Afonso Silva 1971259; Pedro Afonso Costa Silva has no stable FotMob profile."
  },
  {
    leagueId: "61", providerPlayerId: "68725", targetPlayerId: "493724", targetTeamId: "9764", targetTeamName: "Gil Vicente",
    profile: { name: "Samuel Portugal", birthDate: "1994-03-29" },
    reason: "Keeps the verified player and repairs the stale FC Porto team assignment to Gil Vicente."
  },
  {
    leagueId: "61", providerPlayerId: "68735", targetPlayerId: "1210508", targetTeamId: "7841", targetTeamName: "Rio Ave",
    profile: { name: "Diogo Nascimento", birthDate: "2002-11-02" },
    reason: "Replaces the different Paços defender 1521405 with the Rio Ave midfielder of the exact legal identity and birth date."
  },
  {
    leagueId: "61", providerPlayerId: "68762", targetPlayerId: "1759728", targetTeamId: "1567", targetTeamName: "Santa Clara",
    profile: { name: "Djé Tavares", birthDate: "2003-06-02" },
    reason: "Djé Tavares is the public name of Jose Luis Rocha Tavares; exact Santa Clara identity."
  },
  {
    leagueId: "61", providerPlayerId: "68916", targetPlayerId: sportsRuSportsOnlyPlayerId("68916"), targetTeamId: "1074320", targetTeamName: "Estrela da Amadora",
    profile: null,
    reason: "Replaces unrelated Gabriel 793065; the Estrela U23 forward has no stable FotMob player profile."
  },
  {
    leagueId: "61", providerPlayerId: "71033", targetPlayerId: "1676059", targetTeamId: "9772", targetTeamName: "Benfica",
    profile: { name: "Rui Silva", birthDate: "2007-03-18" },
    reason: "Replaces Sporting goalkeeper Rui Silva 361717 with the exact Benfica B centre-back."
  },
  {
    leagueId: "61", providerPlayerId: "71034", targetPlayerId: "1798232", targetTeamId: "10264", targetTeamName: "Braga",
    profile: { name: "António Gil", birthDate: "2008-01-08" },
    reason: "Exact birth date and Braga B affiliation."
  },
  {
    leagueId: "61", providerPlayerId: "71035", targetPlayerId: "1681988", targetTeamId: "7844", targetTeamName: "Vitoria de Guimaraes",
    profile: { name: "Ahmed Sidibé", birthDate: "2002-02-10" },
    reason: "Ahmed Franck Sidibé is the full identity behind the Sports.ru Franck Sidibe row."
  },
  {
    leagueId: "61", providerPlayerId: "71036", targetPlayerId: sportsRuSportsOnlyPlayerId("71036"), targetTeamId: "7844", targetTeamName: "Vitoria de Guimaraes",
    profile: null,
    reason: "Replaces unrelated Rodrigo 975550; the 2007-born Vitoria defender has no stable FotMob profile."
  },
  {
    leagueId: "61", providerPlayerId: "71694", targetPlayerId: "930288", targetTeamId: "10212", targetTeamName: "Maritimo",
    profile: { name: "Francisco Vieites", birthDate: "1999-05-07" },
    reason: "Exact Fran Vieites identity, birth date and current live FotMob Maritimo team."
  },
  {
    leagueId: "63", providerPlayerId: "67351", targetPlayerId: "638772", targetTeamId: "1066681", targetTeamName: "Rodina",
    profile: { name: "Brian Mansilla", birthDate: "1997-04-16" },
    reason: "Keeps the verified player and repairs the stale FK Akhmat team assignment to Rodina."
  },
  {
    leagueId: "63", providerPlayerId: "67388", targetPlayerId: sportsRuSportsOnlyPlayerId("67388"), targetTeamId: "49694", targetTeamName: "Baltika",
    profile: null,
    reason: "Verified Baltika academy identity; FotMob exposes no stable player profile."
  },
  {
    leagueId: "63", providerPlayerId: "67466", targetPlayerId: "289490", targetTeamId: "8698", targetTeamName: "Zenit St. Petersburg",
    profile: { name: "Denis Terentyev", birthDate: "1992-08-13" },
    reason: "Exact identity; Zenit II is the live FotMob primary team while the senior club owns the current Sports.ru row."
  },
  {
    leagueId: "63", providerPlayerId: "67584", targetPlayerId: "863892", targetTeamId: "132286", targetTeamName: "FC Orenburg",
    profile: { name: "Ivan Ignatyev", birthDate: "1999-01-06" },
    reason: "Exact Orenburg identity; the RPL roster flag lags the current Russian Cup roster."
  },
  {
    leagueId: "63", providerPlayerId: "67592", targetPlayerId: "1202119", targetTeamId: "132286", targetTeamName: "FC Orenburg",
    profile: { name: "Robert Mejía", birthDate: "2000-10-06" },
    reason: "Replaces the different 1994-born Robert Mejia 729187 with the exact Orenburg midfielder."
  },
  {
    leagueId: "63", providerPlayerId: "67764", targetPlayerId: sportsRuSportsOnlyPlayerId("67764"), targetTeamId: "1068364", targetTeamName: "Akron Togliatti",
    profile: null,
    reason: "Official Akron identity; FotMob exposes no stable profile for Dudu Rodrigues."
  },
  {
    leagueId: "63", providerPlayerId: "67765", targetPlayerId: sportsRuSportsOnlyPlayerId("67765"), targetTeamId: "49694", targetTeamName: "Baltika",
    profile: null,
    reason: "Replaces Nikita Lobov 1641034; official Baltika identity with no stable FotMob profile."
  },
  {
    leagueId: "63", providerPlayerId: "67771", targetPlayerId: sportsRuSportsOnlyPlayerId("67771"), targetTeamId: "1068364", targetTeamName: "Akron Togliatti",
    profile: null,
    reason: "Replaces Marat Kulaev 1724292; exact Akron-2 identity with no stable FotMob profile."
  },
  {
    leagueId: "63", providerPlayerId: "67773", targetPlayerId: sportsRuSportsOnlyPlayerId("67773"), targetTeamId: "1068364", targetTeamName: "Akron Togliatti",
    profile: null,
    reason: "Verified Akron youth identity; FotMob exposes no stable player profile."
  },
  {
    leagueId: "63", providerPlayerId: "67780", targetPlayerId: "1724641", targetTeamId: "8705", targetTeamName: "FC Rostov",
    profile: { name: "Denis Titov", birthDate: "2006-11-06" },
    reason: "Replaces Denis Tikhonov 1489652; FotMob career data confirms the exact player returned to Rostov on 2026-07-01."
  }
] as const satisfies readonly SportsRuFinalMapping[];

export const sportsRuFinalExclusions = [
  {
    leagueId: "57", providerPlayerId: "67796", verifiedFotMobPlayerId: "1186780",
    profile: { name: "Alexandre Penetra", birthDate: "2001-09-09" },
    reason: "On loan from AZ to Çorum FK from 2026-08-03 through 2027-06-30."
  },
  {
    leagueId: "57", providerPlayerId: "67866", verifiedFotMobPlayerId: "1218556",
    profile: { name: "Kian Fitz-Jim", birthDate: "2003-07-05" },
    reason: "Permanent Ajax to Torino transfer on 2026-07-31."
  },
  {
    leagueId: "57", providerPlayerId: "68238", verifiedFotMobPlayerId: "1692891",
    profile: { name: "Ismail Ka", birthDate: "2006-03-09" },
    reason: "Feyenoord to Jong AZ transfer on 2026-07-29."
  },
  {
    leagueId: "63", providerPlayerId: "67626", verifiedFotMobPlayerId: "1449811",
    profile: { name: "Aleksandr Grigorjev", birthDate: "2004-05-27" },
    reason: "No active Rostov spell remains after the loan sequence ended on 2026-02-28."
  }
] as const satisfies readonly SportsRuFinalExclusion[];

export const sportsRuSportsOnlySeeds = [
  ["68338", "Gijs van den Berg", "2006-05-25", "Netherlands", "Official Eredivisie/Excelsior identity"],
  ["68622", "Pedrinho", "2002-03-26", "Portugal", "FPF and Benfica identity for Pedro Afonso Costa Silva"],
  ["68916", "Henrique Poniewas", "2006-09-25", "Brazil", "FPF Estrela da Amadora identity"],
  ["71036", "Rodrigo Magro Silva", "2007-03-14", "Portugal", "Vitoria de Guimaraes academy identity"],
  ["67388", "Georgi Makarov", "2006-12-26", "Russia", "Official Baltika academy identity"],
  ["67764", "Dudu Rodrigues", "2002-07-17", "Brazil", "Official FC Akron signing identity"],
  ["67765", "Nikita Bokov", "2004-02-13", "Russia", "Official Baltika academy identity"],
  ["67771", "Marat Khametov", "2008-04-24", "Russia", "Akron-2 registration identity"],
  ["67773", "Matvey Bezrogov", "2009-08-14", "Russia", "Official youth-league Akron identity"]
].map(([providerPlayerId, name, birthDate, country, evidence]) => ({
  playerId: sportsRuSportsOnlyPlayerId(providerPlayerId),
  providerPlayerId,
  name,
  birthDate,
  country,
  evidence
})) satisfies readonly SportsRuSportsOnlySeed[];

// These are identity-confirmed source metadata discrepancies, not mapping
// conflicts. The audit accepts a row only when all five values still match;
// any changed ID or date becomes a blocking issue again.
export const verifiedSportsRuBirthDateDiscrepancies = [
  ["47", "71682", "1348497", "2003-08-07", "2003-08-08"],
  ["48", "69077", "1209902", "2002-01-03", "2003-01-03"],
  ["48", "69154", "1451265", "2004-12-29", "2004-12-28"],
  ["48", "69181", "1111392", "2003-10-12", "2003-10-11"],
  ["48", "69249", "563058", "1996-06-24", "1996-04-27"],
  ["48", "69300", "1804119", "2007-09-24", "2007-09-04"],
  ["48", "69330", "1136096", "2001-05-10", "2001-05-17"],
  ["48", "69380", "1516021", "2004-01-09", "2004-01-10"],
  ["48", "69615", "259809", "1994-04-01", "1993-04-04"],
  ["48", "69655", "1682322", "2005-03-01", "2007-06-21"],
  ["48", "69670", "1206308", "2003-01-16", "2003-04-23"],
  ["57", "68008", "1797815", "2009-12-15", "2009-12-12"],
  ["57", "68010", "1946368", "2008-08-24", "2008-06-24"],
  ["57", "68020", "1665409", "2007-06-07", "2007-07-07"],
  ["57", "68278", "1876640", "2009-06-18", "2009-07-30"],
  ["57", "68305", "1793215", "2007-09-09", "2007-02-09"],
  ["61", "68398", "1817035", "2005-12-07", "2005-07-12"],
  ["61", "68731", "972080", "2001-07-30", "2001-06-30"],
  ["61", "70962", "1797326", "2007-01-23", "2007-01-28"],
  ["63", "67371", "1421394", "2001-01-31", "2001-03-01"],
  ["63", "67416", "1792323", "2006-01-01", "2006-11-06"],
  ["63", "67510", "1916526", "2008-02-09", "2008-02-08"],
  ["63", "67602", "792331", "1997-05-29", "1997-04-29"],
  ["63", "67692", "857270", "1999-10-24", "1999-10-23"],
  ["63", "67717", "1915206", "2006-01-23", "2006-01-03"],
  ["71", "69777", "1315511", "2005-06-16", "1998-09-07"],
  ["71", "69952", "1901786", "2007-05-15", "2007-05-17"],
  ["71", "70017", "2029203", "2006-02-12", "2006-12-02"],
  ["87", "70307", "1563022", "2002-08-29", "2002-06-08"],
  ["87", "70568", "1800611", "2008-09-01", "2008-08-29"],
  ["87", "70627", "1682298", "2005-11-02", "2005-01-01"],
  ["87", "70656", "1428427", "2004-09-03", "2004-08-16"],
  ["87", "70747", "1529105", "2003-03-12", "2003-03-09"],
  ["87", "70926", "1687255", "2006-01-01", "2006-03-24"]
].map(([leagueId, providerPlayerId, playerId, providerBirthDate, fotmobBirthDate]) => ({
  leagueId,
  providerPlayerId,
  playerId,
  providerBirthDate,
  fotmobBirthDate
})) satisfies readonly VerifiedBirthDateDiscrepancy[];

export const verifiedSportsRuNameVariantsWithoutBirthDate = [
  { leagueId: "48", providerPlayerId: "69733", playerId: "1975552", sportsName: "tommy betts", fotmobName: "Thomas Betts" }
] as const;

export const missingFotMobBirthDateSentinelRows = [
  { leagueId: "48", providerPlayerId: "69034", playerId: "1448524" },
  { leagueId: "48", providerPlayerId: "69068", playerId: "1748176" },
  { leagueId: "48", providerPlayerId: "69457", playerId: "1798725" },
  { leagueId: "71", providerPlayerId: "69815", playerId: "1801064" }
] as const;
