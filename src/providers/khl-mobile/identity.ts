/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

export function parseKhlIdentity(raw: string, id: string) {
  if (!/^\d{1,12}$/.test(id)) throw new Error('KHL_BIO_SCOPE_INVALID');
  const payload = JSON.parse(raw), data = payload?.data?.DATA;
  if (payload?.status !== 'success' || typeof data?.pagelink !== 'string' || !data.pagelink.startsWith(`/players/${id}/`)) throw new Error('KHL_BIO_ID_INVALID');
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(data.birthdate ?? '');
  const birthDate = parts && `${parts[3]}-${parts[2]}-${parts[1]}`;
  if (!birthDate || !Number.isFinite(Date.parse(birthDate)) || new Date(birthDate).toISOString().slice(0, 10) !== birthDate) throw new Error('KHL_BIO_DATE_INVALID');
  return { id, name: `${data.lastname} ${data.firstname}`, birthDate, source: `https://www.khl.ru/players/${id}/` };
}

export async function fetchKhlIdentity(id: string) {
  if (!/^\d{1,12}$/.test(id)) throw new Error('KHL_BIO_SCOPE_INVALID');
  const raw = await new Promise<string>((accept, reject) => {
    execFile(process.env.KHL_HTTP_PYTHON ?? '/opt/khl-http/bin/python3', [resolve('scripts/khl-protocol-http.py'), 'player', id],
      { timeout: 55000, killSignal: 'SIGKILL', maxBuffer: 5 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
      (error, stdout) => error ? reject(new Error('KHL_BIO_TRANSPORT_FAILED')) : accept(stdout));
  });
  return parseKhlIdentity(raw, id);
}
