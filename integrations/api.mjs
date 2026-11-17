const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
export function isLanReader(req, host) {
  if (!host || !privateIPv4(host)) return false;
  const address = req.socket.remoteAddress?.replace(/^::ffff:/, '');
  if (!privateIPv4(address)) return false;
  if (req.headers.host !== `${host}:${req.socket.localPort}`) return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  return !req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']);
}
function privateIPv4(address = '') {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
export function isLocalRequest(req) {
  if (!loopback(req.socket.remoteAddress)) return false;
  const allowedHosts = [`localhost:${req.socket.localPort}`, `127.0.0.1:${req.socket.localPort}`, `[::1]:${req.socket.localPort}`];
  if (!allowedHosts.includes(req.headers.host)) return false;
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  return true;
}
export async function serveConnections(req, res, pathname, store, lanHost) {
  const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
  const local = isLocalRequest(req);
  if (req.method === 'GET' && pathname === '/api/connections' && (local || isLanReader(req, lanHost))) {
    json(200, { connections: store.snapshot(), calendars: store.calendars, readOnly: !local }); return;
  }
  if (!local) { json(403, { error: 'Kalenderanslutningar kan bara hanteras lokalt på serverdatorn. Öppna appen via localhost.' }); return; }
  if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') { json(405, { error: 'Begäran stöds inte.' }); return; }
  if (!['/api/connections', '/api/connections/templates', '/api/connections/setup', '/api/connections/sync', '/api/connections/disconnect'].includes(pathname)) { json(404, { error: 'Okänd anslutningsfunktion.' }); return; }
  let body = '';
  try {
    for await (const chunk of req) { body += chunk.toString(); if (body.length > (pathname.endsWith('/templates') ? 2000000 : 12000)) { json(413, { error: 'Begäran är för stor.' }); return; } }
    let input; try { input = JSON.parse(body); } catch { json(400, { error: 'Ogiltig begäran.' }); return; }
    if (!input || typeof input !== 'object') { json(400, { error: 'Ogiltig begäran.' }); return; }
    if (pathname.endsWith('/templates')) {
      await store.saveCalendars(input.calendars);
      json(200, { connections: store.snapshot(), calendars: store.calendars }); return;
    }
    if (!['/api/connections', '/api/connections/setup'].includes(pathname) && (typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id))) { json(400, { error: 'Välj en kalenderkälla.' }); return; }
    const connections = pathname.endsWith('/sync') ? await store.sync(input.id) : pathname.endsWith('/disconnect') ? await store.disconnect(input.id) : await store.connect(input, { allowPending: pathname.endsWith('/setup') });
    json(200, { connections });
  } catch (error) {
    // Only our domain errors are safe; filesystem and networking errors may contain private paths.
    json(400, { error: error.code ? 'Anslutningen kunde inte sparas eller hämtas.' : error.message });
  }
}
