// What every room shares, used in Chromium through the real pages:  node test/everywhere.mjs  (needs Playwright)
// The speaker in each room's header and the one Sound setting behind it, vibration, the Keys card, the text size,
// and the bridge's report on what is on the viewscreen. (Each room's own walk-through is in test/e2e.mjs.)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.bin': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

// Every room off the bridge, and the hook each leaves once its script has run.
const ROOMS = { 'survey.html': 'survey', 'maru.html': 'maru', 'missions.html': 'missions', 'tonight.html': 'tonight', 'xeno.html': 'xeno', 'contact.html': 'contact', 'warp.html': 'warpScale', 'system.html': 'systemView', 'away.html': 'awayTeam', 'radio.html': 'radio', 'astrometrics.html': 'astrometrics', 'distress.html': 'distress', 'temporal.html': 'temporal', 'longway.html': 'longway', 'engineering.html': 'engineering', 'directive.html': 'directive' };
const ready = (p, room) => p.waitForFunction(h => !!window[h], ROOMS[room], { timeout: 30000 });
const bridgeReady = p => p.waitForFunction(() => typeof window.engage?.jump === 'function', null, { timeout: 30000 });

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const watch = p => { p.on('pageerror', e => problems.push(e.message)); p.on('console', m => { if (m.type() === 'error') problems.push(m.text()); }); return p; };
const prefs = p => p.evaluate(() => JSON.parse(localStorage.getItem('engage.prefs') || 'null'));

