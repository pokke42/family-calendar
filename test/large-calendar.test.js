import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { importCalendar } from '../src/calendar.js';
import { importServerCalendar } from '../integrations/server-calendar.mjs';
import { readCalendarBody } from '../integrations/feed.mjs';
import { CalendarConnections } from '../integrations/store.mjs';
import { diagnoseConnection } from '../integrations/diagnose.mjs';
import { MAX_SERVER_CALENDAR_BYTES } from '../integrations/limits.mjs';

const source = { id: 'icloud', name: 'Familj', provider: 'Apple / iCloud', people: ['1', '2'], category: 'family' };
const from = new Date('2026-11-17T12:00:00Z');

test('large iCloud-style history syncs on server while browser keeps its 2 MB limit and cache stays compact', async t => {
  const old = Array.from({ length: 2200 }, (_, i) => `BEGIN:VEVENT\r\nUID:history-${i}\r\nDTSTART:20100101T080000Z\r\nDTEND:20100101T090000Z\r\nSUMMARY:Historik\r\nDESCRIPTION:${'x'.repeat(1000)}\r\nEND:VEVENT\r\n`).join('');
  const recent = 'BEGIN:VEVENT\r\nUID:current\r\nDTSTART:20261118T080000Z\r\nDTEND:20261118T090000Z\r\nSUMMARY:Aktuell aktivitet\r\nEND:VEVENT\r\n';
  const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${old}${recent}END:VCALENDAR\r\n`;
  assert.ok(Buffer.byteLength(text) > 2_000_000);
  assert.throws(() => importCalendar(text, source, from), /2 MB/);
  const downloaded = await readCalendarBody(Readable.from([Buffer.from(text)]));
  assert.equal(importServerCalendar(downloaded, source, from).length, 1);
  const directory = await mkdtemp(path.join(tmpdir(), 'hemma-large-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new CalendarConnections(path.join(directory, 'store.json'), { fetchFeed: async () => downloaded, now: () => from });
  await store.connect({ source, url: 'https://p71-caldav.icloud.com/published/test' });
  assert.equal(store.snapshot()[0].events.length, 1);
  assert.equal(store.snapshot()[0].events[0].title, 'Aktuell aktivitet');
  assert.ok(JSON.stringify(store.snapshot()).length < 2000);
  assert.ok((await readFile(store.file, 'utf8')).length < 3000);
  assert.equal((await diagnoseConnection({ source, url: 'unused' }, async () => downloaded)).ok, true);
});

test('server download accepts exactly 20 MB, rejects larger streams, and counts UTF-8 bytes on import', async () => {
  const prefix = Buffer.from('BEGIN:VCALENDAR\r\n');
  const atLimit = Buffer.concat([prefix, Buffer.alloc(MAX_SERVER_CALENDAR_BYTES - prefix.length, 32)]);
  assert.equal(Buffer.byteLength(await readCalendarBody(Readable.from([atLimit]))), MAX_SERVER_CALENDAR_BYTES);
  await assert.rejects(readCalendarBody(Readable.from([atLimit, Buffer.from('x')])), error => error.code === 'SIZE');
  assert.throws(() => importServerCalendar('å'.repeat(10_000_001), source, from), /20 MB/);
  await assert.rejects(readCalendarBody(Readable.from([Buffer.from('<html>login</html>')])), error => error.code === 'NOT_CALENDAR');
});
