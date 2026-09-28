# WI-020 - compliance check, 2026-09-13

Price source: https://www.sports.ru/fantasy/football/europa-league/ - GraphQL current season 86, canonical league 73 / 2026/2027. The standard Sports sync and mapping service was used. The original snapshot before import is saved in pre-import-backup.zip.

Was: 0 prices and pictures of the LE pool. First pass: 538 matches, 496 passes; calendar 48/144. After checking the Russian names of 36 clubs, names within the club, permanent providerStatPlayerId and dates of birth: 1034/1034, calendar 144/144. Re-import did not require any corrections. Unique playerIds are checked separately.

## Complex cases

- Alex Lebarbier: Fixed false automatic link from Alex Remiro 892379 to 1426185. Verified against a permanent Sports ID and an existing match from another tournament. Remiro got his own line. The first mapping apply stopped after 163 records on a uniqueness conflict; the correct communication release sequence allowed the remaining 334 to be completed. The error and recovery are reflected in mapping-result.txt and mapping-plan.json.
- Tiago Silva (Lyon): defender Tiago Goncalves 1793701, not goalkeeper Thiago da Silva. https://www.fotmob.com/nb/players/1793701/tiago-goncalves and https://theanalyst.com/players/12373/tiago-goncalves. Sports date differs from external source; the dates are not rewritten and are separated by source in Excel.
- Anderlecht Noah/Noa: current LE roster cards 2011192 and 2140826 were selected, other existing cards were not merged. https://www.fotmob.com/players/2011192/noah and https://www.rsca.be/nl/player/1022.
- Mustafa Azem Yortaç: full name confirmed by TFF https://www.tff.org/Default.aspx?kisiId=2143735&pageId=30.
- Callum McGregor 111060: technical name "FotMob player 111060" replaced by real name: https://www.fotmob.com/en-GB/players/111060/callum-mcgregor.

## New cards

Added five verified FotMob IDs: Jonás Topic 1832877, Omar Sarr 1909894, Michiel Haentjens 1688533, Cumali Gursel 2097460, Tilen Letonja 2130513. Checking cards:

- https://www.fotmob.com/players/1832877/jonas-topic
- https://www.fotmob.com/en-GB/players/1909894/omar-sarr
- https://www.fotmob.com/players/1688533/michiel-haentjens
- https://www.fotmob.com/players/2097460/cumali-gursel
- https://www.fotmob.com/ar/players/2130513/tilen-letonja (ID obtained from the link from the FotMob statistics table).

Lukás Franc 1962099 already existed and reused: https://www.fotmob.com/de/players/1962099/lukas-franc.

For seven players without a confirmed match in the full server catalog, sports_ru-only cards were created according to the accepted scheme 8000000000000000 + providerPlayerId: 75500, 76285, 75980, 75518, 75519, 76291, 76307. Not passed off as FotMob; no dummy statistics were created. Total in the pool 8 sports-only cards, including one existing one.

Roster: 56 added, 21 activated, 1 old entry of another club deactivated. All 1034 players with a price are active in the corresponding club.

## Data Basis and Limitations

Staff SorareInside sync is limited leagueSeason 73 / 2026/2027; other tournaments remained unchanged. Applyed 10 lineups for 11 players. For 9 teams there was no forecast for the next match; for 17 there was no match or corresponding team in the source. Line-ups refer to the team's nearest match, including national tournaments, and not necessarily the League of Legends. Status, opponent, date and link are displayed in Excel.

The previously existing restriction NO_DATA_QUALITY_AUDIT has been retained in the metadata of the server pool. Loading prices and materializing the pool is successful; this is not a statement of complete coverage of historical statistics. Excel season totals only include downloaded completed matches. Emptiness was not replaced by zero.

## Excel

984 source rows, 977 matched without duplicate IDs; 895 with the current price, 82 without it. Lines 62, 181, 200, 241, 485, 497, 515 are not confirmed. There are two candidates for S. Džumhur; abbreviation does not resolve ambiguity. The rest did not receive fictitious connections. Details in the “Server Fields” sheet.

The original A:B, lines, styles, dimensions and Log Sheet are saved. There are no headings in the original: the titles C:FY are placed on a new sheet so as not to shift any of the original lines. 179 new columns created via Artifact Tool; During assembly, the original XML cells and the unchanged XML Log Sheet are preserved. An independent review compared 2280 of the original cells and 176136 of the new cells. XLSX re-imported and rendered to check compatibility.
