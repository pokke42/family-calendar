import { importCalendar } from '../src/calendar.js';
import { MAX_SERVER_CALENDAR_BYTES } from './limits.mjs';

export function importServerCalendar(text, source, from = new Date()) {
  if (Buffer.byteLength(text, 'utf8') > MAX_SERVER_CALENDAR_BYTES) throw new Error('Serverkalendern är för stor. Gränsen är 20 MB.');
  return importCalendar(text, source, from, { maxLength: MAX_SERVER_CALENDAR_BYTES });
}
