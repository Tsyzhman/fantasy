export async function readFormDataOrNull(request: Request): Promise<FormData | null> {
  return request.formData().catch(() => null);
}
