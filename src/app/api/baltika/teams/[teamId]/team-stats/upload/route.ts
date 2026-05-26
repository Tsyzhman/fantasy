import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { readFormDataOrNull } from "@/lib/request-form-data";
import { importWyscoutTeamStatsForTeam } from "@/server/baltika/workbook-imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    teamId: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { teamId } = await params;
  const formData = await readFormDataOrNull(request);
  if (!formData) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Upload form data is required." } }, { status: 400 });
  }

  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", message: "Upload a Wyscout Team Stats .xlsx file in the file field." } },
      { status: 400 }
    );
  }

  const result = await importWyscoutTeamStatsForTeam(teamId, {
    buffer: Buffer.from(await upload.arrayBuffer()),
    fileName: upload.name,
    mimeType: upload.type || null,
    sizeBytes: upload.size,
    seasonId: String(formData.get("seasonId") ?? "")
  });

  return NextResponse.json(result.payload, { status: result.status });
}