try {
  // ---------- The speaker in every room ----------
  // Each room's header has a speaker, level with Bridge and clear of the room's name, on a phone and on a laptop.
  // Turned off in one room, it is off in every room and in Bridge settings, which now calls the setting Sound.
  {
    const c = await phone();
    const p = watch(await c.newPage());
    await p.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
    for (const [width, height] of [[390, 844], [1280, 800]]) {
      await p.setViewportSize({ width, height });
      for (const room of Object.keys(ROOMS)) {
        await p.goto(base + room);
        await ready(p, room);
        const s = await p.locator('#speaker').boundingBox();
        assert.ok(s && s.width >= 38 && s.height >= 38, `${room} at ${width}: no speaker you can tap`);
        assert.equal(await p.locator('#speaker').getAttribute('aria-pressed'), 'true', `${room}: the speaker starts off`);
        const back = await p.locator('.back').boundingBox();
        assert.ok(Math.abs((s.y + s.height / 2) - (back.y + back.height / 2)) < 4, `${room} at ${width}: the speaker is not level with Bridge`);
        assert.ok(s.x + s.width <= width - 8, `${room} at ${width}: the speaker runs off the screen`);
        // Nothing else in the header is under it.
        const under = await p.evaluate(() => {
          const r = document.getElementById('speaker').getBoundingClientRect();
          const head = document.getElementById('speaker').closest('header');
          return [...head.querySelectorAll('h1, .title, .tabs, .place, .round:not(.speaker), .back')].filter(el => {
            const b = el.getBoundingClientRect();
            return b.width && b.right > r.left + 1 && b.left < r.right - 1 && b.bottom > r.top + 1 && b.top < r.bottom - 1;
          }).map(el => el.className || el.tagName);
        });
        assert.deepEqual(under, [], `${room} at ${width}: the speaker sits on ${under.join(', ')}`);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${room} at ${width}: the speaker pushes the page sideways`);
      }
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(base + 'warp.html');
    await ready(p, 'warp.html');
    await p.locator('#speaker').tap();
    assert.equal(await p.locator('#speaker').getAttribute('aria-pressed'), 'false');
    assert.equal(await p.locator('#speaker').getAttribute('title'), 'Sound off');
    assert.deepEqual(await prefs(p), { sound: false, buzz: true, text: 'standard' });
    for (const room of ['maru.html', 'tonight.html', 'contact.html']) {
      await p.goto(base + room);
      await ready(p, room);
      assert.equal(await p.locator('#speaker').getAttribute('aria-pressed'), 'false', `${room} did not hear that sound was turned off`);
    }
    await p.goto(base);
    await bridgeReady(p);
    assert.equal(await p.locator('#opt-sound').isChecked(), false, 'Bridge settings did not hear that sound was turned off');
    assert.equal(await p.locator('label:has(#opt-sound) span').evaluate(el => el.firstChild.textContent), 'Sound');
    // And back on from Bridge settings: a room open in another tab follows at once.
    const other = watch(await c.newPage());
    await other.goto(base + 'maru.html');
    await ready(other, 'maru.html');
    await p.click('#open-settings');
    await p.locator('label:has(#opt-sound)').click();
    assert.equal((await prefs(p)).sound, true);
    await other.waitForFunction(() => document.getElementById('speaker').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
    await c.close();
  }

  // A bridge that had its engine sound off keeps it off everywhere, until it is turned on again.
  {
    const c = await phone();
    const p = watch(await c.newPage());
    await p.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
    await p.goto(base + 'xeno.html');
    await ready(p, 'xeno.html');
    assert.equal(await p.locator('#speaker').getAttribute('aria-pressed'), 'false', 'the old Engine sound setting was forgotten');
    await c.close();
  }

  // ---------- Vibration, on the phones that can ----------
  // On Android a short buzz goes with engaging, dropping out of warp, and each hit on your ship in the Kobayashi
  // Maru, under a setting of its own; where the browser can't vibrate (an iPhone, a computer) there's no setting.
  {
    const c = await phone();
    await c.addInitScript(() => {
      localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } }));
      navigator.vibrate = pattern => { (window.buzzed ||= []).push(pattern); return true; };
    });
    const p = watch(await c.newPage());
    await p.goto(base);
    await bridgeReady(p);
    assert.equal(await p.locator('#opt-buzz-row').evaluate(el => el.hidden), false, 'no Vibration setting on a phone that vibrates');
    const fly = async () => {
      await p.evaluate(() => { engage.speed(40); engage.target(engage.state.at === 0 ? 'Proxima Centauri' : 'Sol'); });
      await p.locator('#engage').tap();
      await p.waitForFunction(() => !engage.trip && !document.getElementById('arrival').hidden, null, { timeout: 30000 });
      await p.evaluate(() => engage.closeSheets());
    };
    await fly();
    assert.deepEqual(await p.evaluate(() => window.buzzed), [[20, 40, 40, 40, 90], 90], 'no buzz going to warp and dropping out');
    await p.click('#open-settings');
    await p.locator('label:has(#opt-buzz)').click();
    assert.equal((await prefs(p)).buzz, false);
    await p.evaluate(() => engage.closeSheets());
    await fly();
    assert.equal(await p.evaluate(() => window.buzzed.length), 2, 'it buzzed with Vibration off');
    // The Maru: hits on your ship buzz, and nothing else does.
    await p.evaluate(() => localStorage.setItem('engage.prefs', JSON.stringify({ sound: false, buzz: true, text: 'standard' })));
    await p.goto(base + 'maru.html');
    await ready(p, 'maru.html');
    await p.locator('#start').tap();
    for (const id of ['enter', 'beam', 'beam']) {
      await p.locator(`.order[data-id="${id}"]`).tap();
      await p.waitForFunction(() => !maru.busy, null, { timeout: 20000 });
    }
    const hits = await p.evaluate(() => window.buzzed || []);
    assert.ok(hits.length >= 1 && hits.every(x => x === 70), `the Maru's hits buzzed ${JSON.stringify(hits)}`);
    await c.close();
  }
  {
    const c = await phone();
    await c.addInitScript(() => { localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); delete Navigator.prototype.vibrate; });
    const p = watch(await c.newPage());
    await p.goto(base);
    await bridgeReady(p);
    assert.equal(await p.locator('#opt-buzz-row').evaluate(el => el.hidden), true, 'a Vibration setting where nothing can vibrate');
    await c.close();
  }
} finally {
  await browser.close();
  server.close();
}
assert.deepEqual(problems, [], 'problems while using it');
console.log('everywhere: all good');
