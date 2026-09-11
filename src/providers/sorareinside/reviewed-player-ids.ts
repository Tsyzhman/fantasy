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
  "f8ce190b-e498-4367-8685-3603fab2643e":{playerId:983199n,birthDate:"2001-11-23"}
};
