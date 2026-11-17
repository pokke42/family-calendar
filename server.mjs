import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/ical.js.LICENSE.txt': ['ical.js.LICENSE.txt', 'text/plain'] };
http.createServer(async (req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(body);
  } catch { res.writeHead(503).end('Run npm run build first.'); }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Family calendar listening on port ' + (process.env.PORT || 3000)));
