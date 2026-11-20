// What every room shares, used in Chromium through the real pages:  node test/everywhere.mjs  (needs Playwright)
// The speaker in each room's header and the one Sound setting behind it, vibration, the Keys card, the text size and
// high contrast, the bridge's report on what is on the viewscreen, and the small delights hidden round the ship.
// (Each room's own walk-through is in test/e2e.mjs.)
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
const ROOMS = { 'survey.html': 'survey', 'maru.html': 'maru', 'missions.html': 'missions', 'tonight.html': 'tonight', 'xeno.html': 'xeno', 'contact.html': 'contact', 'warp.html': 'warpScale', 'system.html': 'systemView', 'away.html': 'awayTeam', 'radio.html': 'radio', 'astrometrics.html': 'astrometrics', 'distress.html': 'distress', 'temporal.html': 'temporal', 'longway.html': 'longway', 'engineering.html': 'engineering', 'directive.html': 'directive', 'shipyard.html': 'shipyard' };
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
    assert.deepEqual(await prefs(p), { sound: false, buzz: true, text: 'standard', contrast: false });
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
      await p.evaluate(() => { engage.speed(6); engage.target(engage.state.at === 0 ? 'Proxima Centauri' : 'Sol'); });
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
    // Under autopilot nobody is at the helm (the phone may be on a nightstand all night): its flights don't buzz.
    await p.evaluate(() => localStorage.setItem('engage.prefs', JSON.stringify({ sound: false, buzz: true, text: 'standard' })));
    await p.evaluate(() => { engage.speed(6); engage.autopilot(true); });
    await p.waitForFunction(() => document.getElementById('caption').hidden === false, null, { timeout: 60000 });
    await p.evaluate(() => engage.autopilot(false));
    assert.equal(await p.evaluate(() => window.buzzed.length), 2, 'a flight under autopilot buzzed');
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

  // ---------- New sounds at the moments that had none ----------
  // Nobody building Engage can hear them, so each says its name to a test that listens.
  {
    const c = await phone();
    await c.addInitScript(() => { localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); window.engageHeard = []; });
    const p = watch(await c.newPage());
    const heard = () => p.evaluate(() => window.engageHeard.slice());
    // The warp scale's race: a sweep as the five leave, and a ring as each arrives.
    await p.goto(base + 'warp.html#vega');
    await ready(p, 'warp.html');
    await p.locator('#go').tap();
    await p.waitForFunction(() => document.getElementById('go').textContent === 'Race again', null, { timeout: 30000 });
    assert.deepEqual(await heard(), ['raceStart', 'laneIn', 'laneIn', 'laneIn', 'laneIn', 'laneIn']);
    // Skipped, the race rings no more.
    await p.locator('#go').tap();
    await p.locator('#go').tap();
    assert.deepEqual((await heard()).slice(6), ['raceStart']);
    // Long missions: a hail going out, and landing while the room is open (the Moon's distance is put in for her).
    await p.goto(base + 'missions.html');
    await ready(p, 'missions.html');
    await p.locator('#hail').tap();
    assert.deepEqual(await heard(), ['hailOut']);
    await p.evaluate(() => {
      const id = missions.sel, light = missions.readings(id, Date.now() / 86400000 + 2440587.5).lightSeconds * 1000;
      localStorage.setItem('engage.missions.v1', JSON.stringify({ hails: { [id]: Date.now() - light + 1500 } }));
    });
    await p.reload();
    await ready(p, 'missions.html');
    await p.waitForFunction(() => window.engageHeard.includes('hailIn'), null, { timeout: 10000 });
    // The survey's quiz: right, then wrong.
    await p.goto(base + 'survey.html#drill');
    await p.waitForFunction(() => window.survey?.world);
    await p.locator(`#choices [data-id="${await p.evaluate(() => survey.world.cls.id)}"]`).tap();
    await p.locator('#drill-next').tap();
    await p.locator(`#choices [data-id="${await p.evaluate(() => survey.world.choices.find(c => c.id !== survey.world.cls.id).id)}"]`).tap();
    assert.deepEqual(await heard(), ['right', 'wrong']);
    // The lab: a clink as a creature goes into a jar, and none as it is let go.
    await p.goto(base + 'xeno.html');
    await p.waitForFunction(() => window.xeno?.current);
    await p.locator('#keep').tap();
    await p.locator('#keep').tap();
    assert.deepEqual(await heard(), ['clink']);
    // The Kobayashi Maru's evaluation: a stamp for each of the four grades.
    await p.goto(base + 'maru.html');
    await ready(p, 'maru.html');
    await p.locator('#start').tap();
    for (const id of ['hail-maru', 'leave']) {
      await p.locator(`.order[data-id="${id}"]`).tap();
      await p.waitForFunction(() => !maru.busy, null, { timeout: 20000 });
    }
    await p.evaluate(() => { window.engageHeard = []; });
    await p.locator('#read-eval').tap();
    assert.deepEqual(await heard(), ['stamp', 'stamp', 'stamp', 'stamp']);
    // First contact: breaking off closes the channel, on a falling figure.
    await p.goto(base + 'contact.html');
    await ready(p, 'contact.html');
    await p.locator('#start').tap();
    await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
    await p.evaluate(() => { window.engageHeard = []; contact.act('leave'); });
    await p.waitForFunction(() => !contact.busy && contact.game.over, null, { timeout: 20000 });
    assert.deepEqual((await heard()).filter(x => x !== 'blip'), ['channelClosed']);
    // With the sound off, none of it is played.
    await p.locator('#speaker').tap();
    await p.goto(base + 'warp.html#vega');
    await ready(p, 'warp.html');
    await p.locator('#go').tap();
    await p.locator('#go').tap();
    assert.deepEqual(await heard(), []);
    await c.close();
  }

  // ---------- Text size ----------
  // Bridge settings has Text size: Standard, Large, Largest, for every room. Each is counted on the browser's own text
  // size, so a browser set to larger text is larger here too. The names drawn into pictures (the viewscreen,
  // tonight's tags, the missions map) grow with the page's words, and at Largest on a narrow phone no room's header
  // pushes the speaker or the page off the screen.
  {
    const c = await phone();
    const p = watch(await c.newPage());
    await p.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
    const bodyPx = () => p.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    const nameWidths = () => p.evaluate(() => Object.fromEntries(engage.labels().map(l => [l.text, l.w])));
    await p.goto(base);
    await bridgeReady(p);
    await p.waitForTimeout(400);
    assert.equal(await bodyPx(), 15, 'Standard is not the size it always was');
    const before = await nameWidths();
    await p.click('#open-settings');
    const sizes = p.locator('#text-size button');
    assert.deepEqual((await sizes.allTextContents()).map(t => t.trim()), ['Standard', 'Large', 'Largest']);
    assert.equal(await sizes.nth(0).getAttribute('aria-pressed'), 'true');
    await sizes.nth(2).tap();
    assert.equal(await sizes.nth(2).getAttribute('aria-pressed'), 'true');
    assert.equal(await sizes.nth(0).getAttribute('aria-pressed'), 'false');
    assert.equal(await p.evaluate(() => document.documentElement.dataset.text), 'largest');
    assert.equal(await bodyPx(), 19.5, 'Largest did not make the words larger');
    assert.deepEqual(await prefs(p), { sound: true, buzz: true, text: 'largest', contrast: false });
    await p.keyboard.press('Escape');
    await p.click('#settings .close').catch(() => {});
    await p.waitForTimeout(500);
    const after = await nameWidths();
    const both = Object.keys(before).filter(t => after[t]);
    assert.ok(both.length, `no name on the viewscreen to compare: ${Object.keys(before)} then ${Object.keys(after)}`);
    for (const t of both) assert.ok(after[t] > before[t] * 1.2, `${t} on the viewscreen did not grow: ${before[t]} then ${after[t]}`);

    // Kept: a reload, and every other room, open at Largest before anything is drawn.
    await p.reload();
    await bridgeReady(p);
    assert.equal(await bodyPx(), 19.5);
    await p.goto(base + 'tonight.html');
    await ready(p, 'tonight.html');
    assert.equal(await bodyPx(), 19.5, 'tonight did not follow the text size');
    await p.evaluate(() => { tonight.at('2026-01-15T03:00:00Z'); tonight.place(51.48, 0, 'Greenwich', 'Europe/London'); tonight.look(180, 35, 90); });
    await p.waitForTimeout(800);
    const bigTags = await p.evaluate(() => tonight.tags().map(t => t.h));
    await p.evaluate(() => localStorage.setItem('engage.prefs', JSON.stringify({ sound: true, buzz: true, text: 'standard' })));
    await p.reload();
    await ready(p, 'tonight.html');
    await p.evaluate(() => { tonight.at('2026-01-15T03:00:00Z'); tonight.place(51.48, 0, 'Greenwich', 'Europe/London'); tonight.look(180, 35, 90); });
    await p.waitForTimeout(800);
    const tags = await p.evaluate(() => tonight.tags().map(t => t.h));
    assert.ok(tags.length && bigTags.length, 'no tags on tonight\'s sky to measure');
    assert.ok(Math.max(...bigTags) > Math.max(...tags) * 1.2, `tonight's tags did not grow: ${Math.max(...tags)} then ${Math.max(...bigTags)}`);

    // Changed in another tab, a room follows at once.
    await p.goto(base + 'missions.html');
    await ready(p, 'missions.html');
    await p.waitForFunction(() => !!missions.nearLabels.earth || missions.draws > 2, null, { timeout: 20000 }).catch(() => {});
    const other = watch(await c.newPage());
    await other.goto(base + 'survey.html');
    await ready(other, 'survey.html');
    await other.evaluate(() => localStorage.setItem('engage.prefs', JSON.stringify({ sound: true, buzz: true, text: 'large' })));
    await other.close();
    await p.waitForFunction(() => document.documentElement.dataset.text === 'large', null, { timeout: 5000 });
    assert.equal(await bodyPx(), 17.25);

    // The browser's own text size: a browser set to 20 px rather than the usual 16 has every word a quarter larger.
    await p.evaluate(() => localStorage.setItem('engage.prefs', JSON.stringify({ sound: true, buzz: true, text: 'standard' })));
    await p.goto(base + 'survey.html');
    await ready(p, 'survey.html');
    const h1 = () => p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('h1')).fontSize));
    const h1Standard = await h1();
    await p.addStyleTag({ content: 'html { font-size: 20px !important; }' });
    assert.equal(await bodyPx(), 18.75, 'the browser\'s own text size is ignored');
    assert.equal(await h1(), h1Standard * 1.25);

    // An iPhone's Larger Text comes through Apple's body size, 17 px at the usual setting (css/app.css takes it as the
    // root's size there, with --base 17). Chromium has no -apple-system-body, so the sizes it would give are put in by
    // hand: at 17 px every word is as on any other phone, and two notches up (21 px) the words and the names in the
    // pictures are 21/17 as big.
    {
      const iphone = await phone();
      const q = watch(await iphone.newPage());
      const ios = { px: 17 };
      await q.route('**/css/app.css', async r => {
        const css = await (await r.fetch()).text();
        await r.fulfill({ contentType: 'text/css', body: `${css}\nhtml { font-size: ${ios.px}px; } :root { --base: 17; }\n` });
      });
      const sizes = () => q.evaluate(async () => [parseFloat(getComputedStyle(document.body).fontSize), (await import('./js/room.js')).textScale()]);
      await q.goto(base + 'tonight.html');
      await ready(q, 'tonight.html');
      assert.deepEqual(await sizes(), [15, 1], 'an iPhone at its usual text size is larger than before');
      ios.px = 21;
      await q.reload();
      await ready(q, 'tonight.html');
      const [body, scale] = await sizes();
      assert.ok(Math.abs(body - 15 * 21 / 17) < 0.01 && Math.abs(scale - 21 / 17) < 1e-9, `an iPhone two notches up: ${body} px, pictures × ${scale}`);
      await iphone.close();
    }

    // Largest on a narrow phone: every room fits, with its speaker on the screen and clear of the room's name.
    await p.evaluate(() => localStorage.setItem('engage.prefs', JSON.stringify({ sound: true, buzz: true, text: 'largest' })));
    await p.setViewportSize({ width: 360, height: 780 });
    for (const room of Object.keys(ROOMS)) {
      await p.goto(base + room);
      await ready(p, room);
      const fit = await p.evaluate(() => {
        const r = document.getElementById('speaker').getBoundingClientRect();
        const h = document.querySelector('header h1')?.getBoundingClientRect();
        return { wide: document.documentElement.scrollWidth, right: r.right, clash: !!h && h.right > r.left + 1 && h.left < r.right - 1 && h.bottom > r.top + 1 && h.top < r.bottom - 1 };
      });
      assert.ok(fit.wide <= 360, `${room} at Largest is ${fit.wide} px wide on a 360 px phone`);
      assert.ok(fit.right <= 360 - 8, `${room} at Largest: the speaker runs off the screen`);
      assert.equal(fit.clash, false, `${room} at Largest: the speaker sits on the room's name`);
    }
    // And words laid over a picture don't run into each other: long missions' stardate and its two tabs, the warp
    // scale's names for a light-second, a light-minute, a light-hour and a light-day.
    const clash = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
    for (const text of ['large', 'largest']) {
      await p.evaluate(t => localStorage.setItem('engage.prefs', JSON.stringify({ text: t })), text);
      await p.goto(base + 'missions.html');
      await ready(p, 'missions.html');
      await p.waitForFunction(() => document.getElementById('clock').textContent);
      const [views, clock] = await p.evaluate(() => ['.views', '#clock'].map(s => document.querySelector(s).getBoundingClientRect().toJSON()));
      assert.equal(clash(views, clock), false, `long missions at ${text}: the stardate is over the tabs`);
      await p.goto(base + 'warp.html');
      await ready(p, 'warp.html');
      const ticks = await p.evaluate(() => [...document.querySelectorAll('.tick span')].map(s => s.getBoundingClientRect().toJSON()));
      assert.ok(ticks.length >= 4);
      for (let i = 1; i < ticks.length; i++) assert.equal(clash(ticks[i - 1], ticks[i]), false, `the warp scale at ${text}: tick ${i} runs into tick ${i + 1}`);
    }
    await c.close();
  }

  // ---------- High contrast ----------
  // A switch in Bridge settings, for every room: solid panels, brighter secondary text and lines, and outlines twice
  // as thick, without anything moving. Off, every room is as it was.
  {
    const c = await phone();
    const p = watch(await c.newPage());
    await p.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
    const look = sel => p.evaluate(s => {
      const el = document.querySelector(s), st = getComputedStyle(el), b = el.getBoundingClientRect();
      return { border: st.borderTopWidth, muted: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(), bg: st.backgroundColor, w: Math.round(b.width), h: Math.round(b.height) };
    }, sel);
    await p.goto(base);
    await bridgeReady(p);
    const before = await look('#open-settings');
    assert.deepEqual([before.border, before.muted], ['1px', '#93a0b8'], 'Engage is not as it was with high contrast off');
    await p.click('#open-settings');
    assert.equal(await p.locator('#opt-contrast').isChecked(), false);
    await p.locator('#opt-contrast').check();
    assert.equal(await p.evaluate(() => document.documentElement.dataset.contrast), 'high');
    assert.equal((await prefs(p)).contrast, true);
    const after = await look('#open-settings');
    assert.equal(after.border, '2px', 'the round buttons\' outlines are no thicker');
    assert.notEqual(after.muted, before.muted, 'the secondary text is no brighter');
    assert.deepEqual([after.w, after.h], [before.w, before.h], 'a thicker outline moved the buttons');
    // Kept, and in every other room before anything is drawn: the survey's file card is solid.
    await p.goto(base + 'survey.html');
    await ready(p, 'survey.html');
    const back = await look('.back');
    assert.equal(back.border, '2px');
    assert.match(back.bg, /^rgb\(/, `the survey's panels are not solid: ${back.bg}`);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Off again, from another room's point of view.
    await p.goto(base);
    await bridgeReady(p);
    await p.click('#open-settings');
    await p.locator('#opt-contrast').uncheck();
    await p.goto(base + 'survey.html');
    await ready(p, 'survey.html');
    assert.equal((await look('.back')).border, '1px');
    assert.equal(await p.evaluate(() => document.documentElement.dataset.contrast), undefined);
    await c.close();
  }

  // ---------- The pictures follow both ----------
  // Every room's pictures: the words drawn into them grow with Text size (the bridge's viewscreen, tonight's sky, the
  // Kobayashi Maru's display, the missions map and the shipyard's drawing already scaled their own), and under High
  // contrast their labels and lines are drawn brighter (1.6 times as opaque) and 1.4 times as heavy, in the same
  // colours. Each canvas is asked what a 10 px font, a 1 px line and a half see-through red become.
  {
    const c = await phone();
    const p = watch(await c.newPage());
    const own = new Set(['index.html#labels', 'tonight.html#view', 'missions.html#map', 'maru.html#plot', 'shipyard.html#drawing']);
    const canvases = { 'index.html': ['labels'], 'warp.html': ['race'], 'radio.html': ['radio-map'], 'astrometrics.html': ['wall'], 'away.html#world=TRAPPIST-1%20e': ['sky'],
      'distress.html': ['chart'], 'temporal.html': ['chart'], 'longway.html': ['map'], 'system.html': ['orrery'], 'engineering.html': ['core'], 'contact.html': ['screen'],
      'xeno.html': ['tank'], 'tonight.html': ['view'], 'missions.html': ['map'], 'maru.html': ['plot'], 'shipyard.html': ['drawing'] };
    const probe = id => p.evaluate(id => {
      const g = document.getElementById(id).getContext('2d'), P = CanvasRenderingContext2D.prototype, real = n => Object.getOwnPropertyDescriptor(P, n).get.call(g);
      g.save();
      g.font = '600 10px "Chakra Petch", sans-serif'; g.lineWidth = 1; g.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      const out = { wrapped: !!g.engagePicture, font: real('font').match(/([\d.]+)px/)[1], line: +real('lineWidth').toFixed(3), stroke: real('strokeStyle'), reads: g.font };
      g.restore();
      return out;
    }, id);
    for (const [prefsNow, k, line, stroke] of [[{ text: 'largest', contrast: true }, 1.3, 1.4, 'rgba(255, 0, 0, 0.8)'], [{ text: 'standard', contrast: false }, 1, 1, 'rgba(255, 0, 0, 0.5)']]) {
      await p.evaluate(v => localStorage.setItem('engage.prefs', JSON.stringify({ sound: true, buzz: true, ...v })), prefsNow).catch(() => {});
      for (const [room, ids] of Object.entries(canvases)) {
        await p.goto(base + room);
        await p.evaluate(v => { localStorage.setItem('engage.prefs', JSON.stringify({ sound: true, buzz: true, ...v })); const s = JSON.parse(localStorage.getItem('engage.v1') || '{}'); localStorage.setItem('engage.v1', JSON.stringify({ ...s, seenIntro: true })); }, prefsNow);
        await p.reload();
        if (room === 'index.html') await bridgeReady(p); else await ready(p, room.split('#')[0]);
        await p.waitForTimeout(300);
        for (const id of ids) {
          const got = await probe(id), scaled = own.has(`${room}#${id}`) ? 1 : k;
          assert.equal(got.wrapped, true, `${room} #${id} doesn't follow the settings`);
          assert.equal(Number(got.font), +(10 * scaled).toFixed(2), `${room} #${id}: a 10 px font at ${prefsNow.text} is ${got.font} px`);
          assert.deepEqual([got.line, got.stroke, got.reads], [line, stroke, '600 10px "Chakra Petch", sans-serif'], `${room} #${id} under contrast ${prefsNow.contrast}`);
        }
      }
    }
    await c.close();
  }

  // ---------- Small delights ----------
  // Hidden touches, each of which stays quiet until its moment.
  {
    const c = await phone();
    const p = watch(await c.newPage());
    await p.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
    const lab = () => p.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1') || '{}'));

    // Trouble in the lab: a tribble kept from its card lives in a jar of its own, off the shelf, and has a litter of
    // ten every twelve hours, to Spock's 1,771,561 after three days, where the count stops.
    const t0 = new Date('2026-11-20T08:00:00Z');
    await p.clock.setFixedTime(t0);
    await p.goto(base + 'xeno.html');
    await ready(p, 'xeno.html');
    assert.equal(await p.locator('#tribble').isVisible(), false, 'a tribble before one was kept');
    assert.equal(await p.locator('#jars-wrap').isVisible(), false);
    await p.locator('.cabinet summary').click();
    await p.locator('#cabinet [data-tribble]').click();
    assert.equal(await p.locator('#tribble').isVisible(), true, 'Keep one kept no tribble');
    assert.equal(await p.locator('#tribble-n').innerText(), '1');
    assert.match(await p.locator('#tribble-line').innerText(), /^One tribble\./);
    assert.equal(await p.locator('#jars-n').textContent(), '0 of 40', 'the tribble took a place on the shelf');
    assert.equal(await p.locator('[data-tribble]').count(), 0, 'a second tribble can be kept');
    assert.deepEqual(await lab(), { jars: [], tribble: { at: t0.toISOString() } });
    for (const [hours, n] of [[36, '1,331'], [71, '161,051'], [120, '1,771,561']]) {
      await p.clock.setFixedTime(new Date(+t0 + hours * 3600e3));
      await p.reload();
      await ready(p, 'xeno.html');
      assert.equal(await p.locator('#tribble-n').innerText(), n, `after ${hours} hours`);
    }
    assert.match(await p.locator('#tribble-line').innerText(), /Mr Spock’s figure exactly/);
    await p.locator('#tribble-go').click();
    assert.equal(await p.locator('#tribble').isVisible(), false);
    assert.equal((await lab()).tribble, undefined);
    assert.equal(await p.locator('#jars-wrap').isVisible(), false, 'an empty shelf is still shown');
    assert.equal(await p.locator('#cabinet [data-tribble]').count(), 1, 'no tribble to keep again');
    // The lab open twice: a tribble kept in one is in the other, and the other keeping a jar afterwards doesn't
    // write it out of the save; given away there, it is gone here too.
    {
      const q = watch(await c.newPage());
      await q.goto(base + 'xeno.html');
      await ready(q, 'xeno.html');
      if (!(await p.locator('.cabinet').evaluate(d => d.open))) await p.locator('.cabinet summary').click();
      await p.locator('#cabinet [data-tribble]').click();
      await q.locator('#tribble').waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await q.locator('#cabinet [data-tribble]').count(), 0, 'the other tab still offers a tribble to keep');
      await q.click('#keep');
      await q.waitForFunction(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.length === 1);
      assert.ok((await lab()).tribble, 'keeping a jar in the other tab lost the tribble');
      await q.locator('#tribble-go').click();
      await p.locator('#tribble').waitFor({ state: 'hidden', timeout: 5000 });
      await p.evaluate(() => window.xeno.show('M', 7));
      await p.click('#keep');
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.length === 2);
      assert.equal((await lab()).tribble, undefined, 'a tribble given away in one tab came back from the other');
      await q.close();
      await p.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
    }

    // Wolf 359 falls quiet: dropping out of warp there, the engine's hum is cut off and there is no whoosh. Anywhere
    // else the ship arrives as it always has.
    await p.clock.setFixedTime(t0);
    await p.goto(base);
    await bridgeReady(p);
    await p.evaluate(() => { window.engageHeard = []; engage.speed(8); });
    for (const [star, quiet] of [['Wolf 359', true], ['Sirius', false]]) {
      await p.evaluate(s => { engageHeard.length = 0; engage.target(s); }, star);
      await p.click('#engage');
      await p.waitForFunction(() => !engage.trip && !document.getElementById('arrival').hidden, null, { timeout: 30000 });
      const heard = await p.evaluate(() => engageHeard.slice());
      assert.equal(heard.includes('hush'), quiet, `${star}: ${heard}`);
      assert.equal(heard.includes('arrive'), !quiet, `${star}: ${heard}`);
      await p.keyboard.press('Escape');
    }

    // First Contact Day: on 5 April the bridge greets you with the Phoenix, 2063, in a line under where the ship is.
    // Closed, it stays away until the next 5 April; on any other day there is no line.
    for (const [day, shown] of [['2027-04-04T12:00:00', false], ['2027-04-05T09:00:00', true], ['2027-04-05T21:00:00', false], ['2027-04-06T09:00:00', false], ['2028-04-05T09:00:00', true]]) {
      await p.clock.setFixedTime(new Date(day));
      await p.goto(base);
      await bridgeReady(p);
      assert.equal(await p.locator('#greeting').isVisible(), shown, `${day}: the greeting is ${shown ? 'missing' : 'up'}`);
      if (!shown) continue;
      assert.match(await p.locator('#greeting').innerText(), /^5 April, First Contact Day: in 2063 Zefram Cochrane flew the Phoenix to warp 1, and a passing Vulcan ship came down to meet him\. First contact$/);
      const box = await p.locator('#greeting').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390, 'the greeting runs off the screen');
      await p.locator('#greeting-close').click();
      assert.equal(await p.locator('#greeting').isVisible(), false);
    }

    // The Sun says hello: the first time you look for the Sun from more than 100 light years out, one line, once.
    await p.clock.setFixedTime(t0);
    await p.goto(base);
    await bridgeReady(p);
    const sunNote = async () => { await p.waitForTimeout(1700); return p.locator('#sun-note').isVisible(); };
    await p.evaluate(() => engage.jump('Sirius'));
    await p.keyboard.press('Escape');
    await p.locator('#look-home').click();
    assert.equal(await sunNote(), false, 'the Sun said hello from 8.6 light years');
    await p.evaluate(() => engage.jump('Rigel'));
    await p.keyboard.press('Escape');
    await p.locator('#look-home').click();
    assert.equal(await sunNote(), true, 'the Sun said nothing from Rigel');
    assert.equal(await p.locator('#sun-note').innerText(), 'Everyone you have ever met is in that dot.');
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).sunHello), true);
    await p.reload();
    await bridgeReady(p);
    await p.locator('#look-home').click();
    assert.equal(await sunNote(), false, 'the Sun said hello twice');

    // Warp 10: Your warp on the warp scale pushed hard against its stop three times running says what happened in
    // Voyager's "Threshold". Twice, or three times slowly, is just using the slider.
    await p.clock.setFixedTime(t0);
    await p.goto(base + 'warp.html');
    await ready(p, 'warp.html');
    const slide = v => p.evaluate(x => { const r = document.getElementById('custom-warp'); r.value = x; r.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    for (const v of [9.5, 9.99, 9.6, 9.99, 9.7]) await slide(v);
    assert.doesNotMatch(await p.locator('#race-note').innerText(), /Threshold/, 'twice against the stop said it');
    await slide(9.99);
    assert.match(await p.locator('#race-note').innerText(), /Tom Paris crossed it in a shuttle in Voyager’s “Threshold”, and came back turning into a salamander/);
    await slide(9.2);
    assert.doesNotMatch(await p.locator('#race-note').innerText(), /Threshold/, 'the line stayed when the slider moved on');
    await c.close();
  }

  // ---------- Computer, report ----------
  // Report, on the helm, says what is on the viewscreen in a line above the helm, and says it again once the view is
  // still after moving; in flight it tells the trip in timed lines. It stays on, through a reload, until turned off.
  {
    const c = await phone();
    await c.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
    const p = watch(await c.newPage());
    await p.goto(base);
    await bridgeReady(p);
    assert.equal(await p.locator('#report-line').isVisible(), false, 'the report is up before it is asked for');
    assert.equal(await p.locator('#report').getAttribute('aria-pressed'), 'false');
    await p.locator('#report').tap();
    assert.equal(await p.locator('#report').getAttribute('aria-pressed'), 'true');
    assert.equal(await p.locator('#report-line').getAttribute('role'), 'status', 'a screen reader is not told the report');
    assert.match(await p.locator('#report-line').innerText(), /^Looking toward Orion\. Brightest in view: .+\. The Sun is behind you, magnitude −26\.7\.$/);
    // It sits above the helm, clear of it, and inside the screen.
    const line = await p.locator('#report-line').boundingBox(), helm = await p.locator('#console').boundingBox();
    assert.ok(line.y + line.height <= helm.y && line.x >= 0 && line.x + line.width <= 390, 'the report is not above the helm');
    // Turned toward Cygnus, it says so once the view settles.
    await p.evaluate(() => engage.look(310, 40));
    await p.waitForFunction(() => /^Looking toward Cygnus\./.test(document.getElementById('report-line').textContent), null, { timeout: 5000 });
    // A sheet has the bottom of the screen: the report steps aside while it is up.
    await p.locator('#open-settings').tap();
    assert.equal(await p.locator('#report-line').isVisible(), false, 'the report stays over a sheet');
    await p.evaluate(() => engage.closeSheets());
    await p.waitForFunction(() => !document.getElementById('report-line').hidden);
    // A flight, told as it goes.
    const told = [];
    await p.exposeFunction('told', t => told.push(t));
    await p.evaluate(() => new MutationObserver(() => window.told(document.getElementById('report-line').textContent)).observe(document.getElementById('report-line'), { childList: true, characterData: true, subtree: true }));
    await p.evaluate(() => { engage.speed(3); engage.target('Sirius'); });
    await p.locator('#engage').tap();
    await p.waitForFunction(() => !engage.trip && !document.getElementById('arrival').hidden, null, { timeout: 30000 });
    const flight = told.filter((t, k) => t && t !== told[k - 1]);
    assert.deepEqual(flight.map(t => t.split(':')[0].split(' ')[0]), ['Leaving', 'Halfway', 'Closing', 'Dropping'], `the flight was told as ${JSON.stringify(flight)}`);
    assert.equal(flight[0], 'Leaving Sol at warp 9 for Sirius, 8.6 light years away.');
    assert.match(flight[1], /^Halfway: 4\.\d light years to go/);
    assert.equal(flight[3], 'Dropping out of warp at Sirius.');
    assert.equal(await p.locator('#report-line').isVisible(), false, 'the report stays over the log entry');
    // Kept on through a reload.
    await p.reload();
    await bridgeReady(p);
    assert.equal(await p.locator('#report').getAttribute('aria-pressed'), 'true');
    await p.waitForFunction(() => /Brightest in view/.test(document.getElementById('report-line').textContent) && !document.getElementById('report-line').hidden, null, { timeout: 5000 });
    // The ship's computer answers "report" in Set course, in the same words.
    const said = await p.locator('#report-line').innerText();
    await p.locator('#choose').tap();
    await p.locator('#search').fill('Computer, report');
    await p.waitForFunction(t => document.getElementById('list').textContent.includes(t), said, { timeout: 5000 });
    await p.evaluate(() => engage.closeSheets());
    // And off.
    await p.locator('#report').tap();
    assert.equal(await p.locator('#report-line').isVisible(), false);
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).opts.report), false);
    await c.close();
  }

  // ---------- The Keys card ----------
  // ? opens a card of the room's keys in every room, on top of everything, and Escape or ? puts it away with the
  // keyboard's place back where it was. Typing ? in a field types it. M turns the sound off and on anywhere.
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await c.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
    const p = watch(await c.newPage());
    const OWN = { 'survey.html': 1, 'xeno.html': 1, 'tonight.html': 1, 'away.html': 1, 'maru.html': 1, 'contact.html': 3 };
    for (const room of Object.keys(ROOMS)) {
      await p.goto(base + room);
      await ready(p, room);
      assert.equal(await p.locator('#keys-card').count(), 0, `${room} has a Keys card before a key is pressed`);
      await p.keyboard.press('?');
      assert.equal(await p.locator('#keys-card').isVisible(), true, `${room}: ? opened no Keys card`);
      assert.equal(await p.locator('#keys-card').getAttribute('role'), 'dialog');
      assert.equal(await p.locator('#keys-card dt').count(), (OWN[room] || 0) + 4, `${room}'s card has the wrong rows`);
      assert.equal(await p.evaluate(() => document.activeElement.closest('#keys-card') !== null), true, `${room}: the card doesn't have the keyboard`);
      const box = await p.locator('.keys-box').boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 800, `${room}: the card runs off the screen`);
      await p.keyboard.press('Escape');
      assert.equal(await p.locator('#keys-card').isVisible(), false, `${room}: Escape left the card up`);
    }
    // M: the sound, off and on.
    await p.keyboard.press('m');
    assert.equal(await p.locator('#speaker').getAttribute('aria-pressed'), 'false');
    await p.keyboard.press('M');
    assert.equal(await p.locator('#speaker').getAttribute('aria-pressed'), 'true');

    // The bridge's own keys: N picks the named stars in view in turn, brightest first, E engages, [ and ] nudge the
    // warp, H looks home, L opens the log, R reports.
    await p.goto(base);
    await bridgeReady(p);
    await p.keyboard.press('?');
    assert.equal(await p.locator('#keys-card dt').count(), 14);
    assert.match(await p.locator('#keys-card').innerText(), /The next named star in view, as the destination/);
    await p.keyboard.press('?');
    assert.equal(await p.locator('#keys-card').isVisible(), false, '? left the card up');
    await p.waitForTimeout(300);
    await p.keyboard.press('n');
    const first = await p.evaluate(() => engage.state.target);
    await p.keyboard.press('n');
    const second = await p.evaluate(() => engage.state.target);
    await p.keyboard.press('n');
    const third = await p.evaluate(() => engage.state.target);
    const names = await p.evaluate(() => engage.labels().map(l => l.text));
    assert.ok(first != null && second != null && third != null && new Set([first, second, third]).size === 3, 'N did not step through three stars');
    const titles = await p.evaluate(ids => ids.map(i => engage.cat().names[i]), [first, second, third]);
    assert.ok(titles.every(t => names.some(n => n.includes(t) || t.includes(n))), `N chose stars not named on the screen: ${titles} of ${names}`);
    await p.keyboard.press('Shift+N');
    assert.equal(await p.evaluate(() => engage.state.target), second, 'Shift+N did not go back');
    await p.keyboard.press(']');
    assert.equal(await p.evaluate(() => engage.state.warp), 9.1);
    await p.keyboard.press('[');
    await p.keyboard.press('[');
    assert.equal(await p.evaluate(() => engage.state.warp), 8.9);
    await p.keyboard.press('r');
    assert.equal(await p.locator('#report-line').isVisible(), true, 'R did not report');
    await p.keyboard.press('r');
    await p.keyboard.press('l');
    assert.equal(await p.locator('#log').isVisible(), true, 'L did not open the log');
    await p.keyboard.press('Escape');
    // ? typed into Set course's search is a question mark, not the card.
    await p.keyboard.press('/');
    await p.keyboard.type('vega?');
    assert.equal(await p.locator('#search').inputValue(), 'vega?');
    assert.equal(await p.locator('#keys-card').isVisible(), false);
    await p.keyboard.press('Escape');
    await p.evaluate(() => engage.speed(6));
    await p.keyboard.press('e');
    assert.ok(await p.evaluate(() => !!engage.trip), 'E did not engage');
    await p.waitForFunction(() => !engage.trip && !document.getElementById('arrival').hidden, null, { timeout: 30000 });
    await p.keyboard.press('Escape');
    const yaw = await p.evaluate(() => engage.state.yaw);
    await p.keyboard.press('h');
    await p.waitForTimeout(1500);
    assert.notEqual(await p.evaluate(() => engage.state.yaw), yaw, 'H did not turn toward the Sun');

    // The Kobayashi Maru: 1 to 9 give the orders, counting down the list.
    await p.goto(base + 'maru.html');
    await ready(p, 'maru.html');
    await p.click('#start');
    const second2 = await p.locator('.order').nth(1).getAttribute('data-id');
    await p.keyboard.press('2');
    await p.waitForFunction(() => !maru.busy, null, { timeout: 20000 });
    assert.deepEqual(await p.evaluate(() => maru.given), [second2], '2 did not give the second order');

    // First contact: 1 adds the notebook's first phrase to the reply, Enter sends it, L listens again.
    await p.goto(base + 'contact.html');
    await ready(p, 'contact.html');
    await p.click('#start');
    await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
    await p.evaluate(() => document.activeElement.blur());
    const heard = await p.evaluate(() => contact.game.log.length);
    await p.keyboard.press('l');
    await p.waitForFunction(n => !contact.busy && contact.game.log.length > n, heard, { timeout: 20000 });
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press('1');
    assert.equal(await p.locator('#send').isDisabled(), false, '1 put nothing in the reply');
    const beat = await p.evaluate(() => contact.game.beat);
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press('Enter');
    await p.waitForFunction(b => !contact.busy && contact.game.beat > b, beat, { timeout: 20000 });
    await c.close();
  }
} finally {
  await browser.close();
  server.close();
}
assert.deepEqual(problems, [], 'problems while using it');
console.log('everywhere: all good');
