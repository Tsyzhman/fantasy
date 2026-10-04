/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#api */
import { requireApiUser } from "@/lib/auth";
import { parseFilters } from "@/franchises/analytics";
import { loadSnapshot } from "@/server/franchises/snapshot";
import { franchiseReportCache } from "@/server/franchises/report-cache";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  let snapshot;
  try {
    snapshot = await loadSnapshot();
  } catch (error) {
    console.error(
      "Franchise snapshot unavailable",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      {
        error:
          "Данные франшиз ещё не собраны или снимок недоступен. Повторите позже.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  let filters;
  try {
    filters = parseFilters(new URL(request.url).searchParams, snapshot.leagues);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Некорректные фильтры",
      },
      { status: 400 },
    );
  }
  return new Response(franchiseReportCache.get(snapshot, filters), {
    headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json" },
  });
}
