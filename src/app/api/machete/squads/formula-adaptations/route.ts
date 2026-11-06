import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#retired-projections */
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
