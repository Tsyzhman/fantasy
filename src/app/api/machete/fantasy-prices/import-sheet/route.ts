import type ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFormDataOrNull } from "@/lib/request-form-data";
import { importFantasyPriceWorkbook } from "@/machete/fantasy_price_sheet_import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const formData = await readFormDataOrNull(request);
  if (!formData) {
    return jsonError("BAD_REQUEST", "Upload form data is required.", 400);
  }

  const leagueId = parseBigInt(formData.get("leagueId"));
  const season = stringValue(formData.get("season"));
  const file = formData.get("file");
  if (!leagueId || !season) {
    return jsonError("BAD_REQUEST", "leagueId and season are required.", 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("BAD_REQUEST", "XLSX file is required.", 400);
  }

  const maxBytes = maxUploadBytes();
  if (file.size > maxBytes) {
    return jsonError("BAD_REQUEST", `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`, 400);
  }

  const workbook = await readWorkbookFromFile(file);

  try {
    const result = await importFantasyPriceWorkbook(prisma, workbook, {
      leagueId,
      requestedSeason: season,
      sheetName: stringValue(formData.get("sheetName")),
      replace: formData.get("replace") !== "false",
      sourceLabel: file.name
    });

    return NextResponse.json({ import: result });
  } catch (error) {
    return jsonError("IMPORT_FAILED", error instanceof Error ? error.message : "Failed to import price sheet.", 400);
  }
});

function parseBigInt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function maxUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_MB);
  const mb = Number.isFinite(configured) && configured > 0 ? configured : 25;
  return mb * 1024 * 1024;
}

async function readWorkbookFromFile(file: File): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSLib } = await import("exceljs");
  const workbook = new ExcelJSLib.Workbook();
  await workbook.xlsx.load((await file.arrayBuffer()) as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);
  return workbook;
}
