/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#mapping */
// Reviewed against the SorareInside competition/team catalog and FotMob roster,
// 2026-09-11. Exact country + provider name only; never fuzzy substring matches
// (e.g. RC Celta must not become Real Club Celta de Vigo II).
export const SORARE_TEAM_ALIASES: Record<string,string> = {
  "be|Club Brugge KV":"Club Brugge", "no|Viking FK":"Viking", "no|FK Bodø / Glimt":"Bodø/Glimt",
  "es|Atlético de Madrid":"Atlético Madrid", "es|Real Racing Club de Santander":"Racing Santander",
  "es|D. Alavés":"Deportivo Alavés", "es|CA Osasuna":"Osasuna", "es|RCD Espanyol de Barcelona":"Espanyol",
  "es|Levante UD":"Levante", "es|RC Celta":"Celta Vigo", "es|Real Club Deportivo de La Coruña":"Deportivo A Coruña",
  "it|ACF Fiorentina":"Fiorentina", "it|Genoa CFC":"Genoa", "it|US Sassuolo Calcio":"Sassuolo",
  "it|Atalanta Bergamasca Calcio":"Atalanta", "it|FC Internazionale Milano":"Inter", "it|US Lecce":"Lecce", "it|SS Lazio":"Lazio",
  "de|Sport-Club Freiburg":"Freiburg",
  "pt|Academico de Viseu FC":"Académico Viseu", "pt|GD Estoril Praia":"Estoril", "pt|SL Benfica":"Benfica",
  "pt|Sporting Clube de Portugal":"Sporting CP", "pt|CS Marítimo Funchal":"Marítimo", "pt|CD Nacional Funchal":"Nacional",
  "pt|Vitória Guimarães SC":"Vitória de Guimarães", "pt|Sporting Braga":"Braga", "pt|CD Santa Clara":"Santa Clara",
  "ru|PFK Krylya Sovetov Samara":"Krylya Sovetov Samara", "ru|FK Rodina Moskva":"Rodina", "ru|FK Fakel Voronezh":"Fakel",
  "ru|FK Baltika Kaliningrad":"Baltika", "ru|FK Zenit St. Petersburg":"Zenit St. Petersburg", "ru|FC Dynamo Moscow":"Dinamo Moscow",
  "ru|FK Orenburg":"FC Orenburg", "ru|PFC CSKA":"CSKA Moscow", "ru|FK Rubin Kazan":"Rubin Kazan",
  "ru|FK Akhmat Grozny":"FK Akhmat", "ru|FK Makhachkala":"Dynamo Makhachkala", "ru|FK Spartak Moskva":"Spartak Moscow",
  "ru|FK Rostov":"FC Rostov", "ru|FK Krasnodar":"FC Krasnodar", "ru|FK Akron Togliatti":"Akron Togliatti",
  "nl|Feyenoord Rotterdam":"Feyenoord", "nl|Excelsior Rotterdam":"Excelsior", "nl|HFC ADO Den Haag":"ADO Den Haag",
  "nl|N.E.C. Nijmegen":"NEC Nijmegen", "nl|SC Cambuur Leeuwarden":"Cambuur", "nl|AZ":"AZ Alkmaar",
  "mc|AS Monaco":"Monaco", "fr|AS Monaco":"Monaco", "fr|AJ Auxerre":"Auxerre", "fr|Stade Rennais F.C.":"Rennes",
  "fr|Stade Brestois 29":"Brest", "fr|OGC Nice":"Nice", "fr|Olympique de Marseille":"Marseille", "fr|Olympique Lyonnais":"Lyon",
  "fr|Angers SCO":"Angers", "fr|LOSC Lille":"Lille", "fr|ESTAC Troyes":"Troyes", "fr|RC Lens":"Lens", "fr|RC Strasbourg Alsace":"Strasbourg",
  "tr|Amed Sportif Faaliyetler Kulübü":"Amed Sportif", "tr|Eyüp Spor Kulübü":"Eyüpspor", "tr|Kocaelispor Kulübü":"Kocaelispor",
  "tr|Büyükşehir Belediye Erzurum Spor Kulübü":"Erzurumspor FK", "tr|Gençlerbirliği Spor Kulübü":"Gençlerbirliği",
  "tr|Çaykur Rize Spor Kulübü":"Rizespor", "tr|Beşiktaş Jimnastik Kulübü":"Beşiktaş", "tr|Tümosan Konyaspor Kulübü":"Konyaspor",
  "tr|İstanbul Başakşehir Futbol Kulübü":"Başakşehir", "tr|Galatasaray Spor Kulübü":"Galatasaray", "tr|Fenerbahçe Spor Kulübü":"Fenerbahçe",
  "tr|Yeni Çorumspor Spor Kulübü":"Çorum FK", "tr|Kasımpaşa Spor Kulübü":"Kasımpaşa", "tr|Samsunspor Kulübü":"Samsunspor",
  "tr|Trabzonspor Kulübü":"Trabzonspor", "tr|Göztepe Spor Kulübü":"Göztepe", "tr|Alanyaspor Kulübü":"Alanyaspor",
  "tr|Gazişehir Gaziantep Futbol Kulübü":"Gaziantep FK"
};
