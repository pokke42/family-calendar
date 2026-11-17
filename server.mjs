import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CalendarConnections } from './integrations/store.mjs';
import { serveConnections } from './integrations/api.mjs';
import { ingressBase } from './integrations/ingress.mjs';
process.env.TZ ||= 'Europe/Stockholm';
const store = new CalendarConnections(process.env.CALENDAR_STORE || fileURLToPath(new URL('./.local/connections.json', import.meta.url)), {
  extraHosts: (process.env.CALENDAR_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean)
});
await store.load();
store.sync().catch(() => console.error('Kalendersynk kunde inte slutföras.'));
setInterval(() => store.sync().catch(() => console.error('Kalendersynk kunde inte slutföras.')), 15 * 60 * 1000).unref();
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/ical.js.LICENSE.txt': ['ical.js.LICENSE.txt', 'text/plain'] };
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) { await serveConnections(req, res, pathname, store, process.env.CALENDAR_LAN_HOST, process.env.HA_INGRESS === '1'); return; }
  const file = files[pathname];
  if (!file) { res.writeHead(404).end('Not found'); return; }
  try {
    let body = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
    const base = ingressBase(req, process.env.HA_INGRESS === '1');
    if (base && file[1] === 'text/html') body = body.toString().replace('<head>', `<head><base href="${base}">`);
    const framePolicy = process.env.HA_INGRESS === '1' ? "'self'" : "'none'";
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors ${framePolicy}` });
    res.end(body);
  } catch { res.writeHead(503).end('Run npm run build first.'); }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('Family calendar listening on port ' + (process.env.PORT || 3000));
  if (process.env.CALENDAR_LAN_HOST) console.log(`Öppna på iPaden på samma Wi-Fi: http://${process.env.CALENDAR_LAN_HOST}:${process.env.PORT || 3000}`);
});
