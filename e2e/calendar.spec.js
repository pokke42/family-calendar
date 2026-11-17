import { test, expect } from '@playwright/test';

test('family filters, week navigation, activity creation and local persistence', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Familjens kalender' })).toBeAttached();
  await expect(page.locator('.day')).toHaveCount(7);
  await expect(page.locator('.event')).toHaveCount(12);
  for (const input of await page.locator('#people-filters input').all()) await input.uncheck();
  await expect(page.locator('.event')).toHaveCount(0);
  await page.locator('#people-filters input[value="3"]').check();
  await expect(page.locator('.event')).toHaveCount(6);
  await page.locator('#source-filters input[value="school"]').uncheck();
  await expect(page.locator('.event')).toHaveCount(1);
  await page.getByRole('button', { name: 'Nästa vecka', exact: true }).click();
  await expect(page.locator('.event')).toHaveCount(0);
  await page.getByRole('button', { name: 'Idag', exact: true }).click();
  await page.getByRole('button', { name: 'Ny aktivitet' }).click();
  await page.getByLabel('Vad händer?').fill('Tandläkare <img src=x onerror=alert(1)>');
  await page.getByLabel('Slutar').fill('16:00');
  await page.getByRole('button', { name: 'Spara aktivitet' }).click();
  await expect(page.locator('#form-error')).toContainText('sluttid');
  await page.getByLabel('Slutar').fill('18:00');
  await page.getByRole('button', { name: 'Spara aktivitet' }).click();
  await expect(page.locator('.event').filter({ hasText: 'Tandläkare' })).toBeVisible();
  await expect(page.locator('.event img')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.event').filter({ hasText: 'Tandläkare' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('imports ICS, replaces duplicate imports and opens safe invitation links', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  const now = new Date(), date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const buffer = Buffer.from(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:match1\r\nDTSTART:${date}T100000\r\nDTEND:${date}T110000\r\nSUMMARY:Importerad match\r\nURL:https://example.org/match\r\nEND:VEVENT\r\nEND:VCALENDAR`);
  for (let i = 0; i < 2; i++) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-import="emil-sportadmin"]').click();
    await (await chooser).setFiles({ name: 'football.ics', mimeType: 'text/calendar', buffer });
    await expect(page.getByRole('status').filter({ hasText: '1 aktiviteter importerades' })).toBeVisible();
    await expect(page.locator('[data-import="emil-sportadmin"]')).toHaveText('Importera ICS-fil');
  }
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  await expect(page.locator('.event').filter({ hasText: 'Importerad match' })).toHaveCount(1);
  await page.locator('.event').filter({ hasText: 'Importerad match' }).click();
  await expect(page.getByText('Direkt svar härifrån är ännu inte anslutet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Öppna aktivitet' })).toHaveAttribute('href', 'https://example.org/match');
});

test('supports portrait and phone widths without horizontal page overflow', async ({ page }) => {
  await page.goto('/');
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 1024 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Ny aktivitet' })).toBeVisible();
  }
});

