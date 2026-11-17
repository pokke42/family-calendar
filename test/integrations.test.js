import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { normalizeFeedUrl, publicIPv4 } from '../integrations/feed.mjs';
import { CalendarConnections } from '../integrations/store.mjs';
import { serveConnections, isLocalRequest, isLanReader } from '../integrations/api.mjs';

test('LAN mode only allows same-origin readers on the explicitly configured private address', async t => {
  const store = await fixture(t, async () => feed());
  await store.connect({ source, url });
  const calendars = [{ source: { ...source, id: 'weekly' }, ics: feed() }];
  await store.saveCalendars(calendars);
  const restored = new CalendarConnections(store.file); await restored.load();
  assert.deepEqual(restored.calendars, calendars);
  const req = { method: 'GET', socket: { remoteAddress: '192.168.1.50', localPort: 3000 }, headers: { host: '192.168.1.20:3000' } };
  assert.equal(isLanReader(req, '192.168.1.20'), true);
  assert.equal(isLanReader(req, undefined), false);
  assert.equal(isLanReader({ ...req, headers: { host: 'evil.example:3000' } }, '192.168.1.20'), false);
  assert.equal(isLanReader({ ...req, socket: { ...req.socket, remoteAddress: '8.8.8.8' } }, '192.168.1.20'), false);
  assert.equal(isLanReader({ ...req, headers: { ...req.headers, origin: 'https://evil.example' } }, '192.168.1.20'), false);
  let status, output;
  const res = { writeHead: code => { status = code; }, end: text => { output = JSON.parse(text); } };
  await serveConnections(req, res, '/api/connections', restored, '192.168.1.20');
  assert.equal(status, 200); assert.equal(output.readOnly, true);
  assert.deepEqual(output.calendars, calendars);
  assert.ok(!JSON.stringify(output).includes('secret-test-value'));
  await serveConnections({ ...req, method: 'POST' }, res, '/api/connections/disconnect', restored, '192.168.1.20');
  assert.equal(status, 403); assert.equal(restored.snapshot().length, 1);
});

const source = { id: 'football', name: 'Olles fotboll', provider: 'Svenska Lag', people: ['3'], category: 'sport' };
const url = 'https://www.svenskalag.se/calendar?private=secret-test-value';
const now = () => new Date('2026-11-17T12:00:00Z');
function feed(title = 'Träning', cancelled = false) {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:training\r\nDTSTART:20261118T170000Z\r\nDTEND:20261118T180000Z\r\nSUMMARY:${title}\r\n${cancelled ? 'STATUS:CANCELLED\r\n' : ''}END:VEVENT\r\nEND:VCALENDAR`;
}
async function fixture(t, fetchFeed) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hemma-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new CalendarConnections(path.join(directory, 'connections.json'), { fetchFeed, now });
  await store.load(); return store;
}

test('validates providers, webcal, redirects destinations and rejects private/network-unsafe URLs', () => {
  assert.equal(normalizeFeedUrl('webcal://www.svenskalag.se/calendar', 'Svenska Lag').protocol, 'https:');
  assert.equal(normalizeFeedUrl('webcals://im2-api.infomentor.se/feed', 'InfoMentor').protocol, 'https:');
  assert.equal(normalizeFeedUrl('webcal://p71-caldav.icloud.com/published/2/test', 'Apple / iCloud').protocol, 'https:');
  assert.throws(() => normalizeFeedUrl('https://icloud.com.evil.example/feed', 'Apple / iCloud'));
  assert.equal(normalizeFeedUrl('https://api.sportadmin.se/feed', 'SportAdmin').hostname, 'api.sportadmin.se');
  assert.equal(normalizeFeedUrl('https://schema.school.example/ics', 'InfoMentor', ['schema.school.example']).hostname, 'schema.school.example');
  for (const invalid of ['http://www.svenskalag.se/feed', 'https://svenskalag.se.evil.example/feed', 'https://user:pass@www.svenskalag.se/feed', 'https://127.0.0.1/feed', 'https://www.svenskalag.se:8443/feed']) assert.throws(() => normalizeFeedUrl(invalid, 'Svenska Lag'));
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '224.0.0.1']) assert.equal(publicIPv4(address), false);
  assert.equal(publicIPv4('8.8.8.8'), true);
});

test('private setup retains pending links when a provider is unavailable without exposing them', async t => {
  const store = await fixture(t, async () => { throw new Error('Offline'); });
  await store.connect({ source, url }, { allowPending: true });
  assert.equal(store.snapshot()[0].lastSuccess, null);
  assert.ok(store.snapshot()[0].error);
  assert.ok(!JSON.stringify(store.snapshot()).includes('secret-test-value'));
  store.fetchFeed = async () => feed();
  await store.sync(source.id, true);
  assert.equal(store.snapshot()[0].events.length, 1);
  assert.equal(store.snapshot()[0].error, null);
});

test('connects all three providers, keeps links server-side and restores cached connections after restart', async t => {
  const store = await fixture(t, async () => feed());
  for (const [provider, host] of [['InfoMentor', 'infomentor.se'], ['SportAdmin', 'sportadmin.se'], ['Svenska Lag', 'svenskalag.se']]) {
    await store.connect({ source: { ...source, id: host.replaceAll('.', '-'), provider }, url: `https://${host}/feed?token=private-token` });
  }
  assert.equal(store.snapshot().length, 3);
  assert.ok(!JSON.stringify(store.snapshot()).includes('private-token'));
});

