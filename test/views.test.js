import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewRange, navigateDate, layoutDayEvents, migrateFamilyNames, migrateSources, localDate, visibleEvents } from '../src/calendar.js';

test('retires old activity filters and migrates local events into Familj without losing them', () => {
  const state = migrateSources({ sources: [{ id: 'football' }, { id: 'gym' }, { id: 'manual' }, { id: 'icloud', name: 'Gemensam kalender' }, { id: 'emil-sportadmin' }], events: [
    { id: 'old-sport', sourceId: 'football' }, { id: 'old-gym', sourceId: 'gym' }, { id: 'local', sourceId: 'manual' }, { id: 'actual', sourceId: 'emil-sportadmin' }
  ] });
  assert.deepEqual(state.sources.map(s => s.id), ['icloud', 'emil-sportadmin']);
  assert.equal(state.sources[0].name, 'Familj');
  assert.deepEqual(state.sources[0].people, ['1']);
  assert.deepEqual(state.events.map(e => e.id), ['local', 'actual']);
  assert.equal(state.events[0].sourceId, 'icloud');
});

test('month includes 42 Monday-first cells, including adjacent month events', () => {
  const { start, end } = viewRange(new Date(2026, 10, 17), 'month');
  assert.equal(localDate(start), '2026-10-26');
  assert.equal(localDate(end), '2026-12-07');
  const events = [{ start: new Date(2026, 9, 27, 8).toISOString(), end: new Date(2026, 9, 27, 9).toISOString(), people: ['1'], category: 'family', sourceId: 'icloud' }];
  assert.equal(visibleEvents(events, start, ['1'], ['family'], ['icloud'], end).length, 1);
});

test('month navigation clamps dates rather than skipping February; day and week preserve focus', () => {
  assert.equal(localDate(navigateDate(new Date(2026, 0, 31), 'month', 1)), '2026-02-28');
  assert.equal(localDate(navigateDate(new Date(2028, 0, 31), 'month', 1)), '2028-02-29');
  assert.equal(localDate(navigateDate(new Date(2026, 11, 17), 'month', 1)), '2027-01-17');
  assert.equal(localDate(navigateDate(new Date(2026, 10, 17), 'week', 1)), '2026-11-24');
  const day = viewRange(new Date(2026, 10, 17, 12), 'day');
  assert.equal(localDate(day.start), '2026-11-17');
  assert.equal(localDate(day.end), '2026-11-18');
});

test('overlapping school schedules use separate lanes; touching events regain full width', () => {
  const day = new Date(2026, 10, 17);
  const event = (id, start, end) => ({ id, start: new Date(2026, 10, 17, start).toISOString(), end: new Date(2026, 10, 17, end).toISOString() });
  const result = layoutDayEvents([event('school-1', 8, 14), event('school-2', 9, 15), event('sport', 15, 16)], day);
  assert.deepEqual(result.map(e => [e.event.id, e.column, e.columns]), [['school-1', 0, 2], ['school-2', 1, 2], ['sport', 0, 1]]);
  assert.equal(result[0].top, 480);
  assert.equal(result[0].bottom, 840);
});

test('overnight events are clipped per day and all-day events stay outside the timeline', () => {
  const event = { id: 'overnight', start: new Date(2026, 10, 16, 23).toISOString(), end: new Date(2026, 10, 17, 2).toISOString() };
  const allDay = { ...event, id: 'all-day', allDay: true };
  const items = layoutDayEvents([event, allDay], new Date(2026, 10, 17));
  assert.equal(items.length, 1);
  assert.equal(items[0].top, 0);
  assert.equal(items[0].bottom, 120);
});

test('merges adult labels while preserving child identities', () => {
  const people = [{ id: '1', name: 'Jag' }, { id: '2', name: 'Min fru' }, { id: '3', name: 'Barn 1' }, { id: '4', name: 'Barn 2' }];
  assert.deepEqual(migrateFamilyNames(people).map(p => p.name), ['Håkan & Johanna', 'Olle', 'Emil']);
  people[0].name = 'Eget namn';
  assert.equal(migrateFamilyNames(people)[0].name, 'Håkan & Johanna');
  assert.equal(people[1].name, 'Min fru');
});