test('switches between month, week and day with view-specific navigation and retained filters', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#family-names')).toHaveText('Håkan, Johanna, Olle, Emil');
  await page.getByRole('button', { name: 'Månad', exact: true }).click();
  await expect(page.locator('.month-day')).toHaveCount(42);
  await expect(page.locator('#week-title')).toHaveText('november 2026');
  await page.getByRole('button', { name: 'Nästa månad', exact: true }).click();
  await expect(page.locator('#week-title')).toHaveText('december 2026');
  await page.getByRole('button', { name: 'Föregående månad', exact: true }).click();
  await page.locator('.month-day [data-date="2026-11-17"]').first().click();
  await expect(page.locator('[data-view="day"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.time-column')).toHaveCount(1);
  await expect(page.locator('.event')).toHaveCount(2);
  await page.getByRole('button', { name: 'Nästa dag', exact: true }).click();
  await expect(page.locator('#week-title')).toHaveText('18 november 2026');
  await page.getByRole('button', { name: 'Vecka', exact: true }).click();
  await expect(page.locator('.time-column')).toHaveCount(7);
  await page.locator('#category-filters input[value="school"]').uncheck();
  await expect(page.locator('.event')).toHaveCount(2);
  await page.getByRole('button', { name: 'Månad', exact: true }).click();
  await expect(page.locator('.month-event').filter({ hasText: 'Skoldag' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-view="month"]')).toHaveAttribute('aria-pressed', 'true');
});

test('fullscreen fallback fits seven days and all 24 hours in iPad landscape and portrait', async ({ page }) => {
  await page.addInitScript(() => { document.documentElement.requestFullscreen = undefined; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Helskärm', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/calendar-fullscreen/);
  await expect(page.locator('aside')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  for (const [width, height] of [[1024, 768], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.time-column')).toHaveCount(7);
    await expect(page.locator('.hour-label')).toHaveCount(24);
    const sizes = await page.evaluate(() => {
      const scroll = document.querySelector('.time-scroll');
      const canvas = document.querySelector('.time-canvas');
      return { scroll: scroll.clientHeight, canvas: canvas.clientHeight, bottom: canvas.getBoundingClientRect().bottom, height: innerHeight, pageWidth: document.documentElement.scrollWidth, width: innerWidth };
    });
    expect(sizes.canvas).toBe(sizes.scroll);
    expect(sizes.bottom).toBeLessThanOrEqual(sizes.height + 1);
    expect(sizes.pageWidth).toBeLessThanOrEqual(sizes.width);
    await expect(page.getByRole('button', { name: 'Avsluta helskärm', exact: true })).toBeInViewport();
  }
  await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveClass(/calendar-fullscreen/);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/calendar-fullscreen/);
  await expect(page.locator('aside')).toBeVisible();
});

test('legacy data gets named members without losing activities', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date(), start = new Date(now); start.setHours(9, 0, 0, 0);
    const end = new Date(start); end.setHours(10);
    localStorage.setItem('hemma-calendar-v1', JSON.stringify({ version: 1, demo: false,
      people: [{ id: '1', name: 'Jag' }, { id: '2', name: 'Min fru' }, { id: '3', name: 'Barn 1' }, { id: '4', name: 'Barn 2' }],
      sources: [{ id: 'manual', name: 'Egna aktiviteter', provider: 'Hemma' }],
      events: [{ id: 'existing', title: 'Befintlig aktivitet', start: start.toISOString(), end: end.toISOString(), people: ['3'], category: 'family', sourceId: 'manual' }]
    }));
  });
  await page.goto('/');
  await expect(page.locator('#family-names')).toHaveText('Håkan, Johanna, Olle, Emil');
  await expect(page.locator('.event')).toHaveCount(1);
  await expect(page.locator('.event-meta')).toContainText('Olle');
});

test('native fullscreen can be entered and exited with the visible button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Helskärm', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'Avsluta helskärm', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.locator('body')).not.toHaveClass(/calendar-fullscreen/);
});

