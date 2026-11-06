/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#mapping */
// Provider UUIDs verified against names, birth dates and canonical club rosters.
// These seeds still require active roster membership; they cannot create players.
export const REVIEWED_SORARE_PLAYER_IDS: Record<string,{playerId:bigint;birthDate:string}> = {
  // João Victor Tornich = Alemão: https://www.lask.at/de/m/news/lask-bindet-leistungstraeger-langfristig
  "c4e7cfba-edb1-4214-8cfd-109a13249b45":{playerId:1437941n,birthDate:"2002-11-06"},
  // Marko Milovanović = Marezi: https://www.udalmeriasad.com/noticias/el-almeria-traspasa-a-milovanovic-al-portsmouth
  "644eaaf7-d31c-4a8e-8614-cc0c4ad52905":{playerId:1284376n,birthDate:"2003-08-04"},
  // Iván San José Cantalejo = Chuki: https://www.realvalladolid.es/noticias/tres-de-la-casa
  "659c32d7-2292-4e2d-8ffb-6c39e3229d0d":{playerId:1315344n,birthDate:"2004-04-29"},
  // Pedro Henrique Silva dos Santos = Pedrinho: https://www.cbf.com.br/futebol-brasileiro/atletas/campeonato-brasileiro/sub-17/2021/697315
  "dee3af09-4a4d-451a-8753-c328dd14dd93":{playerId:1458712n,birthDate:"2006-02-05"},
  // Faustino = Tino Anjorin: https://www.chelseafc.com/en/news/article/youth-cup-report--chelsea-millwall
  "f8ce190b-e498-4367-8685-3603fab2643e":{playerId:983199n,birthDate:"2001-11-23"},
  // Alejandro Pozo Pozo = Alex Pozo: https://www.fotmob.com/es/players/785855/alejandro-pozo
  "4340cca6-8053-4f3d-9990-0f5e5926240d":{playerId:785855n,birthDate:"1999-02-22"}
};

// Club and league records corroborate these existing UUID bindings. Keep both
// observed dates in each review so a new discrepancy requires a new review.
export const REVIEWED_SORARE_BIRTH_DATE_CONFLICTS: Readonly<Record<string, {
  playerId: bigint;
  teamId: bigint;
  sourceBirthDate: string;
  canonicalBirthDate: string;
}>> = {
  // Eduardo Anderson: https://www.fc-baltika.ru/team/eduardo-anderson/
  "daeafd83-49d3-4e64-9902-244d4655dc5e": {
    playerId: 1421394n, teamId: 49694n, sourceBirthDate: "2001-01-31", canonicalBirthDate: "2001-03-01"
  },
  // Ángel Pérez Hidalgo: https://www.laliga.com/jugador/angel-perez-1
  "c537a7dc-0aec-435c-8644-1f0deb596945": {
    playerId: 1563022n, teamId: 9866n, sourceBirthDate: "2002-06-08", canonicalBirthDate: "2002-08-29"
  },
  // Santiago Ferreira Serra: https://cdmafrasad.pt/santiago-serra/
  "d06164fb-a206-43b6-9828-66aa341d4caa": {
    playerId: 1797326n, teamId: 1074320n, sourceBirthDate: "2007-01-23", canonicalBirthDate: "2007-01-28"
  },
  // Maksim Samorodov: https://fc-akhmat.ru/team/players/samorodov-maksim/
  "3bc265ca-e6c0-47c2-889d-564430a5dd3a": {
    playerId: 1241852n, teamId: 8708n, sourceBirthDate: "2001-05-09", canonicalBirthDate: "2002-06-29"
  },
  // Nobel Mendy: https://www.premierleague.com/en/players/606930/nobel-mendy/career
  "c7b1b78e-e986-43b2-9f2d-e79b23038c70": {
    playerId: 1428427n, teamId: 8667n, sourceBirthDate: "2004-09-03", canonicalBirthDate: "2004-08-16"
  },
  // Nacho Pérez Gómez: https://www.levanteud.com/jugadores/nacho-perez-gomez
  "4a8749ff-503f-47c1-87bb-d0000122fa7b": {
    playerId: 1800611n, teamId: 8581n, sourceBirthDate: "2008-09-01", canonicalBirthDate: "2008-08-29"
  },
  // Arsène Kouassi: https://www.fclorient.bzh/joueur/arsene-kouassi/
  "db7a7683-b766-4926-a420-db7e31dc0191": {
    playerId: 1640832n, teamId: 8689n, sourceBirthDate: "2004-01-02", canonicalBirthDate: "2004-09-11"
  },
  // Samuele Birindelli: https://www.acmonza.com/it/news/3734/
  "433dce04-fb95-4e5b-ac23-be947c9266c6": {
    playerId: 799497n, teamId: 6504n, sourceBirthDate: "1999-07-19", canonicalBirthDate: "1999-08-19"
  }
};
