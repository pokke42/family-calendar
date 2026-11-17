import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { importCalendar, categories } from '../src/calendar.js';
import { fetchCalendar, normalizeFeedUrl, FeedError } from './feed.mjs';
import { importServerCalendar } from './server-calendar.mjs';

export class CalendarConnections {
  constructor(file, { fetchFeed = fetchCalendar, extraHosts = [], now = () => new Date() } = {}) {
    this.file = file; this.fetchFeed = fetchFeed; this.extraHosts = extraHosts; this.now = now;
    this.connections = []; this.calendars = null; this.queue = Promise.resolve();
  }
  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.connections)) throw new Error('Invalid format');
      this.connections = data.connections;
      this.calendars = data.calendars || null;
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('Anslutningsfilen kunde inte läsas. Originalfilen har inte ändrats.'); }
  }
  serial(action) {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {}); return next;
  }
  async save() {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFile(this.file + '.tmp', JSON.stringify({ version: 1, connections: this.connections, calendars: this.calendars }), { mode: 0o600 });
    await rename(this.file + '.tmp', this.file);
  }
  snapshot() {
    return this.connections.map(({ url, ...connection }) => structuredClone(connection));
  }
  saveCalendars(calendars) {
    return this.serial(async () => {
      if (!Array.isArray(calendars) || calendars.length > 20) throw new Error('Ogiltiga veckoscheman.');
      for (const item of calendars) {
        if (!item?.source || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.source.id) || typeof item.source.name !== 'string' || !Array.isArray(item.source.people) || typeof item.ics !== 'string') throw new Error('Ogiltigt veckoschema.');
        try { importCalendar(item.ics, item.source); } catch { throw new Error('Veckoschemat kunde inte läsas.'); }
      }
      const prior = this.calendars;
      this.calendars = calendars.map(({ source, ics }) => ({ source, ics }));
      try { await this.save(); } catch (error) { this.calendars = prior; throw error; }
    });
  }
  async refresh(connection) {
    connection.lastAttempt = this.now().toISOString();
    let text;
    try {
      text = await this.fetchFeed(connection.url, connection.source.provider, this.extraHosts);
    } catch (error) {
      connection.errorCode = error instanceof FeedError ? error.code : 'FETCH';
      connection.error = error instanceof FeedError ? error.message : 'Kalendern kunde inte hämtas. Kontrollera nätverket och prenumerationslänken på Macen.';
      connection.error += ' Senast hämtade aktiviteter behålls.';
      return;
    }
    try {
      const events = importServerCalendar(text, connection.source, this.now());
      connection.events = events.map(event => ({ ...event, synced: true }));
      connection.lastSuccess = this.now().toISOString(); connection.error = null; connection.errorCode = null;
    } catch (error) {
      const problem = importFailure(error);
      connection.errorCode = problem.code;
      connection.error = problem.message + ' Senast hämtade aktiviteter behålls.';
    }
  }

  connect(input, { allowPending = false } = {}) {
    return this.serial(async () => {
      const source = input.source;
      if (!source || !/^[a-zA-Z0-9_-]{1,100}$/.test(source.id) || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 100 ||
        !Array.isArray(source.people) || !source.people.length || source.people.length > 20 || source.people.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(id)) || !Object.hasOwn(categories, source.category)) {
        throw new Error('Ange en kalenderkälla med namn, person och aktivitetstyp.');
      }
      const url = normalizeFeedUrl(input.url, source.provider, this.extraHosts).href;
      const prior = this.connections.find(item => item.source.id === source.id);
      if (!prior && this.connections.length >= 20) throw new Error('Högst 20 kalenderanslutningar stöds.');
      const connection = { source: { id: source.id, name: source.name, provider: source.provider, people: source.people, category: source.category }, url, events: [], lastSuccess: null, lastAttempt: null, error: null };
      await this.refresh(connection);
      if (connection.error && !allowPending) throw new Error(connection.error);
      const previous = this.connections;
      this.connections = this.connections.filter(item => item.source.id !== source.id).concat(connection);
      try { await this.save(); } catch { this.connections = previous; throw new Error('Anslutningen kunde inte sparas på servern.'); }
      return this.snapshot();
    });
  }
  sync(id, force = false) {
    return this.serial(async () => {
      if (id && !this.connections.some(item => item.source.id === id)) throw new Error('Kalenderanslutningen finns inte.');
      for (const connection of this.connections.filter(item => !id || item.source.id === id)) {
        if (!force && connection.lastAttempt && +this.now() - Date.parse(connection.lastAttempt) < 60000) continue;
        await this.refresh(connection);
      }
      if (this.connections.length) await this.save();
      return this.snapshot();
    });
  }
  disconnect(id) {
    return this.serial(async () => {
      const previous = this.connections;
      this.connections = this.connections.filter(item => item.source.id !== id);
      try { await this.save(); } catch { this.connections = previous; throw new Error('Anslutningen kunde inte tas bort.'); }
      return this.snapshot();
    });
  }
}

// Map parser failures to fixed text; raw parser errors may include private event data.
export function importFailure(error) {
  const message = String(error?.message || '');
  if (/Tidszonen/.test(message)) return { code: 'TIMEZONE', message: 'Kalendern hämtades, men innehåller en tidszon utan definition. Exportera en ICS-fil med tidszon från källtjänsten.' };
  if (/starttid eller kalender-id/.test(message)) return { code: 'EVENT_FIELDS', message: 'Kalendern hämtades, men minst en aktivitet saknar starttid eller kalender-id.' };
  if (/stor/.test(message)) return { code: 'SIZE', message: 'Kalendern hämtades, men överstiger serverns importgräns på 20 MB.' };
  if (/omfattande|För många/.test(message)) return { code: 'RECURRENCE_LIMIT', message: 'Kalendern hämtades, men innehåller för många aktiviteter eller upprepningar för importgränsen.' };
  return { code: 'PARSE', message: 'Kalendern hämtades, men ICS-innehållet kunde inte tolkas.' };
}
