import { addDays, localDate, layoutDayEvents } from './calendar.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });
const today = date => localDate(date) === localDate(new Date());
const sameDay = (event, date) => new Date(event.start) < addDays(date, 1) && new Date(event.end) > date;

function eventButton(event, names, className = '') {
  const start = time.format(new Date(event.start)), end = time.format(new Date(event.end));
  return `<button type="button" class="event person-${escape(event.people[0])} ${className}" data-event="${escape(event.id)}" aria-label="${escape(`${event.title}, ${event.allDay ? 'hela dagen' : start + '–' + end}, ${names(event.people)}`)}"><span class="event-title">${escape(event.title)}</span><span class="event-time">${event.allDay ? 'Hela dagen' : start + '–' + end}</span><span class="event-meta"><span class="event-person">${escape(names(event.people))}</span>${event.location ? '<span class="event-location"> · ' + escape(event.location) + '</span>' : ''}</span></button>`;
}

export function renderTimeGrid(start, count, events, names) {
  const dates = Array.from({ length: count }, (_, i) => addDays(start, i));
  const header = dates.map(date => `<div class="time-day-header ${today(date) ? 'is-today' : ''} ${date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : ''}"><span>${date.toLocaleDateString('sv-SE', { weekday: count === 1 ? 'long' : 'short' })}</span><button type="button" class="date-number" data-date="${localDate(date)}" aria-label="Visa ${escape(date.toLocaleDateString('sv-SE'))}">${date.getDate()}</button></div>`).join('');
  const allDay = dates.map(date => `<div class="all-day-cell">${events.filter(e => e.allDay && sameDay(e, date)).map(e => eventButton(e, names, 'all-day-event')).join('')}</div>`).join('');
  const columns = dates.map(date => {
    const layout = layoutDayEvents(events, date);
    return `<section class="day time-column ${today(date) ? 'is-today' : ''} ${date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : ''}" aria-label="${escape(date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }))}">${layout.map(item => `<div class="event-position" data-top="${item.top / 14.4}" data-height="${(item.bottom - item.top) / 14.4}" data-left="${item.column * 100 / item.columns}" data-width="${100 / item.columns}">${eventButton(item.event, names)}</div>`).join('')}</section>`;
  }).join('');
  return `<div class="time-view columns-${count}"><div class="time-head"><div class="time-gutter"></div>${header}</div><div class="all-day-row"><div class="all-day-label">hela dagen</div>${allDay}</div><div class="time-scroll" tabindex="0" aria-label="Tidsaxel, 00 till 24"><div class="time-canvas"><div class="hour-labels">${Array.from({ length: 24 }, (_, h) => `<span class="hour-label" data-top="${h * 100 / 24}">${String(h).padStart(2, '0')}</span>`).join('')}</div>${columns}</div></div></div>`;
}

export function renderMonth(start, focus, events, names) {
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(start, i).toLocaleDateString('sv-SE', { weekday: 'short' }));
  return `<div class="month-view"><div class="month-weekdays">${weekdays.map(day => `<span>${day}</span>`).join('')}</div><div class="month-grid">${Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i), daily = events.filter(e => sameDay(e, date));
    return `<section class="month-day ${date.getMonth() !== focus.getMonth() ? 'outside-month' : ''} ${today(date) ? 'is-today' : ''} ${i % 7 >= 5 ? 'weekend' : ''}" aria-label="${escape(date.toLocaleDateString('sv-SE'))}"><button class="date-number" type="button" data-date="${localDate(date)}" aria-label="Visa ${escape(date.toLocaleDateString('sv-SE'))}">${date.getDate()}</button><div class="month-events">${daily.slice(0, 3).map(e => eventButton(e, names, 'month-event')).join('')}${daily.length > 3 ? `<button class="more-events" type="button" data-date="${localDate(date)}">+${daily.length - 3} till</button>` : ''}</div></section>`;
  }).join('')}</div></div>`;
}

// Use CSSOM for numeric event positions; no unsafe inline HTML styles or external layout library.
export function positionTimeEvents(root) {
  root.querySelectorAll('[data-top]').forEach(element => { element.style.top = element.dataset.top + '%'; });
  root.querySelectorAll('.event-position').forEach(element => {
    element.style.height = element.dataset.height + '%';
    element.style.left = element.dataset.left + '%';
    element.style.width = element.dataset.width + '%';
  });
}
