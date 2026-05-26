import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFormDataOrNull } from "@/lib/request-form-data";
import { importFantasyPriceWorkbook } from "@/machete/fantasy_price_sheet_import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const formData = await readFormDataOrNull(request);
  if (!formData) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Upload form data is required." } }, { status: 400 });
  }

  const leagueId = parseBigInt(formData.get("leagueId"));
  const season = stringValue(formData.get("season"));
  const file = formData.get("file");
  if (!leagueId || !season) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "leagueId and season are required." } }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "XLSX file is required." } }, { status: 400 });
  }

  const maxBytes = maxUploadBytes();
  if (file.size > maxBytes) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` } }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

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
    return NextResponse.json(
      {
        error: {
          code: "IMPORT_FAILED",
          message: error instanceof Error ? error.message : "Failed to import price sheet."
        }
      },
      { status: 400 }
    );
  }
}

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
