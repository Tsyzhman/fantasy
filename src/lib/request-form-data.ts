const defaultMultipartOverheadBytes = 1024 * 1024;

export type FormDataReadResult =
  | {
      ok: true;
      formData: FormData;
    }
  | {
      ok: false;
      reason: "body-too-large" | "invalid-form-data";
      maxBodyBytes?: number;
    };

export async function readFormDataOrNull(request: Request): Promise<FormData | null> {
  return request.formData().catch(() => null);
}

export async function readFormDataWithLimit(
  request: Request,
  options: {
    maxBodyBytes: number;
  }
): Promise<FormDataReadResult> {
  if (requestBodyExceedsLimit(request, options.maxBodyBytes)) {
    return { ok: false, reason: "body-too-large", maxBodyBytes: options.maxBodyBytes };
  }

  const formData = await readFormDataOrNull(request);
  return formData ? { ok: true, formData } : { ok: false, reason: "invalid-form-data" };
}

export function multipartBodyLimitForFileBytes(maxFileBytes: number, fileCount = 1) {
  const safeFileCount = Number.isInteger(fileCount) && fileCount > 0 ? fileCount : 1;
  return maxFileBytes * safeFileCount + defaultMultipartOverheadBytes;
}

function requestBodyExceedsLimit(request: Request, maxBodyBytes: number) {
  if (!Number.isFinite(maxBodyBytes) || maxBodyBytes <= 0) return false;

  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;

  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed > maxBodyBytes;
}
