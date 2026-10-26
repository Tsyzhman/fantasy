/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fetchHockeyHistory, parseHockeyHistory, hockeyHistorySeasonId } from "@/providers/sports-ru-hockey/history";
import type { KhlPosition } from "@/khl/contracts";
import { fetchSportsBirthDate } from "@/providers/sports-ru-hockey/identity";

async function main() {
  const evidence = JSON.parse(readFileSync(process.argv[2], "utf8")) as { stdout: string };
  const rows = JSON.parse(evidence.stdout.slice(evidence.stdout.indexOf("["), evidence.stdout.lastIndexOf("]") + 1)) as
    Array<{ providerContestId: string; providerPlayerId: string; providerTagId: string; position: KhlPosition }>;
  const results = [];
  for (const row of rows) {
    try {
      const source = await fetchHockeyHistory(row.providerContestId, row.providerPlayerId);
      const current = parseHockeyHistory(source.html, { tagId: row.providerTagId, season: "2026/2027", position: row.position });
      const tagProfile = current.tagId === null ? { tagId: row.providerTagId, ...(await fetchSportsBirthDate(row.providerTagId)) } : undefined;
      const providerSeasonId = hockeyHistorySeasonId(source.html, "2025/2026");
      if (!providerSeasonId) { results.push({ ...row, status: "ABSENT_SELECTOR" }); continue; }
      const archive = await fetchHockeyHistory(row.providerContestId, row.providerPlayerId, undefined, providerSeasonId);
      const profile = parseHockeyHistory(archive.html, { tagId: row.providerTagId, season: "2025/2026", position: row.position,
        historyOnly: true, verifiedArchiveIdentity: { current, currentUrl: source.url, archiveUrl: archive.url, providerSeasonId, tagProfile } });
      results.push({ ...row, status: "VERIFIED", providerSeasonId, currentName: current.name, archiveName: profile.name,
        rows: profile.rows.length, currentPosition: current.position, archivePosition: profile.position, ...(tagProfile ? { tagProfileUrl: tagProfile.url, tagProfileSource: tagProfile.source } : {}), currentUrl: source.url, archiveUrl: archive.url,
        archiveSha256: createHash("sha256").update(archive.html).digest("hex") });
      if (results.length === 1) {
        writeFileSync("src/providers/sports-ru-hockey/fixtures/history-blank-archive.html", archive.html);
        writeFileSync("src/providers/sports-ru-hockey/fixtures/history-blank-current.html", source.html);
      }
    } catch (error) { results.push({ ...row, status: "REJECTED", error: error instanceof Error ? error.message : "FAILED" }); }
  }
  console.log(JSON.stringify(results, null, 2));
}
main();
