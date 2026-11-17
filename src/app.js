import { categories, localDate, startOfWeek, addDays, visibleEvents, safeUrl, importCalendar, viewRange, navigateDate, migrateFamilyNames, migrateSources, retiredSources } from './calendar.js';

import { renderTimeGrid, renderMonth, positionTimeEvents } from './views.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storageKey = 'hemma-calendar-v1';
const dateFormat = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });
let focusDate = new Date();
let view = 'week';
try { const savedView = localStorage.getItem('hemma-view'); if (['day', 'week', 'month'].includes(savedView)) view = savedView; } catch {}
let week = startOfWeek(focusDate);
let messageTimeout, returnFocus;
function initialState() {
  const people = [{ id: '1', name: 'Håkan' }, { id: '2', name: 'Johanna' }, { id: '3', name: 'Olle' }, { id: '4', name: 'Emil' }];
  const sources = [
    { id: 'icloud', name: 'Familj', provider: 'Apple / iCloud', people: ['1', '2'], category: 'family' },
    { id: 'outlook', name: 'Jobb & planering', provider: 'Outlook', people: ['1'], category: 'other' },
    { id: 'school', name: 'Skolschema', provider: 'InfoMentor', people: ['3', '4'], category: 'school' },
  ];
  const events = [];
  function sample(day, hour, minutes, duration, title, personIds, category, sourceId, location) {
    const date = addDays(week, day); date.setHours(hour, minutes, 0, 0);
    events.push({ id: 'demo-' + events.length, title, start: date.toISOString(), end: new Date(+date + duration * 60000).toISOString(), people: personIds, category, sourceId, location, url: '' });
  }
  [0, 1, 2, 3, 4].forEach(day => {
    sample(day, 8, 15, 360, 'Skoldag', ['3'], 'school', 'school', 'Klass 4');
    sample(day, 8, 30, 330, 'Skoldag', ['4'], 'school', 'school', 'Klass 2');
  });
  sample(3, 16, 30, 45, 'Planera nästa vecka', ['1', '2'], 'family', 'icloud', 'Hemma');
  sample(4, 18, 0, 120, 'Fredagsmiddag', ['1', '2', '3', '4'], 'family', 'icloud', 'Hemma');
  return { version: 1, demo: true, people, sources, events };
}
let state;
let storageProblem = '';
try {
  const raw = localStorage.getItem(storageKey);
  state = raw ? JSON.parse(raw) : initialState();
  if (state.version !== 1 || !Array.isArray(state.events) || !Array.isArray(state.people) || !Array.isArray(state.sources)) throw new Error('Invalid data');
} catch { state = initialState(); storageProblem = 'Sparade uppgifter kunde inte läsas. Exempeldata visas; originalet har inte skrivits över.'; }
migrateSources(state);
const migratedPeople = migrateFamilyNames(state.people);
if (JSON.stringify(state.people) !== JSON.stringify(migratedPeople)) {
  state.people = migratedPeople;
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
}
let connections = [];
let weeklyCache = { key: '', templates: '', events: [] };
let connectionService = 'loading';
let connectionServiceError = '';
if (!state.sources.some(s => s.id === 'emil-sportadmin')) {
  state.sources.push({ id: 'emil-sportadmin', name: 'Emils SportAdmin', provider: 'SportAdmin', people: ['4'], category: 'sport' });
  // Keep the user's new source on reload without overwriting unreadable stored data.
  if (!storageProblem) { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {} }
}
let selectedPeople = state.people.map(p => p.id);
let selectedCategories = Object.keys(categories);
let selectedSources = state.sources.map(s => s.id);
function notify(text) {
  $('#message').textContent = text; $('#message').hidden = false;
  clearTimeout(messageTimeout); messageTimeout = setTimeout(() => { $('#message').hidden = true; }, 6500);
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; }
  catch { notify('Kunde inte spara. Ändringarna finns bara kvar tills sidan laddas om.'); return false; }
}
function personNames(ids) { return state.people.filter(p => ids.includes(p.id)).map(p => p.name).join(', '); }
function sourceName(id) { return state.sources.find(s => s.id === id)?.name || 'Egen aktivitet'; }
function renderFilters() {
  $('#family-names').textContent = state.people.map(p => p.name).join(', ');
  $('#people-filters').innerHTML = state.people.map(p => `<label class="filter"><input type="checkbox" data-filter="person" value="${escape(p.id)}" ${selectedPeople.includes(p.id) ? 'checked' : ''}><span class="avatar person-${escape(p.id)}">${escape(p.name.slice(0, 1))}</span>${escape(p.name)}</label>`).join('');
  $('#category-filters').innerHTML = Object.entries(categories).map(([id, name]) => `<label class="filter"><input type="checkbox" data-filter="category" value="${id}" ${selectedCategories.includes(id) ? 'checked' : ''}>${name}</label>`).join('');
  $('#source-filters').innerHTML = state.sources.map(s => `<label class="filter"><input type="checkbox" data-filter="source" value="${escape(s.id)}" ${selectedSources.includes(s.id) ? 'checked' : ''}><span>${escape(s.name)}<span class="source-provider">${escape(s.provider)}</span></span></label>`).join('');
}
function renderCalendar() {
  const range = viewRange(focusDate, view);
  const last = addDays(range.end, -1);
  const month = focusDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  $('#week-title').textContent = view === 'month' ? month : view === 'day' ? focusDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : `${dateFormat.format(range.start)} – ${dateFormat.format(last)} ${last.getFullYear()}`;
  const monday = startOfWeek(focusDate), thursday = addDays(monday, 3);
  const first = startOfWeek(new Date(thursday.getFullYear(), 0, 4));
  const number = Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 604800000) + 1;
  $('#week-number').textContent = view === 'month' ? '' : `v. ${number}`;
  const labels = { day: 'Dag', week: 'Vecka', month: 'Månad' };
  const periods = { day: 'dag', week: 'vecka', month: 'månad' };
  $('#previous').setAttribute('aria-label', `Föregående ${periods[view]}`);
  $('#next').setAttribute('aria-label', `Nästa ${periods[view]}`);
  $('.calendar').setAttribute('aria-label', `${labels[view]}skalender`);
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  const events = visibleEvents(calendarEvents(), range.start, selectedPeople, selectedCategories, selectedSources, range.end);
  $('#event-count').textContent = `${events.length} ${events.length === 1 ? 'aktivitet' : 'aktiviteter'} i vyn`;
  $('#view-description').innerHTML = state.people.map(person => `<span class="legend-person person-${escape(person.id)}">${escape(person.name)}</span>`).join('');
  $('#days').innerHTML = view === 'month' ? renderMonth(range.start, focusDate, events, personNames) : renderTimeGrid(range.start, view === 'day' ? 1 : 7, events, personNames);
  positionTimeEvents($('#days'));
  const scroll = $('.time-scroll');
  if (scroll && !document.body.classList.contains('calendar-fullscreen')) scroll.scrollTop = 7 * 48;
  $('#demo-notice').innerHTML = state.demo ? 'Exempeldata visas tillsammans med eventuella anslutna kalendrar. <button id="clear-demo" type="button">Ta bort exempeldata och lokala aktiviteter</button>' : connections.length ? 'Lokala aktiviteter och anslutna kalenderprenumerationer · Inloggning mellan enheter är ännu inte ansluten.' : 'Lokal kalender · Anslut en kalenderprenumeration under Hantera kalenderkällor.';
}
function setView(next) {
  view = next;
  try { localStorage.setItem('hemma-view', view); } catch {}
  renderCalendar();
}
function updateViewport() { document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height || innerHeight}px`); }
updateViewport();
window.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('resize', updateViewport);
let nativeFullscreen = false;
function setFullscreen(active) {
  document.body.classList.toggle('calendar-fullscreen', active);
  $('#fullscreen').setAttribute('aria-pressed', String(active));
  $('#fullscreen').setAttribute('aria-label', active ? 'Avsluta helskärm' : 'Helskärm');
  $('#fullscreen').innerHTML = active ? '⛶ <span>Avsluta helskärm</span>' : '⛶ <span>Helskärm</span>';
  $('#fullscreen').title = active ? 'Återgå till kalender och filter' : 'Visa kalendern över hela appytan';
  updateViewport();
  if (!active && $('.time-scroll')) $('.time-scroll').scrollTop = 7 * 48;
}
$('#fullscreen').addEventListener('click', () => {
  const active = !document.body.classList.contains('calendar-fullscreen');
  setFullscreen(active);
  if (active) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(() => { nativeFullscreen = true; }).catch(() => {});
    } else notify('Kalendern fyller appytan. Dölj även Safaris verktygsfält genom att lägga till appen på hemskärmen.');
  } else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && nativeFullscreen) { nativeFullscreen = false; setFullscreen(false); }
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('#toggle-sidebar').addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  $('#toggle-sidebar').setAttribute('aria-expanded', String(!collapsed));
});
function render() { renderFilters(); renderCalendar(); }
function openModal(title, html) {
  if ($('#modal').hidden) returnFocus = document.activeElement;
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = html;
  $('#modal').hidden = false; document.body.classList.add('modal-open');
  $('.modal').focus();
}
function closeModal() { $('#modal').hidden = true; document.body.classList.remove('modal-open'); returnFocus?.focus(); }
$('#close-modal').addEventListener('click', closeModal);
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) closeModal(); });
document.addEventListener('keydown', event => {
  if ($('#modal').hidden) {
    if (event.key === 'Escape' && document.body.classList.contains('calendar-fullscreen')) { setFullscreen(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
    return;
  }
  if (event.key === 'Escape') closeModal();
  if (event.key === 'Tab') {
    const focusable = [...$('.modal').querySelectorAll('button, input, select, a[href]')].filter(el => !el.disabled && !el.hidden);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('.modal'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
document.querySelector('aside').addEventListener('change', event => {
  const input = event.target; if (!input.dataset.filter) return;
  const update = list => input.checked ? [...list, input.value] : list.filter(id => id !== input.value);
  if (input.dataset.filter === 'person') selectedPeople = update(selectedPeople);
  if (input.dataset.filter === 'category') selectedCategories = update(selectedCategories);
  if (input.dataset.filter === 'source') selectedSources = update(selectedSources);
  renderCalendar();
});
$('#all-people').addEventListener('click', () => { selectedPeople = state.people.map(p => p.id); render(); });
$('#previous').addEventListener('click', () => { focusDate = navigateDate(focusDate, view, -1); renderCalendar(); });
$('#next').addEventListener('click', () => { focusDate = navigateDate(focusDate, view, 1); renderCalendar(); });
$('#today').addEventListener('click', () => { focusDate = new Date(); renderCalendar(); });
$('#demo-notice').addEventListener('click', event => {
  if (event.target.id !== 'clear-demo') return;
  openModal('Börja med egen kalender', '<p>Detta tar bort alla aktiviteter i den lokala demokalendern, även sådana du själv har lagt till. Personer och kalenderkällor behålls.</p><div class="form-actions"><button id="confirm-clear" class="primary">Töm kalendern</button></div>');
  $('#confirm-clear').onclick = () => { state.events = []; state.demo = false; persist(); closeModal(); render(); };
});
$('#days').addEventListener('click', event => {
  const dateButton = event.target.closest('[data-date]');
  if (dateButton) { focusDate = new Date(dateButton.dataset.date + 'T12:00:00'); setView('day'); return; }
  const button = event.target.closest('[data-event]'); if (!button) return;
  const item = calendarEvents().find(e => e.id === button.dataset.event); if (!item) return;
  const source = state.sources.find(s => s.id === item.sourceId);
  const url = safeUrl(item.url);
  openModal(item.title, `<p class="details-meta">${escape(new Date(item.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}<br>${item.allDay ? 'Hela dagen' : escape(timeFormat.format(new Date(item.start)) + '–' + timeFormat.format(new Date(item.end)))}${item.location ? '<br>' + escape(item.location) : ''}</p><p>${item.people.map(id => `<span class="detail-chip">${escape(personNames([id]))}</span>`).join('')}</p><p class="subtle">${escape(categories[item.category])} · ${escape(source?.provider || 'Hemma')} · ${escape(sourceName(item.sourceId))}</p>${['SportAdmin', 'Svenska Lag'].includes(source?.provider) ? '<p>Kallelsesvar görs i föreningens tjänst. Direkt svar härifrån är ännu inte anslutet.</p>' : ''}${url ? `<a class="link-button" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Öppna aktivitet i källtjänsten ↗</a>` : '<p class="subtle">Ingen aktivitetslänk finns angiven. Öppna källtjänsten för att hantera aktiviteten.</p>'}<div class="form-actions">${item.synced ? '<span class="subtle">Ändringar görs i källtjänsten.</span>' : '<button type="button" id="delete-event" class="danger">Ta bort lokalt</button>'}</div>`);
  if ($('#delete-event')) $('#delete-event').onclick = () => {
    openModal('Ta bort aktiviteten?', `<p>${escape(item.title)} tas bara bort från den här webbläsaren. Källkalendern påverkas inte.</p><div class="form-actions"><button id="confirm-delete" class="danger">Ta bort</button></div>`);
    $('#confirm-delete').onclick = () => { state.events = state.events.filter(e => e.id !== item.id); persist(); closeModal(); render(); };
  };
});
function peopleCheckboxes(selected = []) {
  return state.people.map(p => `<label class="filter"><input type="checkbox" name="people" value="${escape(p.id)}" ${selected.includes(p.id) ? 'checked' : ''}>${escape(p.name)}</label>`).join('');
}
function options(values) { return Object.entries(values).map(([value, name]) => `<option value="${escape(value)}">${escape(name)}</option>`).join(''); }
$('#new-event').addEventListener('click', () => {
  const date = localDate(focusDate);
  openModal('En ny plan', `<form id="event-form"><label class="form-label" for="title">Vad händer?</label><input id="title" name="title" required maxlength="160" placeholder="Till exempel fotbollsträning"><label class="form-label" for="date">Datum</label><input id="date" name="date" type="date" required value="${date}"><div class="form-row"><div><label class="form-label" for="start">Börjar</label><input id="start" name="start" type="time" required value="17:00"></div><div><label class="form-label" for="end">Slutar</label><input id="end" name="end" type="time" required value="18:00"></div></div><fieldset><legend>VILKA ÄR MED?</legend><div class="check-people">${peopleCheckboxes(selectedPeople)}</div></fieldset><label class="form-label" for="category">Typ av aktivitet</label><select id="category" name="category">${options(categories)}</select><label class="form-label" for="location">Plats (valfritt)</label><input id="location" name="location" maxlength="200"><label class="form-label" for="url">Länk till aktivitet eller kallelse (valfritt, https)</label><input id="url" name="url" type="url" placeholder="https://…"><p class="subtle">Sparas lokalt. Skapar ingen aktivitet eller kallelse i andra tjänster.</p><p id="form-error" class="error" role="alert"></p><div class="form-actions"><button class="primary" type="submit">Spara aktivitet</button></div></form>`);
  $('#event-form').onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.target);
    const start = new Date(`${data.get('date')}T${data.get('start')}`), end = new Date(`${data.get('date')}T${data.get('end')}`);
    const people = data.getAll('people'), title = data.get('title').trim(), url = data.get('url').trim();
    if (!title || !people.length || !(end > start) || (url && !safeUrl(url))) { $('#form-error').textContent = 'Ange en rubrik, välj minst en person och en sluttid efter starttiden. Eventuell länk måste börja med https://.'; return; }
    state.events.push({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, title, start: start.toISOString(), end: end.toISOString(), people, category: data.get('category'), sourceId: 'icloud', location: data.get('location').trim(), url: safeUrl(url) });
    const saved = persist(); focusDate = start; selectedSources = [...new Set([...selectedSources, 'icloud'])]; selectedCategories = [...new Set([...selectedCategories, data.get('category')])]; selectedPeople = [...new Set([...selectedPeople, ...people])];
    closeModal(); render(); if (saved) notify('Aktiviteten är sparad på den här enheten.');
  };
});
function showSources() {
  openModal('Familjens kalendrar', `<p>Anslut en kalenderprenumeration för automatisk uppdatering var 15:e minut medan servern körs. Du kan också importera en ICS-fil manuellt.</p><p class="subtle">${connectionService === 'ready' ? 'Kalenderservern är tillgänglig.' : escape(connectionServiceError || 'Kontrollerar kalenderservern…')}</p><p class="subtle">Importfönster: en månad bakåt och cirka ett år framåt. Kalenderns tider visas i enhetens tidszon. Välj en egen källa per barn eller lag om de ska kunna filtreras var för sig.</p>${state.sources.filter(s => s.id !== 'manual').map(s => `<div class="source-card"><h3>${escape(s.name)}</h3><p>${escape(s.provider)} · ${escape(personNames(s.people))} · ${escape(categories[s.category])}</p><p class="subtle">${connections.find(c => c.source.id === s.id) ? (connections.find(c => c.source.id === s.id).lastSuccess ? 'Ansluten kalenderprenumeration' : 'Länk sparad – väntar på lyckad synk') : s.lastImport ? 'Senast importerad: ' + escape(new Date(s.lastImport).toLocaleString('sv-SE')) : 'Inte ansluten · inga kalenderuppgifter hämtas automatiskt'}</p>${connectionControls(s)}</div>`).join('')}<button type="button" id="family-setup">Importera privat familjefil</button><input type="file" id="setup-file" accept=".json,application/json" hidden><input type="file" id="ics-file" accept=".ics,text/calendar" hidden><p id="import-error" class="error" role="alert"></p><div class="form-actions"><button type="button" id="edit-people">Ändra namn</button><button type="button" id="add-source" class="primary">＋ Lägg till källa</button></div><p class="subtle">Apple/iCloud: anslut Familj med kalenderns prenumerationslänk. iPadens kontoinloggning ger inte automatiskt åtkomst. Outlook: importera ICS. InfoMentor, SportAdmin och Svenska Lag: anslut kalenderprenumeration om den erbjuds. Detta ger läsning av kalendern, inte kontoinloggning eller möjlighet att svara på kallelser.</p>`);
  $('#modal-body').querySelectorAll('[data-import]').forEach(button => {
    button.onclick = () => {
      const source = state.sources.find(s => s.id === button.dataset.import);
      $('#ics-file').value = '';
      $('#ics-file').onchange = async event => {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 2_000_000) { $('#import-error').textContent = 'Filen är för stor. Gränsen är 2 MB.'; return; }
        button.disabled = true; button.textContent = 'Läser kalender…';
        try {
          const text = await file.text();
          await new Promise(resolve => setTimeout(resolve, 20));
          const events = importCalendar(text, source);
          state.events = state.events.filter(e => !(e.sourceId === source.id && e.imported)).concat(events);
          source.lastImport = new Date().toISOString();
          const saved = persist(); render(); showSources(); if (saved) notify(`${events.length} aktiviteter importerades till den här enheten.`);
        } catch (error) { $('#import-error').textContent = 'Importen avbröts. ' + error.message; button.disabled = false; button.textContent = 'Importera ICS-fil'; }
      };
      $('#ics-file').click();
    };
  });
  $('#family-setup').onclick = () => $('#setup-file').click();
  $('#setup-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('Filen är för stor.');
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !Array.isArray(data.connections) || !Array.isArray(data.calendars) || data.connections.length > 20) throw new Error('Ogiltig familjefil.');
      const calendars = data.calendars.map(item => ({ ...item, events: importCalendar(item.ics, item.source) }));
      $('#family-setup').disabled = true;
      $('#family-setup').textContent = 'Sparar anslutningar…';
      for (const input of data.connections) await connectionRequest('/setup', input);
      state.weeklyCalendars = state.weeklyCalendars || [];
      for (const item of calendars) {
        state.weeklyCalendars = state.weeklyCalendars.filter(c => c.source.id !== item.source.id).concat({ source: item.source, ics: item.ics });
        if (!state.sources.some(s => s.id === item.source.id)) { state.sources.push(item.source); selectedSources.push(item.source.id); }
        state.events = state.events.filter(e => e.sourceId !== item.source.id).concat(item.events);
      }
      state.events = state.events.filter(e => !e.id.startsWith('demo-'));
      state.demo = false;
      persist(); render(); showSources();
      notify('Familjefilen är importerad. Kontrollera synkstatus och eventuella schemanoteringar.');
      if (data.notes) openModal('Kontrollera schemat', `<p>${escape(data.notes)}</p>`);
    } catch (error) { $('#import-error').textContent = error.message; if ($('#family-setup')) { $('#family-setup').disabled = false; $('#family-setup').textContent = 'Importera privat familjefil'; } }
  };
  bindConnectionButtons();
  $('#edit-people').onclick = editPeople;
  $('#add-source').onclick = addSource;
}
$('#manage-sources').addEventListener('click', showSources);
function editPeople() {
  openModal('Vad heter ni?', `<form id="people-form">${state.people.map(p => `<label class="form-label" for="name-${p.id}">${escape(p.name)}</label><input id="name-${p.id}" name="${p.id}" value="${escape(p.name)}" required maxlength="40">`).join('')}<div class="form-actions"><button class="primary">Spara namn</button></div></form>`);
  $('#people-form').onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.target);
    if (state.people.some(p => !data.get(p.id).trim())) return;
    state.people.forEach(p => { p.name = data.get(p.id).trim(); }); persist(); render(); showSources();
  };
}
function addSource() {
  openModal('En egen kalenderkälla', `<form id="source-form"><label class="form-label" for="source-name">Namn, till exempel Olle – skolschema</label><input id="source-name" name="name" required maxlength="80"><label class="form-label" for="provider">Tjänst</label><select id="provider" name="provider">${options({ 'Apple / iCloud': 'Apple / iCloud', Outlook: 'Outlook', InfoMentor: 'InfoMentor', SportAdmin: 'SportAdmin', 'Svenska Lag': 'Svenska Lag', 'Annan ICS': 'Annan ICS' })}</select><fieldset><legend>VILKA GÄLLER KALENDERN?</legend><div class="check-people">${peopleCheckboxes()}</div></fieldset><label class="form-label" for="source-category">Typ av aktivitet</label><select id="source-category" name="category">${options(categories)}</select><p id="source-error" class="error" role="alert"></p><div class="form-actions"><button class="primary">Lägg till</button></div></form>`);
  $('#source-form').onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.target), people = data.getAll('people');
    if (!people.length || !data.get('name').trim()) { $('#source-error').textContent = 'Ange ett namn och välj minst en person.'; return; }
    const source = { id: `source-${Date.now()}`, name: data.get('name').trim(), provider: data.get('provider'), category: data.get('category'), people };
    state.sources.push(source); selectedSources.push(source.id); persist(); render(); showSources();
  };
}
$('#about').addEventListener('click', () => openModal('Ett hem för alla kalendrar', '<p>Det här är en första lokal version, anpassad för Safari 15 på iPad Air 2. Den använder inga externa typsnitt, bilder eller stora gränssnittsramverk.</p><p><strong>Det som fungerar nu:</strong> dag-, vecko- och månadsvy, helskärmsläge, personfilter, filter för skola och idrott, enskilda kalenderkällor, egna aktiviteter, ICS-import och serverhämtade kalenderprenumerationer för InfoMentor, SportAdmin och Svenska Lag när tjänsten erbjuder en sådan länk.</p><p><strong>Nästa steg:</strong> Supabase för inloggning och gemensam familjedata, och åtkomst till anslutningarna från andra enheter. Den lokala servern uppdaterar anslutna kalenderprenumerationer var 15:e minut. Apple/iCloud och Outlook kan anslutas via kalenderprenumeration där den erbjuds. Privata kontokopplingar kräver serverintegration.</p><p>InfoMentors export beror på skolan. Direkt svar på kallelser i SportAdmin och Svenska Lag kräver verifierat integrationsstöd. Tills dess öppnas aktivitetens HTTPS-länk när en sådan finns i importen.</p><p class="subtle">Anslutna kalenderlänkar skickas till den lokala servern och sparas där. Servern kontaktar kalendertjänsterna för att hämta aktiviteter. Lokala uppgifter kan försvinna om webbläsarens data rensas. Detta är ännu ingen synkroniserad familjekalender.</p>'));
if (innerWidth <= 740) { document.body.classList.add('sidebar-collapsed'); $('#toggle-sidebar').setAttribute('aria-expanded', 'false'); }
render();
if (storageProblem) notify(storageProblem);


function calendarEvents() {
  const templates = state.weeklyCalendars || [];
  const key = `${focusDate.getFullYear()}-${focusDate.getMonth()}`;
  const serialized = JSON.stringify(templates);
  if (weeklyCache.key !== key || weeklyCache.templates !== serialized) {
    weeklyCache = { key, templates: serialized, events: templates.flatMap(item => importCalendar(item.ics, item.source, focusDate)) };
  }
  const ids = new Set([...connections.map(c => c.source.id), ...templates.map(item => item.source.id)]);
  return state.events.filter(e => !(ids.has(e.sourceId) && (e.imported || e.id.startsWith('demo-')))).concat(connections.flatMap(c => c.events), weeklyCache.events);
}
function connectionControls(source) {
  const connection = connections.find(c => c.source.id === source.id);
  if (connection) return `<p class="subtle">Senaste lyckade synk: ${escape(connection.lastSuccess ? new Date(connection.lastSuccess).toLocaleString('sv-SE') : 'Ingen lyckad hämtning ännu')} · ${connection.events.length} aktiviteter</p>${connection.error ? `<p class="error">${escape(connection.error)}</p>` : ''}<div class="source-actions"><button data-sync="${escape(source.id)}">Uppdatera nu</button><button data-connect="${escape(source.id)}">Byt länk</button><button data-disconnect="${escape(source.id)}">Koppla från</button></div>`;
  return `<div class="source-actions">${['Apple / iCloud', 'InfoMentor', 'SportAdmin', 'Svenska Lag'].includes(source.provider) ? `<button data-connect="${escape(source.id)}" ${connectionService !== 'ready' ? 'disabled' : ''}>Anslut kalender</button>` : ''}<button type="button" data-import="${escape(source.id)}">Importera ICS-fil</button></div>`;
}
async function connectionRequest(path = '', body) {
  let response;
  try {
    response = await fetch('/api/connections' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  } catch { throw new Error('Kalenderservern kan inte nås. Starta npm run dev på datorn.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Kalenderanslutningar kräver Node-servern. Starta npm run dev och öppna appen via localhost på datorn.'); }
  if (!response.ok) throw new Error(data.error || 'Anslutningen misslyckades.');
  connections = data.connections.filter(c => !retiredSources.includes(c.source.id)).map(c => c.source.id === 'icloud' ? { ...c, source: { ...c.source, name: 'Familj', people: ['1', '2'], category: 'family' } } : c);
  connectionService = 'ready'; connectionServiceError = '';
  let added = false;
  connections.forEach(c => {
    if (!state.sources.some(s => s.id === c.source.id)) {
      state.sources.push(c.source); selectedSources.push(c.source.id); added = true;
    }
  });
  if (added) persist();
  render();
  return data;
}
async function loadConnections() {
  const wasLoading = connectionService === 'loading';
  try { await connectionRequest(); }
  catch (error) { connectionService = 'unavailable'; connectionServiceError = error.message; }
  if (wasLoading && !$('#modal').hidden && $('#modal-title').textContent === 'Familjens kalendrar') showSources();
}
function bindConnectionButtons() {
  $('#modal-body').querySelectorAll('[data-connect]').forEach(button => { button.onclick = () => showConnect(state.sources.find(s => s.id === button.dataset.connect)); });
  $('#modal-body').querySelectorAll('[data-sync]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true; button.textContent = 'Uppdaterar…';
      try {
        await connectionRequest('/sync', { id: button.dataset.sync }); showSources();
        const connection = connections.find(c => c.source.id === button.dataset.sync);
        notify(connection.error || 'Kalendern är uppdaterad. Hämtning sker högst en gång per minut.');
      } catch (error) { $('#import-error').textContent = error.message; button.disabled = false; button.textContent = 'Uppdatera nu'; }
    };
  });
  $('#modal-body').querySelectorAll('[data-disconnect]').forEach(button => {
    button.onclick = () => {
      const source = state.sources.find(s => s.id === button.dataset.disconnect);
      openModal('Koppla från kalender?', `<p>${escape(source.name)} slutar uppdateras. Kalenderlänken och hämtade aktiviteter raderas från servern. Kalendern hos ${escape(source.provider)} påverkas inte.</p><p id="disconnect-error" class="error" role="alert"></p><div class="form-actions"><button id="confirm-disconnect">Koppla från</button></div>`);
      $('#confirm-disconnect').onclick = async () => {
        $('#confirm-disconnect').disabled = true;
        try { await connectionRequest('/disconnect', { id: source.id }); showSources(); }
        catch (error) { $('#disconnect-error').textContent = error.message; $('#confirm-disconnect').disabled = false; }
      };
    };
  });
}
function showConnect(source) {
  const guides = {
    'Apple / iCloud': 'Klistra in prenumerationslänken från den delade iCloud-kalendern Familj. Den läses av servern och kopplas till Håkan och Johanna. Kopplingen är skrivskyddad.',
    'Svenska Lag': 'Öppna lagets kalender i Svenska Lag och leta efter Prenumerera eller Kalenderprenumeration. Kopiera kalenderlänken, inte adressen till lagets webbsida.',
    SportAdmin: 'Öppna kalendern i SportAdmin och leta efter kalenderprenumeration eller export till annan kalender. Om en länk erbjuds, kopiera den. Alternativen kan skilja sig mellan föreningar och appversioner.',
    InfoMentor: 'Öppna barnets schema eller kalender i InfoMentor. Om skolan erbjuder en prenumerationslänk, kopiera den. Om schemat öppnas i en annan tjänst behövs kalenderlänken från den tjänsten. Utan en sådan länk behövs skolans hjälp eller ICS-export.'
  };
  openModal(`Anslut ${source.provider}`, `<p>${escape(guides[source.provider])}</p><p class="subtle">${escape(source.name)} · ${escape(personNames(source.people))}. Använd en separat kalenderkälla för varje barn eller lag.</p><form id="connect-form"><label class="form-label" for="feed-url">Kalenderlänk (https:// eller webcal://)</label><input id="feed-url" name="url" type="password" autocomplete="off" spellcheck="false" required maxlength="4096"><p class="subtle">Länken sparas endast på den lokala servern, inte i GitHub eller webbläsarens lagring. Ange inga kontolösenord. Anslutningen ersätter tidigare importer och exempelaktiviteter för just den här källan.</p><p id="connect-error" class="error" role="alert"></p><div class="form-actions"><button type="button" id="back-sources">Tillbaka</button><button class="primary" type="submit">Anslut och hämta</button></div></form>`);
  $('#back-sources').onclick = showSources;
  $('#connect-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Hämtar kalender…';
    const url = $('#feed-url').value.trim();
    try {
      await connectionRequest('', { source, url });
      state.events = state.events.filter(e => !(e.sourceId === source.id && (e.imported || e.id.startsWith('demo-'))));
      persist(); render(); showSources(); notify('Kalendern är ansluten och uppdateras var 15:e minut medan servern körs.');
    } catch (error) { $('#connect-error').textContent = error.message; button.disabled = false; button.textContent = 'Anslut och hämta'; }
  };
}
loadConnections();
setInterval(() => { if (!document.hidden && connectionService === 'ready') loadConnections(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadConnections(); });