test('connects Emils SportAdmin through UI, shows failures and disconnects without storing the feed URL in the browser', async ({ page }) => {
  let connections = [], failed = false;
  const token = 'private-test-token';
  await page.route('**/api/connections**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'POST') {
      const data = req.postDataJSON();
      if (path.endsWith('/disconnect')) connections = [];
      else if (path.endsWith('/sync')) { connections[0].error = 'Synk misslyckades. Senast hämtade aktiviteter behålls.'; connections[0].errorCode = 'HTTP_404'; }
      else {
        expect(data.source.people).toEqual(['4']);
        expect(data.url).toContain(token);
        if (failed) { await route.fulfill({ status: 400, json: { error: 'Länken gav ingen ICS-kalender.' } }); return; }
        const start = new Date(); start.setHours(16, 0, 0, 0);
        connections = [{ source: data.source, events: [{ id: 'emil-match', title: 'Emils importerade träning', start: start.toISOString(), end: new Date(+start + 3600000).toISOString(), people: ['4'], category: 'sport', sourceId: data.source.id, synced: true, imported: true }], lastSuccess: new Date().toISOString(), error: null }];
      }
    }
    await route.fulfill({ json: { connections } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  const source = page.locator('.source-card').filter({ hasText: 'Emils SportAdmin' });
  await source.getByRole('button', { name: 'Anslut kalender' }).click();
  await page.getByLabel('Kalenderlänk').fill('https://portalweb.sportadmin.se/webcal?id=' + token);
  await page.getByRole('button', { name: 'Anslut och hämta' }).click();
  await expect(source).toContainText('Senaste lyckade synk');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(token);
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  await expect(page.locator('.event').filter({ hasText: 'Emils importerade träning' })).toHaveCount(1);
  await page.locator('.event').filter({ hasText: 'Emils importerade träning' }).click();
  await expect(page.getByText('Ändringar görs i källtjänsten.')).toBeVisible();
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  await source.getByRole('button', { name: 'Uppdatera nu' }).click();
  await expect(source).toContainText('Synk misslyckades');
  await expect(source).toContainText('HTTP_404');
  failed = true;
  await source.getByRole('button', { name: 'Byt länk' }).click();
  await page.getByLabel('Kalenderlänk').fill('https://portalweb.sportadmin.se/webcal?id=' + token);
  await page.getByRole('button', { name: 'Anslut och hämta' }).click();
  await expect(page.locator('#connect-error')).toContainText('ingen ICS');
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await source.getByRole('button', { name: 'Koppla från', exact: true }).click();
  await page.locator('#confirm-disconnect').click();
  await expect(source.getByRole('button', { name: 'Anslut kalender' })).toBeVisible();
});

test('private family setup imports weekly lessons that survive reload and future years', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'));
  let connections = [], calendars;
  await page.route('**/api/connections**', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      if (input.calendars) calendars = input.calendars;
      else connections = [{ source: input.source, events: [], lastSuccess: null, error: 'Väntar på nätverk' }];
    }
    await route.fulfill({ json: { connections, calendars } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  const source = { id: 'weekly-school', name: 'Olles veckoschema', provider: 'PDF', people: ['3'], category: 'school' };
  const setup = { version: 1, connections: [{ source: { ...source, id: 'homework', name: 'Olles skoluppgifter', provider: 'InfoMentor' }, url: 'webcals://im2-api.infomentor.se/private-test-link' }], calendars: [{ source, ics: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:weekly-lesson\r\nDTSTART:20261117T125500\r\nDTEND:20261117T132500\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:MTID\r\nEND:VEVENT\r\nEND:VCALENDAR' }] };
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importera privat familjefil' }).click();
  await (await chooser).setFiles({ name: 'test.family.private.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(setup)) });
  await expect(page.locator('.source-card').filter({ hasText: 'Olles veckoschema' })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('private-test-link');
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  await expect(page.locator('.event').filter({ hasText: 'MTID' })).toHaveCount(1);
  await page.clock.setFixedTime(new Date('2028-11-14T12:00:00Z'));
  await page.reload();
  await expect(page.locator('.event').filter({ hasText: 'MTID' })).toHaveCount(1);
});

test('only Familj remains among the old default activity calendars and iCloud can be connected', async ({ page }) => {
  await page.route('**/api/connections', route => route.fulfill({ json: { connections: [] } }));
  await page.goto('/');
  for (const name of ['Fotboll', 'Gymnastik', 'Egna aktiviteter']) await expect(page.locator('#source-filters')).not.toContainText(name);
  await expect(page.locator('#source-filters')).toContainText('Familj');
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  const source = page.locator('.source-card').filter({ has: page.getByRole('heading', { name: 'Familj', exact: true }) });
  await expect(source).toContainText('Håkan, Johanna');
  await source.getByRole('button', { name: 'Anslut kalender' }).click();
  await expect(page.getByRole('heading', { name: 'Anslut Apple / iCloud' })).toBeVisible();
});

test('calendar color persists and applies to week, day and month events', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  await page.getByLabel('Färg för Familj', { exact: true }).fill('#cc3399');
  await page.getByRole('button', { name: 'Stäng', exact: true }).click();
  const event = page.locator('.event[data-calendar="icloud"]').first();
  await expect(event).toHaveCSS('border-left-color', 'rgb(204, 51, 153)');
  await page.getByRole('button', { name: 'Månad', exact: true }).click();
  await expect(page.locator('.month-event[data-calendar="icloud"]').first()).toHaveCSS('border-left-color', 'rgb(204, 51, 153)');
  await page.reload();
  await expect(page.locator('.month-event[data-calendar="icloud"]').first()).toHaveCSS('border-left-color', 'rgb(204, 51, 153)');
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  await expect(page.getByLabel('Färg för Familj', { exact: true })).toHaveValue('#cc3399');
});

test('iPad reader loads shared school templates without demo data and keeps connection controls on the Mac', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T12:00:00Z'));
  await page.route('**/api/connections', route => route.fulfill({ json: {
    readOnly: true, connections: [], calendars: [{ source: { id: 'shared-school', name: 'Olles veckoschema', provider: 'PDF', people: ['3'], category: 'school' }, ics: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:shared\r\nDTSTART:20261117T090000\r\nDTEND:20261117T100000\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Delad lektion\r\nEND:VEVENT\r\nEND:VCALENDAR' }]
  } }));
  await page.goto('/');
  await expect(page.locator('.event')).toHaveCount(1);
  await expect(page.locator('.event')).toContainText('Delad lektion');
  await page.getByRole('button', { name: 'Hantera kalenderkällor' }).click();
  await expect(page.getByRole('button', { name: 'Importera privat familjefil' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Anslut kalender', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Färg för Olles veckoschema')).toBeEnabled();
});
