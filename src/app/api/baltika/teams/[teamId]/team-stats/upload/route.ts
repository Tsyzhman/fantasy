import { NextResponse } from "next/server";

import { importWyscoutTeamStatsForTeam } from "@/server/baltika/workbook-imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: {
    teamId: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  const formData = await request.formData();
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", message: "Upload a Wyscout Team Stats .xlsx file in the file field." } },
      { status: 400 }
    );
  }

  const result = await importWyscoutTeamStatsForTeam(params.teamId, {
    buffer: Buffer.from(await upload.arrayBuffer()),
    fileName: upload.name,
    mimeType: upload.type || null,
    sizeBytes: upload.size,
    seasonId: String(formData.get("seasonId") ?? "")
  });

  return NextResponse.json(result.payload, { status: result.status });
}
