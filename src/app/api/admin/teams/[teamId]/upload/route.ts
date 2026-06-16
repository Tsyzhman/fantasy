import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { multipartBodyLimitForFileBytes, readFormDataWithLimit } from "@/lib/request-form-data";
import { getMaxWorkbookUploadBytes, getMaxWorkbookUploadMb, importWyscoutPlayersForTeam } from "@/server/baltika/workbook-imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    teamId: string;
  }>;
};

export const POST = withApiHandler(async (request: Request, { params }: Params) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { teamId } = await params;
  const maxUploadMb = getMaxWorkbookUploadMb();
  const maxUploadBytes = getMaxWorkbookUploadBytes();
  const formDataResult = await readFormDataWithLimit(request, {
    maxBodyBytes: multipartBodyLimitForFileBytes(maxUploadBytes)
  });
  if (!formDataResult.ok) {
    if (formDataResult.reason === "body-too-large") {
      return jsonError("FILE_TOO_LARGE", `Uploads are limited to ${maxUploadMb} MB.`, 400);
    }
    return jsonError("BAD_REQUEST", "Upload form data is required.", 400);
  }
  const formData = formDataResult.formData;

  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return jsonError("MISSING_FILE", "Upload a Wyscout .xlsx file in the file field.", 400);
  }

  if (upload.size > maxUploadBytes) {
    return jsonError("FILE_TOO_LARGE", `Uploads are limited to ${maxUploadMb} MB.`, 400);
  }

  const result = await importWyscoutPlayersForTeam(teamId, {
    buffer: Buffer.from(await upload.arrayBuffer()),
    fileName: upload.name,
    mimeType: upload.type || null,
    sizeBytes: upload.size,
    seasonId: String(formData.get("seasonId") ?? "")
  });

  return NextResponse.json(result.payload, { status: result.status });
});
