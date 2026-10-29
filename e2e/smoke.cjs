// Browser smoke test: drives two real Chromium users through the main flows
// (browse, search, auth, playback, playlists, synced room, chat, reconnect).
//
// Prerequisites: app running (npm run dev, or docker compose up) and freshly seeded:
//   npm run seed -- --reset
//   npm i -g playwright && npx playwright install chromium
//   BASE=http://localhost:5173 NODE_PATH=$(npm root -g) node e2e/smoke.cjs
// Screenshots are written to e2e/screenshots/ (git-ignored).
const { chromium } = require('playwright');
const fs = require('node:fs');
const SHOTS = process.env.SHOTS_DIR ?? __dirname + '/screenshots/';
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.BASE ?? 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const mk = async (vp = { width: 1360, height: 860 }) => {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    page.on(
      'response',
      (r) =>
        r.status() >= 400 && errors.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`),
    );
    return { ctx, page };
  };
  const step = (s) => console.log('•', s);

  const { page } = await mk();
  await page.goto(BASE);
  await page.getByRole('heading', { name: /All tracks/ }).waitFor();
  step(`browse rows: ${await page.locator('.track-row').count()}`);
  await page.screenshot({ path: SHOTS + '01-browse-anon.png' });

  await page.getByLabel(/Search tracks/).fill('night');
  await page.getByRole('heading', { name: /Results for “night”/ }).waitFor();
  step(`search "night": ${await page.locator('.track-row__title').allTextContents()}`);
  await page.getByRole('button', { name: /^Play Midnight Static/ }).click();
  await page.waitForURL(/\/login/);
  step('anon play -> redirected to login');

  await page.getByLabel('Email').fill('demo@streamify.local');
  await page.getByLabel('Password').fill('wrong-pass1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Invalid email or password').waitFor();
  step('wrong password shows error');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('heading', { name: /, demo$/ }).waitFor();
  step('logged in, back on browse');

  await page.getByRole('button', { name: 'synthwave' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.track-row').length === 3);
  await page.locator('.track-row').first().hover();
  await page
    .getByRole('button', { name: /^Play .* by Nova Drift/ })
    .first()
    .click();
  await page.waitForFunction(
    () => {
      const a = document.querySelector('audio');
      return a && !a.paused && a.currentTime > 0.5;
    },
    null,
    { timeout: 10000 },
  );
  const a1 = await page.evaluate(() => {
    const a = document.querySelector('audio');
    return { t: a.currentTime.toFixed(2), d: a.duration, src: a.src };
  });
  step(`audio playing: ${JSON.stringify(a1)}`);
  await page.screenshot({ path: SHOTS + '02-playing.png' });

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio').paused);
  await page.getByLabel('Seek').fill('30');
  await page.getByLabel('Seek').dispatchEvent('pointerup');
  await page.waitForTimeout(300);
  step(
    `after seek: ${await page.evaluate(() => document.querySelector('audio').currentTime.toFixed(1))}`,
  );
  await page.getByRole('button', { name: 'Next track' }).click();
  await page.waitForTimeout(800);
  step(`next track -> ${await page.locator('.player__title').textContent()}`);
  await page.getByRole('button', { name: 'Queue' }).click();
  await page.screenshot({ path: SHOTS + '03-queue.png' });
  step(`queue items: ${await page.locator('.queue__item').count()}`);
  await page.keyboard.press('Escape');

  // Like + add to playlist via menu
  await page
    .getByRole('button', { name: /Save .* to Liked Songs/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /More options for/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Focus Mix' }).click();
  await page.locator('.toast').first().waitFor();
  step(`toast: ${await page.locator('.toast').first().textContent()}`);

  // Library + create playlist
  await page.getByRole('link', { name: 'Library' }).first().click();
  await page.getByRole('button', { name: 'New playlist' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Mix');
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await page.getByRole('heading', { name: 'E2E Mix' }).waitFor();
  step('playlist created & opened');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Mix Renamed');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'E2E Mix Renamed' }).waitFor();
  step('playlist renamed');
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.waitForURL(/\/library$/);
  step('playlist deleted');
  await page.getByRole('link', { name: /Focus Mix/ }).click();
  await page.getByRole('heading', { name: 'Focus Mix' }).waitFor();
  await page.screenshot({ path: SHOTS + '04-playlist.png' });
  step(`focus mix tracks: ${await page.locator('.track-row').count()}`);

  // ---- Rooms: host (demo) + guest
  await page.goto(BASE + '/rooms/DEMO42');
  await page.getByRole('heading', { name: 'Friday Night Synthwave' }).waitFor();
  await page.getByText(/sync latency/).waitFor();
  step('host joined DEMO42');
  // Room state persists between runs: normalise to paused first.
  const pauseBtn = page.getByRole('button', { name: 'Pause for everyone' });
  if (await pauseBtn.count()) {
    await pauseBtn.click();
    await page.getByRole('button', { name: 'Play for everyone' }).waitFor();
  }

  const g = await mk({ width: 390, height: 844 });
  await g.page.goto(BASE + '/login');
  await g.page.getByLabel('Email').fill('guest@streamify.local');
  await g.page.getByLabel('Password').fill('guest1234');
  await g.page.getByRole('button', { name: 'Log in' }).click();
  await g.page.getByRole('heading', { name: /guest/ }).waitFor();
  await g.page.goto(BASE + '/rooms/DEMO42');
  await g.page.getByRole('heading', { name: 'Friday Night Synthwave' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.person').length === 2);
  step('host sees 2 participants');
  step(`guest play disabled: ${await g.page.locator('.now-playing .play-btn').isDisabled()}`);

  await page.getByRole('button', { name: 'Play for everyone' }).click({ timeout: 5000 });
  await g.page.waitForFunction(
    () => {
      const a = document.querySelector('audio');
      return a && !a.paused && a.currentTime > 1;
    },
    null,
    { timeout: 10000 },
  );
  await page.waitForTimeout(1500);
  const pos = async (p) => p.evaluate(() => document.querySelector('audio').currentTime);
  const [h1, g1] = await Promise.all([pos(page), pos(g.page)]);
  step(
    `synced playback: host=${h1.toFixed(2)} guest=${g1.toFixed(2)} drift=${Math.abs(h1 - g1).toFixed(3)}s`,
  );

  await page.getByRole('button', { name: 'Pause for everyone' }).click();
  await g.page.waitForFunction(() => document.querySelector('audio').paused);
  step('guest paused when host paused');

  const target =
    (await page.locator('.now-playing__title').textContent()) === 'Neon Harbour'
      ? 'Midnight Static'
      : 'Neon Harbour';
  await page
    .getByRole('button', { name: new RegExp(`Play ${target} now`) })
    .first()
    .click();
  await g.page.waitForFunction(
    (t) => document.querySelector('.player__title')?.textContent === t,
    target,
  );
  step('track change propagated to guest');

  await g.page.getByRole('textbox', { name: 'Message' }).fill('hello from guest');
  await g.page.getByRole('button', { name: 'Send message' }).click();
  await page.getByText('hello from guest').waitFor();
  step('chat delivered to host');
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + '05-room-host.png' });
  await g.page.screenshot({ path: SHOTS + '06-room-guest-mobile.png', fullPage: true });

  // Reconnect: guest goes offline, host seeks, guest returns and resyncs.
  await g.ctx.setOffline(true);
  await page
    .waitForFunction(() => document.querySelectorAll('.person').length === 1, null, {
      timeout: 60000,
    })
    .catch(() => {});
  await page.getByLabel('Seek room playback').fill('40');
  await page.getByLabel('Seek room playback').dispatchEvent('pointerup');
  await g.ctx.setOffline(false);
  await g.page.waitForFunction(() => document.querySelector('audio').currentTime >= 39, null, {
    timeout: 30000,
  });
  step(`guest resynced after reconnect: ${(await pos(g.page)).toFixed(1)}s`);

  // Mobile browse screenshot
  await g.page.goto(BASE + '/');
  await g.page.locator('.track-row').first().waitFor();
  await g.page.screenshot({ path: SHOTS + '07-browse-mobile.png' });

  console.log('\nconsole/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
