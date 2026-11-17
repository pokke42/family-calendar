import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CalendarConnections } from './integrations/store.mjs';
import { serveConnections } from './integrations/api.mjs';
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
  if (pathname.startsWith('/api/')) { await serveConnections(req, res, pathname, store); return; }
  const file = files[pathname];
  if (!file) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(body);
  } catch { res.writeHead(503).end('Run npm run build first.'); }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Family calendar listening on port ' + (process.env.PORT || 3000)));
