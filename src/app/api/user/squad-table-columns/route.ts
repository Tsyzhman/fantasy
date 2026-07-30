import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";
import { isSquadTableColumnsInput, isSquadTableColumnWidthsInput, parseSquadTableColumnWidths, squadTableColumnsPreference } from "@/machete/squad-table-columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  if (!isSquadTableColumnsInput(body.columns)) {
    return jsonError("BAD_REQUEST", "columns must contain valid squad-table column keys.", 400);
  }
  if (body.widths !== undefined && !isSquadTableColumnWidthsInput(body.widths)) {
    return jsonError("BAD_REQUEST", "widths must contain valid squad-table column widths.", 400);
  }
  const columnPreference = squadTableColumnsPreference(body.columns);
  const columns = columnPreference.columns;
  const widths = body.widths === undefined ? undefined : parseSquadTableColumnWidths(body.widths);
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { squadTableColumns: columnPreference, ...(widths ? { squadTableColumnWidths: widths } : {}) }
  });
  return NextResponse.json({ columns, ...(widths ? { widths } : {}) });
});
