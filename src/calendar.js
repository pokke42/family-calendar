import ICAL from 'ical.js';

export const categories = { school: 'Skola', sport: 'Idrott', family: 'Familj', other: 'Övrigt' };
export const retiredSources = ['football', 'gym', 'manual'];
export function migrateSources(state) {
  state.sources = state.sources.filter(source => !retiredSources.includes(source.id));
  const family = { id: 'icloud', name: 'Familj', provider: 'Apple / iCloud', people: ['1', '2'], category: 'family' };
  const existing = state.sources.find(source => source.id === 'icloud');
  if (existing) Object.assign(existing, family); else state.sources.unshift(family);
  state.events = state.events.filter(event => !['football', 'gym'].includes(event.sourceId))
    .map(event => event.sourceId === 'manual' ? { ...event, sourceId: 'icloud' } : event);
  return state;
}
export function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function startOfWeek(date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7); return start;
}
export function addDays(date, amount) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
export function visibleEvents(events, start, people, selectedCategories, sources, end = addDays(start, 7)) {
  return events.filter(event => new Date(event.start) < end && new Date(event.end) > start &&
    event.people.some(id => people.includes(id)) && selectedCategories.includes(event.category) && sources.includes(event.sourceId))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}
export function viewRange(date, view) {
  if (view === 'month') {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = startOfWeek(first);
    return { start, end: addDays(start, 42) };
  }
  const start = view === 'day' ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : startOfWeek(date);
  return { start, end: addDays(start, view === 'day' ? 1 : 7) };
}
export function navigateDate(date, view, direction) {
  if (view !== 'month') return addDays(date, direction * (view === 'day' ? 1 : 7));
  const target = new Date(date.getFullYear(), date.getMonth() + direction, 1);
  target.setDate(Math.min(date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  return target;
}
export function migrateFamilyNames(people) {
  const defaults = { '1': ['Jag', 'Håkan'], '2': ['Min fru', 'Johanna'], '3': ['Barn 1', 'Olle'], '4': ['Barn 2', 'Emil'] };
  return people.map(person => ({ ...person, name: defaults[person.id]?.[0] === person.name ? defaults[person.id][1] : person.name }));
}

// Lay out connected overlap groups independently. Events touching at their ends do not overlap.
export function layoutDayEvents(events, day) {
  const tomorrow = addDays(day, 1);
  const minutes = date => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const items = events.filter(e => !e.allDay && new Date(e.start) < tomorrow && new Date(e.end) > day)
    .map(event => {
      const start = new Date(event.start), end = new Date(event.end);
      const top = start < day ? 0 : minutes(start);
      const bottom = end >= tomorrow ? 1440 : Math.max(top + 1, minutes(end));
      return { event, top, bottom, column: 0, columns: 1 };
    }).sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let group = [], groupEnd = -1;
  function finish() {
    const ends = [];
    group.forEach(item => {
      let column = ends.findIndex(end => end <= item.top);
      if (column < 0) column = ends.length;
      ends[column] = item.bottom; item.column = column;
    });
    group.forEach(item => { item.columns = ends.length; });
  }
  items.forEach(item => {
    if (item.top >= groupEnd) { finish(); group = []; groupEnd = -1; }
    group.push(item); groupEnd = Math.max(groupEnd, item.bottom);
  });
  finish(); return items;
}
export function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

// Bound imports to a one-year window and limit expansion to protect older tablets.
export function importCalendar(text, source, from = new Date()) {
  if (text.length > 2_000_000) throw new Error('Filen är för stor. Gränsen är 2 MB.');
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw new Error('Filen är inte en iCalendar-kalender.');
  ICAL.TimezoneService.reset();
  root.getAllSubcomponents('vtimezone').forEach(component => {
    const zone = new ICAL.Timezone(component);
    ICAL.TimezoneService.register(zone);
  });
  const lower = addDays(new Date(from.getFullYear(), from.getMonth(), from.getDate()), -31);
  const upper = addDays(lower, 397);
  const components = root.getAllSubcomponents('vevent');
  for (const component of components) {
    if (!component.hasProperty('dtstart') || !component.hasProperty('uid')) throw new Error('En aktivitet saknar starttid eller kalender-id.');
    for (const name of ['dtstart', 'dtend', 'recurrence-id', 'exdate', 'rdate']) {
      for (const property of component.getAllProperties(name)) {
        const tzid = property.getParameter('tzid');
        if (tzid && !ICAL.TimezoneService.has(tzid)) throw new Error(`Tidszonen ${tzid} saknar definition i filen. Exportera med tidszon eller UTC-tider.`);
      }
    }
  }
  const masters = components.filter(c => !c.hasProperty('recurrence-id'));
  const output = [];
  let examined = 0;
  for (const component of masters) {
    const event = new ICAL.Event(component);
    if (component.getFirstPropertyValue('status') === 'CANCELLED') continue;
    components.filter(c => c.hasProperty('recurrence-id') && c.getFirstPropertyValue('uid') === event.uid)
      .forEach(c => event.relateException(new ICAL.Event(c)));
    const record = (start, end, item) => {
      if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return;
      const first = start.toJSDate(), last = end.toJSDate();
      if (first >= upper || last <= lower) return;
      output.push({ id: `${source.id}:${event.uid}:${start.toString()}`, title: item.summary || 'Aktivitet', start: first.toISOString(),
        end: (last > first ? last : start.isDate ? addDays(first, 1) : new Date(+first + 1)).toISOString(), allDay: start.isDate, location: item.location || '',
        people: [...source.people], category: source.category, sourceId: source.id, url: safeUrl(item.component.getFirstPropertyValue('url') || ''), imported: true });
      if (output.length > 5000) throw new Error('För många aktiviteter. Importera en mindre kalender.');
    };
    if (event.isRecurring()) {
      const iterator = event.iterator(); let occurrence;
      while ((occurrence = iterator.next())) {
        if (++examined > 30000) throw new Error('Kalenderns upprepningar är för omfattande för lokal import.');
        if (occurrence.toJSDate() >= upper) break;
        const detail = event.getOccurrenceDetails(occurrence);
        record(detail.startDate, detail.endDate, detail.item);
      }
    } else record(event.startDate, event.endDate, event);
  }
  return output;
}
