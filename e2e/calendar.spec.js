import { test, expect } from '@playwright/test';

test('family filters, week navigation, activity creation and local persistence', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Familjens kalender' })).toBeAttached();
  await expect(page.locator('.day')).toHaveCount(7);
  await expect(page.locator('.event')).toHaveCount(16);
  for (const input of await page.locator('#people-filters input').all()) await input.uncheck();
  await expect(page.locator('.event')).toHaveCount(0);
  await page.locator('#people-filters input[value="3"]').check();
  await expect(page.locator('.event')).toHaveCount(9);
  await page.locator('#source-filters input[value="football"]').uncheck();
  await expect(page.locator('.event')).toHaveCount(6);
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
    await page.locator('[data-import="football"]').click();
    await (await chooser).setFiles({ name: 'football.ics', mimeType: 'text/calendar', buffer });
    await expect(page.getByRole('status').filter({ hasText: '1 aktiviteter importerades' })).toBeVisible();
    await expect(page.locator('[data-import="football"]')).toHaveText('Importera ICS-fil');
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
  await expect(page.locator('.event')).toHaveCount(3);
  await page.getByRole('button', { name: 'Nästa dag', exact: true }).click();
  await expect(page.locator('#week-title')).toHaveText('18 november 2026');
  await page.getByRole('button', { name: 'Vecka', exact: true }).click();
  await expect(page.locator('.time-column')).toHaveCount(7);
  await page.locator('#category-filters input[value="school"]').uncheck();
  await expect(page.locator('.event')).toHaveCount(6);
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
