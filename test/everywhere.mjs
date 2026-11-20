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
