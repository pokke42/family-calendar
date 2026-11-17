import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importCalendar, visibleEvents, startOfWeek, localDate, safeUrl } from '../src/calendar.js';

const source = { id: 'school', people: ['3'], category: 'school' };
const calendar = events => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Hemma//Tests//SV\r\n${events}\r\nEND:VCALENDAR`;
const event = properties => `BEGIN:VEVENT\r\n${properties}\r\nEND:VEVENT`;
const from = new Date('2026-11-17T12:00:00Z');

test('person, category and source filters intersect and preserve overlapping events', () => {
  const events = [
    { id: 'overnight', start: '2026-11-15T23:00:00Z', end: '2026-11-16T08:00:00Z', people: ['3', '4'], category: 'school', sourceId: 'school' },
    { id: 'sport', start: '2026-11-16T17:00:00Z', end: '2026-11-16T18:00:00Z', people: ['3'], category: 'sport', sourceId: 'football' },
    { id: 'next-week', start: '2026-11-23T10:00:00Z', end: '2026-11-23T11:00:00Z', people: ['3'], category: 'school', sourceId: 'school' }
  ];
  const monday = new Date('2026-11-16T00:00:00Z');
  assert.deepEqual(visibleEvents(events, monday, ['4'], ['school'], ['school']).map(e => e.id), ['overnight']);
  assert.equal(visibleEvents(events, monday, [], ['school'], ['school']).length, 0);
  assert.equal(visibleEvents(events, monday, ['3'], ['school'], ['football']).length, 0);
});

test('week starts on Monday, including Sunday and a year boundary', () => {
  assert.equal(localDate(startOfWeek(new Date(2027, 0, 3, 12))), '2026-12-28');
  assert.equal(localDate(startOfWeek(new Date(2026, 10, 16, 12))), '2026-11-16');
});

test('imports Outlook/iCloud UTC events with text, location and a safe activity link', () => {
  const imported = importCalendar(calendar(event('UID:one\r\nDTSTART:20261118T080000Z\r\nDTEND:20261118T090000Z\r\nSUMMARY:Matematik\r\nLOCATION:Rum 2\r\nURL:https://example.org/activity/1')), source, from);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].start, '2026-11-18T08:00:00.000Z');
  assert.equal(imported[0].title, 'Matematik');
  assert.deepEqual(imported[0].people, ['3']);
  assert.equal(imported[0].url, 'https://example.org/activity/1');
});

test('expands weekly school schedules while respecting EXDATE and moved lessons', () => {
  const master = event('UID:weekly\r\nDTSTART:20261116T080000Z\r\nDTEND:20261116T090000Z\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE:20261123T080000Z\r\nSUMMARY:Lektion');
  const exception = event('UID:weekly\r\nRECURRENCE-ID:20261130T080000Z\r\nDTSTART:20261130T100000Z\r\nDTEND:20261130T110000Z\r\nSUMMARY:Flyttad lektion');
  const imported = importCalendar(calendar(master + '\r\n' + exception), source, from);
  assert.equal(imported.length, 3);
  assert.equal(imported.find(e => e.title === 'Flyttad lektion').start, '2026-11-30T10:00:00.000Z');
  assert.ok(!imported.some(e => e.start.includes('2026-11-23')));
});

test('keeps all-day exclusive end dates, and excludes cancelled activities', () => {
  const allDay = event('UID:holiday\r\nDTSTART;VALUE=DATE:20261118\r\nDTEND;VALUE=DATE:20261120\r\nSUMMARY:Lov');
  const cancelled = event('UID:cancelled\r\nDTSTART:20261119T080000Z\r\nDTEND:20261119T090000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Inställt');
  const imported = importCalendar(calendar(allDay + '\r\n' + cancelled), source, from);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].allDay, true);
  assert.equal(localDate(new Date(imported[0].end)), '2026-11-20');
});

test('supports VTIMEZONE across daylight saving transitions', () => {
  const zone = 'BEGIN:VTIMEZONE\r\nTZID:Europe/Stockholm\r\nBEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE';
  const lesson = event('UID:dst\r\nDTSTART;TZID=Europe/Stockholm:20261019T080000\r\nDTEND;TZID=Europe/Stockholm:20261019T090000\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nSUMMARY:Skola');
  const imported = importCalendar(calendar(zone + '\r\n' + lesson), source, new Date('2026-10-01T12:00:00Z'));
  assert.equal(imported[0].start, '2026-10-19T06:00:00.000Z');
  assert.equal(imported[1].start, '2026-10-26T07:00:00.000Z');
});

test('bounds import time range and refuses excessive recurrence expansion', () => {
  const old = event('UID:old\r\nDTSTART:20200101T080000Z\r\nDTEND:20200101T090000Z\r\nSUMMARY:Gammal');
  assert.equal(importCalendar(calendar(old), source, from).length, 0);
  const excessive = event('UID:excessive\r\nDTSTART:20261117T080000Z\r\nDTEND:20261117T080001Z\r\nRRULE:FREQ=SECONDLY\r\nSUMMARY:För många');
  assert.throws(() => importCalendar(calendar(excessive), source, from), /För många|omfattande/);
});

test('rejects malformed and oversized files and unsafe URL schemes', () => {
  assert.throws(() => importCalendar('invalid calendar', source, from));
  assert.throws(() => importCalendar('a'.repeat(2_000_001), source, from), /stor/);
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('http://example.org'), '');
  assert.equal(safeUrl('https://example.org/activity'), 'https://example.org/activity');
});

test('rejects undefined timezones instead of silently shifting imported lessons', () => {
  const lesson = event('UID:unknown-zone\r\nDTSTART;TZID=Unknown/Zone:20261118T080000\r\nDTEND;TZID=Unknown/Zone:20261118T090000\r\nSUMMARY:Skola');
  assert.throws(() => importCalendar(calendar(lesson), source, from), /Tidszonen/);
});
