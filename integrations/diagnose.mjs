import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fetchCalendar, FeedError } from './feed.mjs';
import { importFailure } from './store.mjs';
import { importCalendar } from '../src/calendar.js';

export async function diagnoseConnection(connection, fetchFeed = fetchCalendar) {
  let text;
  try { text = await fetchFeed(connection.url, connection.source.provider); }
  catch (error) {
    return { ok: false, stage: 'Hämtning', code: error instanceof FeedError ? error.code : 'FETCH', message: error instanceof FeedError ? error.message : 'Kalendern kunde inte hämtas.' };
  }
  try {
    const events = importCalendar(text, connection.source);
    return { ok: true, stage: 'Klar', bytes: Buffer.byteLength(text), activities: events.length };
  } catch (error) { return { ok: false, stage: 'Kalendertolkning', ...importFailure(error) }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.env.TZ ||= 'Europe/Stockholm';
  try {
    const filename = process.env.CALENDAR_STORE || fileURLToPath(new URL('../.local/connections.json', import.meta.url));
    const data = JSON.parse(await readFile(filename, 'utf8'));
    const connection = data.connections.find(c => c.source.id === (process.argv[2] || 'icloud'));
    if (!connection) throw new Error();
    const result = await diagnoseConnection(connection);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.log('Kunde inte läsa anslutningen. Importera familjefilen på Macen först och kör kommandot från projektmappen.');
    process.exitCode = 1;
  }
}
