import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Old open tabs may still request these tooltips. Never rebuild a retired
// formula (or the entire player pool) in response to such a request.
export const GET = withApiHandler(async () => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const response = jsonError(
    "FORMULA_RETIRED",
    "Position-calibrated and Joint forecasts have been retired. FFO, FO and ALT remain available.",
    410
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
