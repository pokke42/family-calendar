import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { MAX_SERVER_CALENDAR_BYTES } from './limits.mjs';

export class FeedError extends Error {
  constructor(code, message) { super(message); this.name = 'FeedError'; this.code = code; }
}
export function networkFailure(error) {
  const code = String(error?.code || '');
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return new FeedError('DNS', 'Kalenderserverns adress kunde inte slås upp (DNS). Kontrollera internetanslutningen och eventuellt VPN på Macen.');
  if (code.includes('CERT') || code.startsWith('ERR_TLS') || code.includes('SELF_SIGNED')) return new FeedError('TLS', 'Säker anslutning till kalendertjänsten misslyckades (TLS). Kontrollera Macens datum och nätverkets certifikat.');
  if (['ABORT_ERR', 'ETIMEDOUT'].includes(code)) return new FeedError('TIMEOUT', 'Kalendertjänsten svarade inte inom 15 sekunder. Försök igen senare.');
  return new FeedError('NETWORK', 'Kalendertjänsten kunde inte nås. Kontrollera internetanslutningen på Macen.');
}

const domains = {
  'Apple / iCloud': ['icloud.com'],
  InfoMentor: ['infomentor.se', 'infomentor.nu'],
  'Svenska Lag': ['svenskalag.se'],
  SportAdmin: ['sportadmin.se']
};
export function normalizeFeedUrl(value, provider, extraHosts = []) {
  let url;
  try { url = new URL(String(value).trim().replace(/^webcals?:/i, 'https:')); }
  catch { throw new Error('Ange en giltig kalenderprenumeration, inte en inloggningssida.'); }
  if (!domains[provider]) throw new Error('Den här tjänsten stöds inte för prenumeration.');
  const host = url.hostname.toLowerCase();
  const allowed = domains[provider].some(domain => host === domain || host.endsWith('.' + domain)) || extraHosts.includes(host);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(host) || !allowed) {
    throw new Error('Länken måste använda HTTPS och tjänstens domän. För en extern schematjänst: lägg till dess exakta värdnamn i CALENDAR_ALLOWED_HOSTS på servern.');
  }
  url.hash = '';
  if (url.href.length > 4096) throw new Error('Kalenderlänken är för lång.');
  return url;
}

export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

// Pin the validated public DNS address to the TLS connection. Revalidate every redirect.
export async function fetchCalendar(value, provider, extraHosts = [], redirects = 0) {
  const url = normalizeFeedUrl(value, provider, extraHosts);
  let addresses;
  let timer;
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { family: 4, all: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject({ code: 'ETIMEDOUT' }), 15000); })
    ]);
  } catch (error) { throw networkFailure(error); } finally { clearTimeout(timer); }
  if (!addresses.length || addresses.some(item => !publicIPv4(item.address))) throw new Error('Kalendervärden måste ha en publik internetadress.');
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const finish = (fn, value) => { clearTimeout(timeout); fn(value); };
    const request = https.get(url, {
      signal: controller.signal,
      lookup: (_host, options, cb) => options.all ? cb(null, [addresses[0]]) : cb(null, addresses[0].address, 4),
      headers: { Accept: 'text/calendar', 'Accept-Encoding': 'identity', 'User-Agent': 'HemmaCalendar/0.2' }
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume(); clearTimeout(timeout);
        if (redirects >= 3 || !response.headers.location) { reject(new Error('Kalenderlänken omdirigeras för många gånger.')); return; }
        let next;
        try { next = new URL(response.headers.location, url).href; } catch { reject(new Error('Ogiltig omdirigering.')); return; }
        fetchCalendar(next, provider, extraHosts, redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200) { response.resume(); finish(reject, new FeedError('HTTP_' + response.statusCode, `Kalendertjänsten svarade HTTP ${response.statusCode}. ${[401, 403, 404, 410].includes(response.statusCode) ? 'Kontrollera att kalendern fortfarande delas och kopiera prenumerationslänken på nytt från källtjänsten.' : 'Försök igen senare.'}`)); return; }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.resume(); finish(reject, new FeedError('ENCODING', 'Kalenderservern skickade komprimerad data trots begäran om okomprimerad kalender.')); return;
      }
      readCalendarBody(response).then(text => finish(resolve, text), error => finish(reject, error));
    });
    request.on('error', error => finish(reject, networkFailure(error)));
  });
}

export async function readCalendarBody(response) {
  let size = 0; const chunks = [];
  try {
    for await (const chunk of response) {
      size += chunk.length;
      if (size > MAX_SERVER_CALENDAR_BYTES) throw new FeedError('SIZE', 'Kalendern överstiger servergränsen på 20 MB.');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError('TRANSFER', 'Överföringen av kalendern avbröts. Försök igen senare.');
  }
  const text = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
  if (!/^\s*BEGIN:VCALENDAR\s*\r?\n/i.test(text)) throw new FeedError('NOT_CALENDAR', 'Länken gav ingen ICS-kalender. Kopiera prenumerationslänken i tjänsten.');
  return text;
}
