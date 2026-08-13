import { GET as getSquads, POST as postSquad, DELETE as deleteSquad } from "../../squads/route";
import { FPL_LEAGUE_ID, FPL_PROVIDER, FPL_SEASON } from "@/lib/providers/fpl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => getSquads(withFplProvider(request));
export const DELETE = (request: Request) => deleteSquad(withFplProvider(request));
export const POST = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  return postSquad(withFplProvider(request, body));
};

function withFplProvider(request: Request, body?: unknown) {
  const url = new URL(request.url);
  url.searchParams.set("provider", FPL_PROVIDER);
  url.searchParams.set("leagueId", String(FPL_LEAGUE_ID));
  url.searchParams.set("season", FPL_SEASON);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  const init: RequestInit = {
    method: request.method,
    headers
  };
  if (body !== undefined) {
    init.body = JSON.stringify({
      ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
      provider: FPL_PROVIDER,
      leagueId: String(FPL_LEAGUE_ID),
      season: FPL_SEASON
    });
  }
  return new Request(url, init);
}
