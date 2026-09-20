/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#normalization */
import { parse } from 'node-html-parser';

const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function parseSportsBirthDate(html: string, tagId: string) {
  if (!/^\d{1,12}$/.test(tagId) || Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('BIO_SCOPE_INVALID');
  // Parse only the identity fragments, not the large news/comment DOM.
  const tags = [...html.matchAll(/<[^>]+data-control="Stat\.OkkoButton"[^>]*>/g)].map(m => parse(m[0]).querySelector('[data-control]')?.getAttribute('data-tag'));
  if (!tags.length || tags.some(id => id !== tagId)) throw new Error('BIO_TAG_INVALID');
  const fragments = [...html.matchAll(/<table\b[^>]*class="profile-table"[^>]*>[\s\S]*?<\/table>/g)];
  const cells = fragments.flatMap(m => parse(m[0]).querySelectorAll('tr')).filter(r => r.querySelector('th')?.text.trim() === 'Родился');
  if (cells.length !== 1) throw new Error('BIO_DATE_MISSING');
  const match = /^(\d{1,2})\s+([а-я]+)\s+(\d{4})(?:\s|$)/.exec(cells[0].querySelector('td')?.text.trim() ?? '');
  const month = match ? months.indexOf(match[2]) + 1 : 0;
  if (!match || !month) throw new Error('BIO_DATE_INVALID');
  const date = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const time = Date.parse(date);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date || date < '1960-01-01' || date > new Date().toISOString().slice(0, 10)) throw new Error('BIO_DATE_INVALID');
  return date;
}

export async function fetchSportsBirthDate(tagId: string) {
  if (!/^\d{1,12}$/.test(tagId)) throw new Error('BIO_SCOPE_INVALID');
  const source = `https://www.sports.ru/tags/${tagId}/`;
  // Public Sports tag redirects are allowed only within its own HTTPS origin.
  let url = source;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const target = new URL(response.headers.get('location') ?? '', url);
      if (target.origin !== 'https://www.sports.ru' || target.href === url) throw new Error('BIO_REDIRECT_INVALID');
      url = target.href; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`BIO_HTTP_${response.status}`); }
    if (!response.body) throw new Error('BIO_BODY_MISSING');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2 * 1024 * 1024) throw new Error('BIO_BODY_TOO_LARGE'); chunks.push(value); }
    } finally { await reader.cancel(); }
    return { birthDate: parseSportsBirthDate(Buffer.concat(chunks).toString('utf8'), tagId), source, url };
  }
  throw new Error('BIO_REDIRECT_LIMIT');
}