test('refresh replaces updated/deleted events, retains data on failure and disconnects durably', async t => {
  let response = feed();
  const store = await fixture(t, async () => { if (response instanceof Error) throw response; return response; });
  await store.connect({ source, url });
  assert.equal(store.snapshot()[0].events[0].title, 'Träning');
  assert.ok(!JSON.stringify(store.snapshot()).includes('secret-test-value'));
  assert.ok((await readFile(store.file, 'utf8')).includes('secret-test-value'));
  assert.equal((await stat(store.file)).mode & 0o777, 0o600);
  const restored = new CalendarConnections(store.file, { now }); await restored.load();
  assert.equal(restored.snapshot()[0].events.length, 1);
  response = feed('Ny tid'); await store.sync(source.id, true);
  assert.equal(store.snapshot()[0].events.length, 1);
  assert.equal(store.snapshot()[0].events[0].title, 'Ny tid');
  response = new Error(url); await store.sync(source.id, true);
  assert.equal(store.snapshot()[0].events[0].title, 'Ny tid');
  assert.ok(store.snapshot()[0].error);
  assert.ok(!JSON.stringify(store.snapshot()).includes('secret-test-value'));
  await assert.rejects(store.connect({ source, url }));
  assert.equal(store.snapshot()[0].events.length, 1);
  response = feed('Inställt', true); await store.sync(source.id, true);
  assert.equal(store.snapshot()[0].events.length, 0);
  await store.disconnect(source.id);
  await restored.load(); assert.deepEqual(restored.snapshot(), []);
});

test('manual refresh is rate limited and HTML or malformed feeds cannot replace cached data', async t => {
  let count = 0;
  const store = await fixture(t, async () => { count++; return feed(); });
  await store.connect({ source, url });
  await store.sync(source.id); assert.equal(count, 1);
  store.fetchFeed = async () => '<html>Login</html>';
  await store.sync(source.id, true);
  assert.equal(store.snapshot()[0].events.length, 1);
  assert.ok(store.snapshot()[0].error);
});

test('local-only API rejects remote clients, cross-origin writes and DNS rebinding hosts', () => {
  const req = { socket: { remoteAddress: '127.0.0.1', localPort: 3000 }, headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } };
  assert.equal(isLocalRequest(req), true);
  assert.equal(isLocalRequest({ ...req, socket: { ...req.socket, remoteAddress: '192.168.1.50' } }), false);
  assert.equal(isLocalRequest({ ...req, headers: { ...req.headers, origin: 'https://evil.example' } }), false);
  assert.equal(isLocalRequest({ ...req, headers: { host: 'evil.example:3000' } }), false);
});

test('API connects, lists, refreshes and deletes subscriptions without exposing private URLs', async t => {
  const store = await fixture(t, async () => feed());
  const server = http.createServer((req, res) => serveConnections(req, res, new URL(req.url, 'http://localhost').pathname, store));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, data) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(data) });
  const connected = await post('/api/connections', { source, url });
  assert.equal(connected.status, 200);
  assert.ok(!(await connected.text()).includes('secret-test-value'));
  const listed = await (await fetch(base + '/api/connections')).json();
  assert.equal(listed.connections[0].events[0].people[0], '3');
  assert.equal((await post('/api/connections/sync', { id: source.id })).status, 200);
  assert.equal((await post('/api/connections/disconnect', { id: source.id })).status, 200);
  assert.equal((await (await fetch(base + '/api/connections')).json()).connections.length, 0);
});
