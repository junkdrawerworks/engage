// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Skeleton from the junkdrawer skill: the checks at the bottom are the ones every project wants;
// add the ones that prove this app does its job.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
// The server answers the way GitHub Pages does: a browser may keep each file for ten minutes, and asks again by its
// ETag. `net` is the connection: 'up', 'down' (the server drops every connection) or 'stalled' (a train, a captive
// wifi: it takes each request and holds on to it). With `release` set it serves the next release (see the end).
let net = 'up', release = false;
const held = [];
const server = createServer((req, res) => {
  if (net === 'down') { req.socket.destroy(); return; }
  if (net === 'stalled') { held.push([req, res]); return; }
  serve(req, res);
}).listen(0);
async function serve(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
  if (release && path === '/sw.js') body = Buffer.from(String(body).replace(/const FILES = '[0-9a-f]*'/, "const FILES = 'next'"));
  if (release && path === '/index.html') body = Buffer.concat([body, Buffer.from('<!-- the next release -->\n')]);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  const head = { etag, 'cache-control': 'max-age=600', 'content-type': TYPES[extname(path)] || 'text/html' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
  res.writeHead(200, head);
  res.end(body);
}
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });

await page.goto(base);
await page.evaluate(() => document.fonts.ready);

const text = sel => page.locator(sel).innerText();
const shown = sel => page.locator(sel).evaluate(el => !el.hidden);
// The bridge is ready once its hooks are there. window.engage on its own is no sign: before the app starts, the
// browser hands back the Engage button under that name, because of its id.
const bridgeReady = (p = page) => p.waitForFunction(() => typeof window.engage?.jump === 'function', null, { timeout: 30000 });

// First visit: the welcome card, then the bridge at Earth.
await bridgeReady();
assert.ok(await shown('#intro'), 'no welcome card on a first visit');
await page.click('#intro-go');
assert.equal(await shown('#intro'), false);
assert.equal(await text('#where'), 'Earth orbit');
assert.ok(await page.locator('#engage').isDisabled(), 'engage works with no destination');

// A room added since the last visit: one line under where the ship is, naming it with a link, until it is closed
// or one of its rooms opened. A first visit, which the welcome card tells of every room, gets none, and nor does a
// save from before the bridge kept count.
{
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await fresh.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const { ROOMS: ALL } = await import('../js/rooms.js');
  const rooms = () => p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1') || '{}').rooms);
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.locator('#whats-new').isVisible(), false, 'a first visit was told what’s new');
  await p.click('#intro-go');
  assert.deepEqual(await rooms(), ALL.map(r => r.id));
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.v1')); delete s.rooms; localStorage.setItem('engage.v1', JSON.stringify(s)); });
  await p.reload();
  await bridgeReady(p);
  assert.equal(await p.locator('#whats-new').isVisible(), false, 'a save from before the bridge kept count was told every room is new');
  assert.deepEqual(await rooms(), ALL.map(r => r.id));
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.v1')); s.rooms = s.rooms.filter(id => id !== 'system' && id !== 'away'); localStorage.setItem('engage.v1', JSON.stringify(s)); });
  await p.reload();
  await bridgeReady(p);
  assert.equal(await p.locator('#whats-new').isVisible(), true, 'two new rooms went untold');
  assert.equal(await p.locator('#whats-new-text').textContent(), 'New since your last visit: System view and Away team.');
  assert.deepEqual(await p.locator('#whats-new a').evaluateAll(as => as.map(a => a.getAttribute('href'))), ['system.html', 'away.html']);
  const box = await p.locator('#whats-new-close').boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'the close button is too small to tap');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the line pushes the bridge sideways');
  await p.locator('#whats-new-close').tap();
  assert.equal(await p.locator('#whats-new').isVisible(), false);
  assert.deepEqual(await rooms(), ALL.map(r => r.id));
  await p.reload();
  await bridgeReady(p);
  assert.equal(await p.locator('#whats-new').isVisible(), false, 'a closed line came back');
  await fresh.close();
}

// The welcome card lists the rooms off the bridge, each a link with its picture, its name and a line, from the same
// table as Bridge settings' list. Bridge settings can bring the card back. The round buttons are drawn at 38 px on a
// phone, but each can be tapped anywhere in a 44 px square around its middle, without reaching its neighbour.
{
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await fresh.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const { ROOMS: LISTED } = await import('../js/rooms.js');
  const listed = sel => p.locator(`${sel} .rooms a`).evaluateAll(as => as.map(a => [a.getAttribute('href'), a.querySelector('b').textContent, a.querySelector('.room-text > span').textContent]));
  const want = LISTED.map(r => [r.href, r.name, r.line]);
  assert.deepEqual(await listed('#intro'), want, 'the welcome card does not list the rooms');
  assert.equal(await p.locator('#intro .intro-card > p:not([class])').count(), 2, 'the welcome card still has its long paragraph about the buttons');
  // On a phone on its side the seventeen rooms are listed by picture and name alone, so the card is about a screen
  // tall and Take the helm is in reach; held upright, each keeps its line.
  assert.ok(await p.locator('#intro .room-text > span').first().isVisible(), 'a phone held upright lost the rooms’ lines');
  for (const [w, h] of [[844, 390], [667, 375]]) {
    await p.setViewportSize({ width: w, height: h });
    assert.equal(await p.locator('#intro .room-text > span').first().isVisible(), false, `a phone on its side (${w} × ${h}) still shows each room’s line`);
    const tall = await p.locator('#intro .intro-card').evaluate(c => c.getBoundingClientRect().height / innerHeight);
    assert.ok(tall < 1.25, `on its side (${w} × ${h}) the welcome card is ${tall.toFixed(2)} screens tall`);
    assert.ok(await p.locator('#intro .rooms a').evaluateAll(as => as.every(a => a.getBoundingClientRect().height >= 44)), 'a room’s link is too small to tap');
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.tap('#intro-go');
  // Every round button, tapped 21 px left, right, above and below its middle, is that button.
  const misses = await p.evaluate(() => [...document.querySelectorAll('.hud-buttons .round')].flatMap(b => {
    const r = b.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return [[-21, 0], [21, 0], [0, -21], [0, 21]].filter(([dx, dy]) => document.elementFromPoint(x + dx, y + dy)?.closest('.round') !== b).map(d => `${b.id} ${d}`);
  }));
  assert.deepEqual(misses, [], 'a round button’s tap area is less than 44 px across');
  assert.equal(await p.locator('#open-log').evaluate(b => b.getBoundingClientRect().width), 38, 'the round buttons are drawn at a new size');
  await p.tap('#open-settings');
  assert.deepEqual(await listed('#settings'), want, 'Bridge settings does not list the rooms');
  await p.tap('#show-intro');
  assert.ok(await p.locator('#intro').evaluate(el => !el.hidden), 'Show the welcome again did not bring the card back');
  assert.ok(await p.locator('#settings').evaluate(el => el.hidden), 'Bridge settings stayed up behind the welcome card');
  await p.tap('#intro-go');
  assert.ok(await p.locator('#intro').evaluate(el => el.hidden));
  // A room followed from the welcome card counts as having read it: back on the bridge, the card isn't up again.
  await p.evaluate(() => { localStorage.removeItem('engage.v1'); });
  await p.reload();
  await bridgeReady(p);
  await p.tap('#intro a[href="maru.html"]');
  await p.waitForURL(/maru\.html/);
  await p.goBack();
  await bridgeReady(p);
  assert.ok(await p.locator('#intro').evaluate(el => el.hidden), 'the welcome card came back after a room was opened from it');
  await fresh.close();
}

// A friend who opens a shared course on a first visit sees the welcome card, with the course out of sight behind it:
// the card says first what the link did. Without a course, it doesn't; nor for a star with no measured distance a
// distance.
{
  const friend = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await friend.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + '?course=Vega');
  await bridgeReady(p);
  assert.equal(await p.locator('#intro-course').innerText(), 'A course is laid in for Vega, 25 light years out. Take the helm and engage.');
  await p.tap('#intro-go');
  assert.equal(await p.locator('#target-name').innerText(), 'Vega');
  // Brought back from Bridge settings, the card no longer says a link has just laid in a course.
  await p.tap('#open-settings');
  await p.tap('#show-intro');
  assert.ok(await p.locator('#intro').evaluate(el => !el.hidden));
  assert.equal(await p.locator('#intro-course').isHidden(), true, 'the welcome card brought back still says a link has just laid in a course');
  await p.tap('#intro-go');
  await p.evaluate(() => localStorage.clear());
  await p.goto(base + '?course=Alcyone');
  await bridgeReady(p);
  assert.equal(await p.locator('#intro-course').innerText(), 'A course is laid in for the Pleiades, 403 light years out. Take the helm and engage.');
  await p.evaluate(() => localStorage.clear());
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.locator('#intro-course').isHidden(), true, 'the welcome card speaks of a course no link brought');
  await friend.close();
}

// On a small phone, or any phone turned on its side, the welcome card is taller than the screen, so it scrolls and
// Take the helm can still be reached. It opens at the top all the same, though Take the helm has the focus. (667 by 375
// is a smaller phone on its side, such as an iPhone SE.)
for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  const small = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await small.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.locator('#intro').evaluate(el => el.scrollTop), 0, `the welcome card opened scrolled down past its heading on a ${viewport.width}×${viewport.height} screen`);
  const touch = await small.newCDPSession(p);
  const x = viewport.width / 2, from = viewport.height - 40, to = 40;
  // A swipe up, and another while Take the helm is still below the screen: with seventeen rooms on the list, a phone
  // on its side takes more than one. Four at most.
  let go;
  for (let swipe = 0; swipe < 4; swipe++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
    for (let i = 1; i <= 10; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / 10 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(600);
    go = await p.locator('#intro-go').boundingBox();
    if (go.y + go.height <= viewport.height) break;
  }
  assert.ok(go.y + go.height <= viewport.height, `Take the helm is below the bottom of a ${viewport.width}×${viewport.height} screen after four swipes`);
  await p.touchscreen.tap(go.x + go.width / 2, go.y + go.height / 2);
  assert.equal(await p.locator('#intro').evaluate(el => el.hidden), true, `the welcome card stayed up on a ${viewport.width}×${viewport.height} screen`);
  await small.close();
}

// With a keyboard: the welcome card takes focus and Escape puts it away, Set course takes the search field, and a
// sheet gives focus back to the button that opened it when it closes. Tonight's sheets do the same.
{
  const keys = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await keys.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const focused = () => p.evaluate(() => document.activeElement?.id || document.activeElement?.closest('.sheet')?.id + ' ' + document.activeElement?.className);
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await focused(), 'intro-go', 'the welcome card did not take focus');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#intro').evaluate(el => el.hidden), true, 'Escape did not put the welcome card away');
  await p.focus('#choose');
  await p.keyboard.press('Enter');
  assert.equal(await focused(), 'search', 'Set course did not focus the search field');
  await p.keyboard.type('vega');
  assert.match(await p.locator('#list .row').first().innerText(), /^Vega/);
  await p.keyboard.press('Escape');
  assert.equal(await focused(), 'choose', 'closing Set course did not give focus back to the destination');
  await p.focus('#open-settings');
  await p.keyboard.press('Enter');
  assert.equal(await focused(), 'settings close', 'Bridge settings did not take focus');
  await p.keyboard.press('Escape');
  assert.equal(await focused(), 'open-settings');
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  await p.focus('#open-list');
  await p.keyboard.press('Enter');
  assert.equal(await focused(), 'list close', 'tonight’s list did not take focus');
  await p.keyboard.press('Escape');
  assert.equal(await focused(), 'open-list');
  await keys.close();
  // On a touchscreen, Set course focuses its close button, so the phone's keyboard doesn't come up over the list.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const q = await phone.newPage();
  await q.goto(base);
  await bridgeReady(q);
  await q.tap('#intro-go');
  // The card hands the keyboard's place to Choose a star. After a tap that is not drawn: the bridge's first sight
  // has no bright ring round the helm. The first key pressed brings the ring back.
  const ring = () => q.evaluate(() => [document.activeElement?.id, getComputedStyle(document.activeElement).outlineStyle]);
  assert.deepEqual(await ring(), ['choose', 'none'], 'a tap on Take the helm left a focus ring on the helm');
  await q.keyboard.press('Shift');
  assert.deepEqual(await ring(), ['choose', 'solid'], 'the keyboard’s place on the helm stayed hidden once a key was pressed');
  await q.tap('#choose');
  assert.equal(await q.evaluate(() => document.activeElement?.closest('.sheet')?.id + ' ' + document.activeElement?.className), 'picker close', 'Set course did not focus its close button on a phone');
  await phone.close();
}

// The phone's back gesture (the browser's Back) closes the sheet that is up instead of leaving the page, and a sheet
// closed any other way takes its step back with it: the address and the tab's history end up where they started, so
// the next Back leaves for the page before, as it always did. A room followed out of a sheet takes the sheet's step
// with it, so its Back comes straight back to the bridge. On a phone a sheet's head can be dragged down to close it.
// Tonight's sky does the same.
{
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctxB.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  await p.goto(base + 'survey.html'); // the page before
  await p.goto(base);
  await bridgeReady(p);
  const back = async () => { await p.evaluate(() => new Promise(r => { addEventListener('popstate', () => setTimeout(r, 50), { once: true }); history.back(); })); };
  const up = () => p.evaluate(() => ['picker', 'log', 'settings', 'arrival'].filter(id => !document.getElementById(id).hidden));
  const where = () => p.evaluate(() => [location.href, history.length]);
  const start = await where();
  for (const open of ['#choose', '#open-log', '#open-settings']) {
    await p.tap(open);
    assert.equal((await up()).length, 1);
    await back();
    assert.deepEqual(await up(), [], `Back did not close the sheet ${open} opened`);
    assert.equal((await where())[0], start[0], `Back from the sheet ${open} opened changed the address`);
    // Closed with its own button instead, the step goes with it.
    await p.tap(open);
    await p.locator('.sheet:not([hidden]) .close').tap();
    await p.waitForTimeout(150);
    assert.deepEqual(await up(), []);
    assert.equal((await where())[0], start[0]);
  }
  // After a flight, Back closes the log entry and stays on the bridge.
  await p.evaluate(() => engage.jump('Vega'));
  assert.deepEqual(await up(), ['arrival']);
  await back();
  assert.deepEqual(await up(), [], 'Back after a flight did not close the log entry');
  assert.match(await p.locator('#where').innerText(), /Vega/);
  // Next destination on the arrival's entry swaps one sheet for the other on the same step.
  await p.evaluate(() => engage.jump('Altair'));
  await p.tap('#arrival-next');
  assert.deepEqual(await up(), ['picker']);
  await back();
  assert.deepEqual(await up(), []);
  assert.equal((await where())[0], start[0]);
  // A room followed out of Bridge settings: its Back comes to the bridge, and the bridge's Back to the page before.
  await p.tap('#open-settings');
  await p.tap('#settings a[href="maru.html"]');
  await p.waitForURL(/maru\.html/);
  await p.goBack();
  await bridgeReady(p);
  assert.equal(p.url(), start[0], 'the Kobayashi Maru’s Back did not come back to the bridge');
  assert.deepEqual(await up(), []);
  await p.goBack();
  assert.match(p.url(), /survey\.html$/, 'the bridge kept a step for a sheet that was no longer up');
  await p.goForward();
  await bridgeReady(p);
  // Dragged down by its head, a sheet closes past 80 px, and springs back short of it.
  const touch = await ctxB.newCDPSession(p);
  const drag = async (dy, steps) => {
    const box = await p.locator('#settings .sheet-head h2').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= steps; i++) { await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / steps }] }); await p.waitForTimeout(30); }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(300);
  };
  await p.tap('#open-settings');
  await drag(40, 10);
  assert.deepEqual(await up(), ['settings'], 'a short slow drag closed the sheet');
  assert.equal(await p.locator('#settings').evaluate(el => el.style.transform), '', 'the sheet did not spring back');
  await drag(140, 10);
  assert.deepEqual(await up(), [], 'dragging the sheet’s head down did not close it');
  assert.equal((await where())[0], start[0]);
  await p.goBack();
  assert.match(p.url(), /survey\.html$/, 'a sheet closed by dragging left its step behind');
  // Tonight's sky: Back closes its list, and its card opened from a link, without touching the address.
  await p.goto(base + 'tonight.html#star=Vega');
  await p.waitForFunction(() => window.tonight && !document.getElementById('card').hidden);
  const sky = await p.evaluate(() => location.href);
  await back();
  assert.equal(await p.locator('#card').isHidden(), true, 'Back did not close tonight’s card');
  assert.equal(await p.evaluate(() => location.href), sky);
  await p.tap('#open-list');
  await back();
  assert.equal(await p.locator('#list').isHidden(), true, 'Back did not close tonight’s list');
  await p.tap('#open-list');
  await p.locator('#list .close').tap();
  await p.waitForTimeout(150);
  await p.goBack();
  assert.ok(p.url().startsWith(base) && !p.url().includes('tonight'), 'tonight’s list closed with its button left a step behind');
  await ctxB.close();
}

// On this phone, in Bridge settings: once the offline copy is in, it says every room works with no signal; where the
// browser offers to install, a button does it; on an iPhone a line says how, and in Safari another says why it is
// worth it. The browser is asked once ever to keep Engage's storage, after the first log entry or the first jar.
{
  const ctxP = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctxP.addInitScript(() => {
    if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true }));
    StorageManager.prototype.persist = async function () { localStorage.setItem('asks', String(Number(localStorage.getItem('asks') || 0) + 1)); sessionStorage.setItem('kept', '1'); return true; };
    StorageManager.prototype.persisted = async function () { return !!sessionStorage.getItem('kept'); };
  });
  const p = await ctxP.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 });
  await p.tap('#open-settings');
  await p.waitForFunction(() => document.getElementById('phone-copy').textContent === 'Kept on this device: all eighteen rooms work with no signal.', null, { timeout: 20000 })
    .catch(async () => assert.fail(`On this phone said “${await p.locator('#phone-copy').innerText()}”`));
  assert.equal(await p.locator('#install').isHidden(), true, 'an Install button with nothing to install');
  assert.equal(await p.locator('#phone-ios').isHidden(), true, 'the iPhone’s way to install, on Android');
  assert.equal(await p.locator('#phone-kept').isHidden(), true);
  // The browser offers to install: the button asks it to, once.
  await p.evaluate(() => {
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = () => { window.prompted = (window.prompted || 0) + 1; };
    offer.userChoice = Promise.resolve({ outcome: 'accepted' });
    dispatchEvent(offer);
  });
  await p.tap('#install');
  await p.waitForFunction(() => document.getElementById('install').hidden);
  assert.equal(await p.evaluate(() => window.prompted), 1, 'Install Engage did not ask the browser to install');
  await p.locator('#settings .close').tap();
  // Asked once, after the first entry, not after the second.
  assert.equal(await p.evaluate(() => localStorage.getItem('asks')), null, 'the browser was asked to keep an empty log');
  await p.evaluate(() => engage.jump('Vega'));
  await p.waitForFunction(() => localStorage.getItem('asks') === '1');
  await p.evaluate(() => { engage.closeSheets(); engage.jump('Altair'); });
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => localStorage.getItem('asks')), '1', 'the browser was asked twice to keep the log');
  // And Bridge settings says it agreed.
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-settings');
  await p.waitForFunction(() => !document.getElementById('phone-kept').hidden);
  await p.locator('#settings .close').tap();
  // The first jar asks too, where nothing has yet.
  await p.evaluate(() => { localStorage.removeItem('engage.asked-to-keep'); sessionStorage.removeItem('kept'); });
  await p.goto(base + 'xeno.html');
  await p.waitForFunction(() => window.xeno);
  await p.tap('#keep');
  await p.waitForFunction(() => localStorage.getItem('asks') === '2');
  await ctxP.close();
  // An iPhone in Safari: how to install, and why.
  const iphone = await browser.newContext({ ...pw.devices['iPhone 13'], serviceWorkers: 'block' });
  const q = await iphone.newPage();
  q.on('pageerror', e => problems.push(e.message));
  await q.addInitScript(() => localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })));
  await q.goto(base);
  await bridgeReady(q);
  await q.tap('#open-settings');
  await q.waitForFunction(() => !document.getElementById('phone').hidden);
  assert.equal(await q.locator('#phone-ios').innerText(), 'To install: Share, then Add to Home Screen.');
  assert.match(await q.locator('#phone-safari').innerText(), /^Safari deletes what a site has saved after seven days/);
  assert.equal(await q.locator('#phone-copy').isHidden(), true, 'a copy for no signal was promised with no service worker to keep it');
  await iphone.close();
  // Safari on a Mac: no Home Screen to add it to, so neither line.
  const mac = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', serviceWorkers: 'block' });
  const r = await mac.newPage();
  r.on('pageerror', e => problems.push(e.message));
  await r.addInitScript(() => localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })));
  await r.goto(base);
  await bridgeReady(r);
  await r.click('#open-settings');
  await r.waitForTimeout(500);
  assert.deepEqual(await r.evaluate(() => ['phone-ios', 'phone-safari'].filter(id => !document.getElementById(id).hidden)), [], 'Safari on a Mac was told about the Home Screen');
  await mac.close();
}

// On a phone on its side the chosen star sits above the helm, the star you arrive at clear of the log, and the settings
// scroll as a whole; on the narrowest phones the warp slider gets a row of its own.
for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 568 }]) {
  const small = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await small.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const size = `${viewport.width}×${viewport.height}`;
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#intro-go');
  await p.evaluate(() => engage.target('Sirius'));
  await p.waitForTimeout(1400);
  const aimed = await p.evaluate(() => ({ star: engage.project('Sirius'), helm: document.getElementById('console').getBoundingClientRect().top }));
  assert.ok(aimed.star.y + 10 < aimed.helm, `the chosen star is behind the helm on a ${size} screen`);
  assert.ok(await p.locator('#warp').evaluate(el => el.getBoundingClientRect().width) > 150, `the warp slider is a stub on a ${size} screen`);
  await p.evaluate(() => engage.jump('Sirius'));
  await p.waitForTimeout(300);
  const arrived = await p.evaluate(() => ({ star: engage.project('Sirius'), log: document.getElementById('arrival').getBoundingClientRect().toJSON() }));
  const behind = arrived.star.x > arrived.log.left && arrived.star.x < arrived.log.right && arrived.star.y > arrived.log.top;
  assert.ok(!behind && arrived.star.y > 10, `the star you arrive at is behind the log on a ${size} screen`);
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-settings');
  assert.ok(await p.locator('.about').evaluate(el => el.scrollHeight - el.clientHeight) <= 1, `“What you’re seeing” is squeezed into a scroll box on a ${size} screen`);
  await small.close();
}

// On a narrow phone the star's name stays clear of the round buttons. At 360 px wide "Teegarden's" and "Betelgeuse"
// used to run on under the first of them, and at 320 px seventeen of the 32 destinations did. From 360 px the name
// is a size smaller; narrower than that it has the row under the buttons. The viewscreen's star names keep clear of
// the taller header too, and at 375 px and wider nothing has changed.
for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 740 }, { width: 375, height: 667 }]) {
  const narrow = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await narrow.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#intro-go');
  for (const star of ['Teegarden\'s Star', 'Betelgeuse', 'Proxima Centauri']) {
    await p.evaluate(name => { engage.jump(name); engage.closeSheets(); engage.target('Sirius'); }, star);
    await p.waitForTimeout(1400); // the view turns to Sirius, with Orion's named stars around it
    const hud = await p.evaluate(() => {
      const h1 = document.querySelector('.where h1'), range = document.createRange();
      range.selectNodeContents(h1);
      const box = r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      return {
        name: h1.textContent, size: getComputedStyle(h1).fontSize, words: [...range.getClientRects()].map(box), buttons: [...document.querySelectorAll('.hud-buttons .round')].map(b => box(b.getBoundingClientRect())),
        blocks: [...document.querySelectorAll('.hud .where, .hud-buttons')].map(el => box(el.getBoundingClientRect())), labels: engage.labels(),
      };
    });
    assert.ok(hud.words.length && hud.buttons.length === 9, `nothing to measure in the header at ${viewport.width} px`);
    for (const w of hud.words) {
      assert.ok(w.left >= 0 && w.right <= viewport.width, `${hud.name} runs off a ${viewport.width} px screen`);
      for (const b of hud.buttons) assert.ok(w.left >= b.right || w.right <= b.left || w.top >= b.bottom || w.bottom <= b.top, `${hud.name} runs under a button at ${viewport.width} px`);
    }
    for (const l of hud.labels) for (const b of hud.blocks) assert.ok(l.x > b.right || l.x + l.w < b.left || l.y - 12 > b.bottom || l.y + 4 < b.top, `${l.text} is under the header at ${viewport.width} px`);
    if (viewport.width === 375) assert.equal(hud.size, '22px', 'the name changed size at 375 px');
  }
  await narrow.close();
}

// A phone on its side has its camera notch at one end and a rounded corner at the other. Every page asks for the whole
// screen (viewport-fit=cover), so each keeps its own words and buttons out of both: with 47 px taken at each end
// (an iPhone's, stood in for through the browser's own tools), nothing on the bridge, in tonight's sky or in a room
// starts under the notch. With nothing taken, the padding is what it was.
{
  const notched = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await notched.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const cdp = await notched.newCDPSession(p);
  const span = sel => p.locator(sel).first().evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); const r = el.getBoundingClientRect(); return [r.left, r.right]; });
  const clear = async (what, sel) => { const [l, r] = await span(sel); assert.ok(l >= 47 && r <= 844 - 47, `${what} is under the notch or the far corner: ${Math.round(l)} to ${Math.round(r)} of 844`); };
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.locator('.hud').evaluate(el => getComputedStyle(el).paddingLeft), '24px', 'the bridge’s header changed its padding with no notch');
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 47, right: 47, top: 0, bottom: 21 } });
  await p.reload();
  await bridgeReady(p);
  await clear('the welcome card', '.intro-card');
  await p.tap('#intro-go');
  for (const [what, sel] of [['where the ship is', '.where h1'], ['the last round button', '#open-settings'], ['the helm', '#console']]) await clear(what, sel);
  await p.tap('#open-log');
  await clear('the captain’s log', '#log');
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  for (const [what, sel] of [['tonight’s Back', '.back'], ['night vision', '#night'], ['tonight’s controls', '.controls .row']]) await clear(what, sel);
  await p.tap('#open-list');
  await clear('tonight’s list', '#list');
  for (const room of ['survey', 'maru', 'missions', 'xeno', 'contact', 'warp']) {
    await p.goto(`${base}${room}.html`);
    await p.waitForSelector('main');
    for (const [what, sel] of [[`${room}’s Back`, '.back'], [`${room}’s heading`, '.top h1'], [`${room}’s page`, 'main > :not([hidden])']]) await clear(what, sel);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${room} scrolls sideways with a notch`);
  }
  await notched.close();
}

// Set course with the keyboard up on a phone on its side: about 180 px of screen is left, and the sheet, with its
// heading above the search field, used to leave the field half under the keyboard and no room for a hit. There the
// heading gives way and the close button sits beside the field, so the field and the first hit are both above the
// keyboard. (A keyboard can't be raised here: the visible part of the page is made to end 200 px short, which is
// what the page itself goes by.) With the keyboard away again the heading is back.
for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  const typing = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await typing.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#intro-go');
  await p.tap('#choose');
  const keyboard = up => p.evaluate(covered => {
    Object.defineProperty(visualViewport, 'height', { get: () => innerHeight - covered, configurable: true });
    visualViewport.dispatchEvent(new Event('resize'));
  }, up ? 200 : 0);
  await keyboard(true);
  await p.fill('#search', 'veg');
  const line = viewport.height - 200, size = `${viewport.width}×${viewport.height}`;
  const box = async sel => { const el = p.locator(sel).first(); await el.evaluate(e => Promise.all((e.closest('.sheet') || e).getAnimations().map(a => a.finished))); return el.boundingBox(); };
  const [field, hit, close] = [await box('#search'), await box('#list .row'), await box('#picker .close')];
  assert.match(await p.locator('#list .row').first().innerText(), /^Vega/);
  assert.ok(field.y >= 0 && field.y + field.height <= line, `the search field runs from ${field.y} to ${field.y + field.height} with the keyboard at ${line} on a ${size} screen`);
  assert.ok(hit.y + hit.height <= line, `the first hit ends at ${hit.y + hit.height}, behind the keyboard at ${line} on a ${size} screen`);
  assert.ok(close.y >= 0 && close.y + close.height <= line && close.x >= field.x + field.width, `the close button is not beside the search field on a ${size} screen`);
  assert.equal(await p.locator('#picker h2').evaluate(el => el.getClientRects().length), 0);
  await keyboard(false);
  assert.equal(await p.locator('#picker h2').evaluate(el => el.getClientRects().length), 1, 'the heading did not come back with the keyboard away');
  await p.tap('#picker .close');
  assert.equal(await p.locator('#picker').evaluate(el => el.hidden), true);
  await typing.close();
}

// Tapping a star chooses it.
await page.evaluate(() => engage.lookAtStar('Sirius'));
await page.waitForTimeout(400);
const box = await page.locator('#labels').boundingBox();
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(200);
assert.equal(await text('#target-name'), 'Sirius', 'tapping a star did not choose it');

// Star names stay on the screen and off the header: around Sirius, seen from Earth on a phone, Alnilam and Rigel are at
// the right edge and Alhena under the buttons.
await page.waitForTimeout(200);
{
  const names = await page.evaluate(() => engage.labels());
  assert.ok(names.some(l => l.text === 'Alnilam'), `Alnilam is not named: ${names.map(l => l.text)}`);
  const hud = await page.evaluate(() => [...document.querySelectorAll('.hud .where, .hud-buttons')].map(el => el.getBoundingClientRect().toJSON()));
  for (const l of names) {
    assert.ok(l.x >= 0 && l.x + l.w <= 390 && l.y >= 12 && l.y <= 840, `${l.text} runs off the screen (${Math.round(l.x)} to ${Math.round(l.x + l.w)}, ${Math.round(l.y)} down)`);
    for (const b of hud) assert.ok(l.x > b.right || l.x + l.w < b.left || l.y - 12 > b.bottom || l.y + 4 < b.top, `${l.text} is under the header`);
  }
}

// Without JavaScript, the page says what it needs it for, in front of everything else.
{
  const plain = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const p = await plain.newPage();
  for (const file of ['', 'tonight.html']) {
    await p.goto(base + file);
    const on = await p.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.className);
    assert.equal(on, 'noscript', `the no-JavaScript note is hidden behind the page on ${file || 'the bridge'}`);
  }
  await plain.close();
}

// The search knows where Starfleet's charts put things, and the row says why it matched. Names the charts don't
// place find nothing, and two stars with one name are told apart.
await page.click('#choose');
{
  const rows = async q => { await page.fill('#search', q); return page.locator('#list .row').evaluateAll(els => els.map(el => [el.querySelector('.name').firstChild.textContent, el.querySelector('.meta').textContent, el.querySelector('.chart')?.textContent])); };
  assert.deepEqual((await rows('vulcan'))[0], ['40 Eridani', 'Keid · Orange dwarf', 'Vulcan'], 'searching for Vulcan does not find 40 Eridani');
  assert.equal((await rows('Farpoint'))[0][0], 'Deneb');
  assert.equal((await rows('eps eri'))[0][0], 'Epsilon Eridani');
  assert.equal((await rows('hip 3'))[0][0], 'HIP 3', 'an exact name is not the first hit');
  assert.deepEqual((await rows('61 cygni')).map(r => r[0]), ['61 Cygni A', '61 Cygni B']);
  assert.deepEqual(await rows('andoria'), []);
  assert.equal(await text('#list .empty'), 'No star by that name in the catalogue.');
  // The ship's computer answers a question in the same box, with a line and the stars to tap, from where the ship is.
  assert.deepEqual((await rows('nearest')).map(r => r[0]).slice(0, 3), ['Proxima Centauri', 'Toliman', 'Alpha Centauri']);
  assert.match(await text('#list .computer'), /^The five stars nearest our position, nearest first\. Proxima Centauri is 4\.2 light years away\.$/);
  assert.equal((await rows('Computer, how far is Vega?'))[0][0], 'Vega');
  assert.match(await text('#list .computer'), /^Vega is 25 light years from us: \d+ days? at warp [\d.]+\.$/);
  assert.equal((await rows('brightest from here'))[0][0], 'Sirius');
  await rows('vega');
  assert.equal(await page.locator('#list .computer').count(), 0, 'a name was taken for a question');
  // A star the catalogue has no distance for says so, in the list and at the helm, instead of the placeholder's 3,262 ly.
  assert.equal((await rows('rho cassiopeiae'))[0][0], 'ρ Cassiopeiae');
  assert.equal(await text('#list .row .dist'), 'distance not measured');
  await page.locator('#list .row').first().click();
  assert.match(await text('#trip'), /^Distance not measured · charted at a nominal 3,262 ly · /);
  await page.click('#choose');
  await rows('vulcan');
}
await page.locator('#list .row').first().click();
assert.equal(await text('#target-name'), '40 Eridani');
assert.equal(await text('#target-sub'), 'Keid · Vulcan · Orange dwarf', 'the helm does not say why Vulcan found 40 Eridani');

// Holding at a star that behaves, the disc does what the star does, sped up, and the header says its real period;
// with reduced motion asked for it keeps still, and the header gives the period alone. (On a page of its own, so
// these arrivals stay out of the log the rest of this walk-through reads.)
for (const reducedMotion of ['no-preference', 'reduce']) {
  const ctxV = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion });
  await ctxV.addInitScript(() => localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })));
  const p = await ctxV.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => engage.jump('Algol'));
  await p.waitForTimeout(300);
  const still = reducedMotion === 'reduce';
  assert.equal((await p.locator('#behaves').textContent()).replace(/\s+/g, ' '), still ? 'Dims every 2.87 days' : 'Dims every 2.87 days sped up');
  const b = await p.evaluate(() => engage.behave);
  if (still) assert.equal(b, null, 'the disc moves under reduced motion');
  else assert.ok(b && b.star === await p.evaluate(() => engage.state.at) && b.light <= 1, `Algol's disc: ${JSON.stringify(b)}`);
  await p.evaluate(() => engage.jump('Vega'));
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#behaves').evaluate(el => el.hidden), true, 'a steady star says it behaves');
  assert.equal(await p.evaluate(() => engage.behave), null);
  await ctxV.close();
}

// Picking from the list, and searching. The sheet keeps its height while the list shrinks to one hit, so the search
// field stays near the top of the screen, clear of a phone's keyboard; and when a keyboard covers the bottom of the
// screen (faked here: the visible part of the page ends 340 px short), the sheet stands on top of it.
await page.click('#choose');
const pickerTop = () => page.locator('#picker').evaluate(el => el.getBoundingClientRect().top);
await page.waitForTimeout(500); // the sheet has risen into place
const openTop = await pickerTop();
await page.fill('#search', 'proxima');
assert.equal(await page.locator('#list .row').count(), 1);
assert.equal(await pickerTop(), openTop, 'the Set course sheet changed height as the list shrank');
assert.ok(openTop < 844 * 0.2, `the search field is ${Math.round(openTop)} px down the screen, where a keyboard would cover its hits`);
await page.evaluate(() => {
  Object.defineProperty(visualViewport, 'height', { get: () => 504, configurable: true });
  visualViewport.dispatchEvent(new Event('resize'));
});
{
  const b = await page.locator('#picker').boundingBox(), row = await page.locator('#list .row').first().boundingBox();
  assert.ok(Math.abs(b.y + b.height - 504) <= 1, `with a keyboard up the Set course sheet ends at ${b.y + b.height}, not on top of it at 504`);
  assert.ok(Math.abs(b.y - openTop) <= 1, 'the sheet moved up the screen when the keyboard came up');
  assert.ok(row.y + row.height <= 504, 'the first hit is behind the keyboard');
}
await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
assert.ok(Math.abs((await page.locator('#picker').evaluate(el => el.getBoundingClientRect().bottom)) - 844) <= 1, 'the sheet stayed up after the keyboard went');
// Go on the keyboard (Enter) takes the first hit, and the field lets go of the keyboard.
assert.equal(await page.getAttribute('#search', 'enterkeyhint'), 'go');
await page.fill('#search', 'andoria');
await page.press('#search', 'Enter');
assert.ok(await shown('#picker'), 'Enter with no hits closed the sheet');
await page.fill('#search', 'proxima');
await page.press('#search', 'Enter');
assert.equal(await shown('#picker'), false, 'Enter in the search field did not choose the first hit');
assert.notEqual(await page.evaluate(() => document.activeElement.id), 'search', 'the search field kept the keyboard up');
assert.equal(await text('#target-name'), 'Proxima Centauri');
assert.match(await text('#trip'), /4\.2\d ly away/);
// Star names stay off the helm too: looking toward Proxima from Earth, Miaplacidus is at the helm's top edge.
await page.waitForTimeout(1300);
{
  const helm = await page.locator('#console').boundingBox();
  for (const l of await page.evaluate(() => engage.labels())) {
    if (l.text === 'Proxima Centauri') continue; // the destination is always named
    assert.ok(l.y + 4 < helm.y || l.x > helm.x + helm.width || l.x + l.w < helm.x, `${l.text} is under the helm`);
  }
}

// Warp 9 to Proxima, flown fast, ends in a log entry.
await page.evaluate(() => engage.speed(8));
await page.click('#engage');
await page.waitForFunction(() => !document.getElementById('arrival').hidden, null, { timeout: 20000 });
const entry = await text('#arrival-entry');
assert.match(entry, /Proxima b’s orbit/);
assert.match(entry, /Cassiopeia/, 'the log does not say where the Sun is');
assert.match(entry, /in 1 day at warp 9/);
assert.match(entry, /Proxima b: Class M candidate/, 'the log does not link to the planetary survey');
// Beside it, a link to the lab, which has Proxima b's own readings to grow a creature from.
assert.equal(await page.locator('#arrival-entry .files a', { hasText: 'Grow a creature for Proxima b' }).getAttribute('href'), 'xeno.html#world=Proxima%20b');
// And to the system view: fly in to its planets, or place one of your own beside the temperate orbit.
assert.equal(await page.locator('#arrival-entry .files a', { hasText: 'System view: fly in to its planets' }).getAttribute('href'), 'system.html#star=Proxima%20Centauri');
assert.equal(await page.locator('#arrival-entry .files a', { hasText: 'Place a planet here' }).getAttribute('href'), 'system.html#star=Proxima%20Centauri&place');
assert.equal(await text('#where'), 'Proxima Centauri');
assert.equal(await page.locator('#console').evaluate(el => el.inert), false, 'the helm stayed out of reach after arriving');
// Under the star's name, one quiet line says what this arrival did: a first trip sets every record and charts a
// destination, and the entry used to say none of it. The count is the one the log's records give (see below).
assert.deepEqual(await page.locator('#arrival-entry h3 + .firsts span').allInnerTexts(), ['First visit', 'Farthest yet from Sol', 'Longest trip yet', 'Destination 2 of 35 charted']);
// It takes two lines on a phone: each part stays whole, and no dot is left hanging at the end of the first.
{
  const parts = await page.locator('#arrival-entry .firsts span').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, lines: el.getClientRects().length }; }));
  const edge = await page.locator('#arrival-entry .firsts').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, clip: getComputedStyle(el).clipPath }; });
  assert.ok(parts.every(s => s.lines === 1 && s.right <= edge.right + 0.5), 'a part of the arrival’s line is broken or cut off');
  assert.ok(parts.some(s => s.top > parts[0].top) && parts.filter(s => s.top > parts[0].top).some(s => s.left === edge.left) && edge.clip.startsWith('inset('), 'the arrival’s line did not wrap cleanly on a phone');
}
assert.ok(!('firsts' in await page.evaluate(() => engage.state.log[0])) && !/First visit/.test(await page.evaluate(() => localStorage.getItem('engage.v1'))), 'the line was kept with the entry');
// In the header, the stardate and the distance from home don't fit on one line of a phone here. The dot between them
// goes with the second, and is clipped away when that starts a line: it isn't left dangling at the end of the first.
{
  const when = await page.locator('#when').evaluate(el => {
    const [a, b] = el.children, left = el.getBoundingClientRect().left;
    return { text: el.innerText, wrapped: b.offsetTop > a.offsetTop, dot: getComputedStyle(b, '::before').content, clip: getComputedStyle(el).clipPath, bLeft: b.getBoundingClientRect().left - left };
  });
  assert.match(when.text, /^Stardate \d{4}\.\d{3}\s4\.2\d ly from Sol$/);
  assert.equal(when.dot, '"·"');
  assert.ok(when.wrapped && when.bLeft === 0 && when.clip.startsWith('inset('), `the header's dot is left dangling: ${JSON.stringify(when)}`);
}
// The new entry offers the star in tonight's sky, and no course for the star the ship has just reached.
// (It does offer one for the nearest star, which from Proxima is the Sun: Alpha Centauri's two are its companions.)
assert.deepEqual(await page.locator('#arrival-entry .entry-actions > *').evaluateAll(els => els.map(el => [el.textContent, el.getAttribute('href')])),
  [['Set course for Sol', null], ['In your sky tonight', 'tonight.html#star=Proxima%20Centauri'], ['Share this course', null]]);
// Share this course hands the phone's share sheet a link to the live site that sets the same course: for a
// destination with notes, its own page, which previews as that star in a chat and passes straight on to the bridge.
// (The sheet itself can't be opened here, so it is stood in for.)
await page.evaluate(() => { navigator.share = async data => { window.shared = data; }; });
await page.click('#arrival-entry [data-share]');
{
  const shared = await page.evaluate(() => window.shared);
  assert.equal(shared.url, 'https://engage.junkdrawer.works/course/proxima-centauri.html');
  // A friend opens it: the bridge, with the course laid in and said on the welcome card, and the page passed on
  // leaves no step in the history.
  const friend = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const f = await friend.newPage();
  f.on('pageerror', e => problems.push(e.message));
  await f.goto(base + 'survey.html');
  await f.goto(shared.url.replace('https://engage.junkdrawer.works/', base));
  await bridgeReady(f);
  assert.equal(f.url(), base, 'the course page left its own address, or the course, in the address bar');
  assert.equal(await f.locator('#target-name').innerText(), 'Proxima Centauri');
  assert.equal(await f.locator('#intro-course').innerText(), 'A course is laid in for Proxima Centauri, 4.2 light years out. Take the helm and engage.');
  await f.goBack();
  assert.match(f.url(), /survey\.html/, 'Back went to the course page, which would only pass on again');
  await friend.close();
  assert.match(shared.text, /^Captain’s log, stardate \d{4}\.\d{3}\. We’ve dropped out of warp at Proxima Centauri, 4\.2\d ly from Sol/);
}
// The two buttons under the log each fit on one line.
for (const id of ['arrival-home', 'arrival-next']) {
  const lines = await page.locator('#' + id).evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map(b => Math.round(b.top))).size; });
  assert.equal(lines, 1, `${id} wraps on a phone`);
}

// Looking for the Sun turns the view toward it.
await page.click('#arrival-home');
await page.waitForTimeout(1800);
const sun = await page.evaluate(() => { const s = engage.state; return [s.yaw, s.pitch]; });
assert.ok(Math.abs(sun[1] - 60.8 * Math.PI / 180) < 0.1, 'the view did not turn toward the Sun');

// The log keeps the trip, and so does a reload.
await page.click('#open-log');
assert.match(await text('#stats'), /1 star visited · 4\.2\d ly travelled/);
assert.match((await text('#records')).replace(/\s+/g, ' '), /^FARTHEST FROM SOL Proxima Centauri · 4\.2\d ly LONGEST TRIP 4\.2\d ly to Proxima Centauri CHARTED DESTINATIONS 2 of 35 KINDS OF STAR 1 of 7 OBAFGKM$/);
// An entry opened from the log says its first line once, not in the heading and again underneath.
await page.locator('.past summary').first().click();
{
  const intro = await page.locator('.past .intro-line').first().innerText();
  assert.equal((await page.locator('.past').first().innerText()).split(intro).length - 1, 1, 'the open entry repeats its first line');
}
await page.reload();
await bridgeReady();
assert.equal(await text('#where'), 'Proxima Centauri', 'the ship forgot where it was');
assert.equal(await shown('#intro'), false);

// Fits a phone: nothing scrolls sideways.
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page scrolls sideways on a phone');

// If the star charts can't be fetched, the bridge says so rather than charting forever.
{
  const cut = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await cut.route('**/data/stars.bin', r => r.abort());
  const p = await cut.newPage();
  await p.goto(base);
  const said = await p.waitForFunction(() => document.getElementById('loading').textContent.includes('Couldn’t chart the stars'), null, { timeout: 15000 }).then(() => true, () => false);
  assert.ok(said, 'the bridge kept charting after the star data failed to load');
  await cut.close();
}

// If the graphics reset mid-flight, the viewscreen comes back instead of staying blank.
const brightness = async () => {
  const png = (await page.screenshot({ clip: { x: 20, y: 160, width: 350, height: 200 } })).toString('base64');
  return page.evaluate(async src => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (d.length / 4) / 3;
  }, png);
};
const loseGraphics = () => page.evaluate(() => { window.__gl = document.getElementById('sky').getContext('webgl').getExtension('WEBGL_lose_context'); __gl.loseContext(); });
await page.evaluate(() => { engage.speed(4); engage.target('Wolf 359'); });
await page.click('#engage');
await page.waitForTimeout(1500);
await loseGraphics();
await page.waitForTimeout(300);
await page.evaluate(() => __gl.restoreContext());
await page.waitForFunction(() => !document.getElementById('arrival').hidden, null, { timeout: 20000 });
await page.evaluate(() => engage.closeSheets());
await page.waitForTimeout(300);
assert.equal(await text('#where'), 'Wolf 359');
assert.ok(await brightness() < 40, 'the viewscreen stayed blank after the graphics came back');
assert.equal(await shown('#lost'), false);

// If they never come back, it offers a restart.
await loseGraphics();
await page.waitForTimeout(3000);
assert.ok(await shown('#lost'), 'no way out of a blank viewscreen');
await Promise.all([page.waitForNavigation(), page.click('#lost-reload')]);
await bridgeReady();
assert.equal(await text('#where'), 'Wolf 359');
assert.equal(await shown('#lost'), false);

// When the browser's storage is full, a new log entry can't be kept.
// The bridge says so, on the arrival and in the log, and drops nothing to make room; once there is room, all of it
// is kept.
{
  const full = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  const p = await full.newPage();
  await p.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => { engage.jump('Sirius'); engage.closeSheets(); });
  assert.equal(await p.locator('#arrival-unsaved').evaluate(el => el.hidden), true, 'the log says it is full when it is not');
  const others = await p.evaluate(() => {
    let n = 0;
    for (let size = 1 << 20; size >= 1; size >>= 1) {
      try { for (;;) localStorage.setItem('another-tool.' + n++, 'x'.repeat(size)); } catch { n--; }
    }
    return Object.keys(localStorage).filter(k => k.startsWith('another-tool.')).length;
  });
  await p.evaluate(() => engage.jump('Procyon'));
  assert.equal(await p.locator('#arrival-unsaved').innerText(), 'The log is full: this entry won’t be kept.');
  await p.evaluate(() => engage.closeSheets());
  await p.click('#open-log');
  assert.match(await p.locator('#log-unsaved').innerText(), /^The log is full: new entries and the ship’s position aren’t being kept\./);
  const state = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.v1')); return { saved: s.log.map(e => e.title), inMemory: engage.state.log.map(e => e.title), others: Object.keys(localStorage).filter(k => k.startsWith('another-tool.')).length }; });
  assert.deepEqual(await state(), { saved: ['Sirius'], inMemory: ['Procyon', 'Sirius'], others }, 'something was dropped to make room, or the unsaved entry was lost from the page');
  // Room again: the next look at the log keeps everything, and the line goes.
  await p.evaluate(() => { engage.closeSheets(); for (const k of Object.keys(localStorage)) if (k.startsWith('another-tool.')) localStorage.removeItem(k); });
  await p.click('#open-log');
  assert.equal(await p.locator('#log-unsaved').evaluate(el => el.hidden), true, 'the log still says it is full once there is room');
  assert.deepEqual((await state()).saved, ['Procyon', 'Sirius']);
  await full.close();
}

// At warp the readout's time keeps step with its distance. The picture of a flight starts slowly: three tenths of
// the way through the cruise to Vega (25 ly, six days at warp 9) the ship has covered 0.05 ly, which is 19 minutes'
// flying, not the two days it used to say; halfway through it is halfway there, three days out.
{
  const flight = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  for (const [t, left, time] of [[0.3, /^25\.0 ly to go$/, /^[1-3][0-9] minutes elapsed$/], [0.5, /^12\.5 ly to go$/, /^3 days elapsed$/]]) {
    const p = await flight.newPage();
    await p.addInitScript(() => localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })));
    await p.goto(base);
    await bridgeReady(p);
    await p.evaluate(t => engage.freeze('Vega', t), t);
    assert.match(await p.locator('#readout-left').innerText(), left);
    assert.match(await p.locator('#readout-time').innerText(), time, `at ${t} of the cruise the time does not match the distance`);
    // The helm has slid away for the flight: nothing in it can be reached with a keyboard either.
    const reached = await p.evaluate(() => [...document.querySelectorAll('#console button, #console input, #console a')].filter(el => { el.focus(); return document.activeElement === el; }).map(el => el.id));
    assert.deepEqual(reached, [], 'the hidden helm takes keyboard focus during a flight');
    await p.close();
  }
  await flight.close();
}

// Clearing the log mid-flight takes the ship straight home: the flight ends there too.
await page.evaluate(() => { engage.speed(1); engage.target('Deneb'); });
await page.click('#engage');
await page.waitForFunction(() => engage.trip?.phase === 'cruise', null, { timeout: 20000 });
assert.equal(await page.locator('#console').evaluate(el => el.inert), true, 'the helm can still be reached during a flight');
await page.click('#open-settings');
await page.click('#clear-log');
await page.click('#clear-log');
assert.equal(await page.evaluate(() => !!engage.trip), false, 'the ship flew on after the log was cleared');
assert.equal(await text('#where'), 'Earth orbit');
assert.equal(await shown('#readout'), false);
assert.equal(await page.evaluate(() => engage.state.log.length), 0);
assert.equal(await page.locator('#console').evaluate(el => el.inert), false, 'the helm stayed out of reach after the log was cleared mid-flight');

// Some catalogue stars are pairs listed at one position (Gliese 3093A and 3094B). Hopping between the two keeps the
// ship at its holding distance: it used to halve it each time, until the ship sat on the star.
{
  const holds = [];
  for (const name of ['Gliese 3093A', 'Gliese 3094B', 'Gliese 3093A', 'Gliese 3094B', 'Gliese 3093A']) {
    holds.push(await page.evaluate(n => { engage.jump(n); engage.closeSheets(); return Math.hypot(...engage.state.offset) * 206264.8; }, name));
  }
  assert.ok(holds.every(h => Math.abs(h - holds[1]) < 1e-6 || h === holds[0]) && Math.min(...holds) >= 0.0099, `hopping between a pair crept toward the star: ${holds.map(h => h.toFixed(4))} AU`);
  await page.click('#open-settings');
  await page.click('#clear-log');
  await page.click('#clear-log');
}

// Voyages: named routes at the top of Set course, each with its stops, how far and how long at the helm's warp.
// Taking one sets course for its first stop; each arrival on it says its leg in the log, the main button names the
// next leg and sets course for it at once, a detour leaves the voyage waiting, and the last leg ticks it off.
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx2.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#intro-go');
  await p.evaluate(() => engage.speed(30));
  await p.tap('#choose');
  assert.equal(await p.locator('#list .group').first().innerText(), 'VOYAGES');
  const first = p.locator('#list [data-voyage="neighbours"]');
  assert.match(await first.innerText(), /The neighbours[\s\S]*Proxima Centauri · Alpha Centauri · Barnard’s Star · Wolf 359 · Lalande 21185 · Sirius · Sol[\s\S]*7 stops · .* at warp 9/);
  await first.tap();
  assert.ok(await p.locator('#picker').evaluate(el => el.hidden));
  assert.equal(await p.locator('#target-name').innerText(), 'Proxima Centauri');
  assert.equal(await p.locator('#target-sub').innerText(), 'The neighbours · leg 1 of 7');
  const arrive = async () => { await p.tap('#engage'); await p.waitForFunction(() => !document.getElementById('arrival').hidden && !engage.trip, null, { timeout: 30000 }); };
  await arrive();
  assert.match(await p.locator('#arrival-entry').innerText(), /VOYAGE\s+Leg 1 of 7 of The neighbours\. Next, Alpha Centauri\./);
  assert.equal(await p.locator('#arrival-next').getAttribute('aria-label'), 'Next leg: Alpha Centauri (0.19 ly)');
  // On two lines that each fit: how far, then the star.
  assert.deepEqual(await p.locator('#arrival-next > span').allInnerTexts(), ['NEXT LEG · 0.19 LY', 'ALPHA CENTAURI']);
  assert.ok(await p.locator('#arrival-next .leg-to').evaluate(el => el.scrollWidth <= el.clientWidth));
  await p.tap('#arrival-next');
  assert.ok(await p.locator('#arrival').evaluate(el => el.hidden) && await p.locator('#picker').evaluate(el => el.hidden), 'Next leg opened a sheet');
  assert.equal(await p.locator('#target-name').innerText(), 'Alpha Centauri');
  // A detour: Vega instead. The voyage waits, and the button still names the next leg, from here.
  await p.evaluate(() => engage.target('Vega'));
  await arrive();
  assert.doesNotMatch(await p.locator('#arrival-entry').innerText(), /Leg \d/);
  assert.match(await p.locator('#arrival-next').getAttribute('aria-label'), /^Next leg: Alpha Centauri \(26\.9 ly\)$/);
  // Set course shows it under way: the leg next, the stop flown struck through, the rest of the way, and a way out.
  await p.tap('#arrival .close');
  await p.tap('#choose');
  assert.match(await p.locator('#list [data-voyage="neighbours"] .name').innerText(), /leg 2 of 7/);
  assert.deepEqual(await p.locator('#list [data-voyage="neighbours"] .stops .flown').allInnerTexts(), ['Proxima Centauri ·']);
  assert.match(await p.locator('#list [data-voyage="neighbours"] .meta:not(.stops)').innerText(), /^The rest · /);
  assert.equal(await p.locator('#list [data-leave]').innerText(), 'Leave The neighbours');
  await p.locator('#list [data-voyage="neighbours"]').tap();
  assert.equal(await p.locator('#target-name').innerText(), 'Alpha Centauri');
  // The rest of the way, leg by leg: each arrival moves it on, the last flies it and ticks it off.
  for (let leg = 2; leg <= 7; leg++) {
    await arrive();
    assert.match(await p.locator('#arrival-entry dl').innerText(), new RegExp(`^VOYAGE\\s+Leg ${leg} of 7`));
    if (leg < 7) await p.tap('#arrival-next');
  }
  assert.match(await p.locator('#arrival-entry').innerText(), /Leg 7 of 7: The neighbours is flown\./);
  assert.ok((await p.locator('#arrival-entry .firsts span').allInnerTexts()).includes('Voyage flown: The neighbours'));
  assert.equal(await p.locator('#arrival-next').innerText(), 'NEXT DESTINATION');
  assert.equal(await p.evaluate(() => engage.state.voyage), null);
  assert.ok(!('voyage' in JSON.parse(await p.evaluate(() => localStorage.getItem('engage.v1')))), 'a flown voyage was kept as under way');
  assert.equal(await p.evaluate(() => engage.state.at), 0, 'the neighbours did not end at home');
  await p.tap('#arrival-next');
  assert.match(await p.locator('#list [data-voyage="neighbours"] .name').innerText(), /flown/);
  // Under way, it is kept across a reload; Leave takes it away and keeps the course.
  await p.locator('#list [data-voyage="atlas"]').tap();
  await p.reload();
  await bridgeReady(p);
  assert.equal(await p.locator('#target-sub').innerText(), 'Starfleet’s atlas · leg 1 of 6');
  await p.tap('#choose');
  await p.tap('#list [data-leave]');
  assert.equal(await p.evaluate(() => engage.state.voyage), null);
  assert.equal(await p.locator('#list [data-leave]').count(), 0);
  assert.equal(await p.locator('#target-name').innerText(), '40 Eridani');
  await ctx2.close();
}

// Earth's sky, held to compare: away from home, pressing and holding the small button beside the arrival's date turns
// the viewscreen to the same direction seen from Earth, with the constellation lines on and the star the ship is at
// marked; letting go brings back the sky from here. With Space it holds too, and a click with no press (a screen
// reader's) turns it on and off. At home, and at a star with no measured distance, there is no button.
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx2.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#intro-go');
  await p.evaluate(() => { engage.state.opts.lines = false; engage.jump('Rigel'); });
  await p.waitForTimeout(400);
  assert.ok(await p.locator('#earth-sky').isVisible(), 'no Earth’s sky button away from home');
  const where = async () => { await p.waitForTimeout(150); return p.evaluate(() => engage.project('Betelgeuse')); };
  const away = await where();
  const b = await p.locator('#earth-sky').boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  assert.ok(await p.evaluate(() => engage.earthHeld));
  const home = await where();
  // From Rigel, 860 light years out, Betelgeuse is behind the ship; from Earth it is in view, near Rigel.
  assert.ok(away.behind && !home.behind, 'the view did not change to Earth’s');
  assert.ok(await p.locator('#earth-note').isVisible());
  assert.equal(await p.locator('#earth-sky').getAttribute('aria-pressed'), 'true');
  assert.ok((await p.evaluate(() => engage.labels())).some(l => l.text === 'Rigel'), 'the ship’s star is not marked in Earth’s sky');
  assert.equal(await p.locator('#fade').evaluate(el => getComputedStyle(el).transitionProperty), 'opacity');
  // Out from Earth, Rigel is already in sight from home, so Earth's sky keeps the same direction.
  assert.equal(await p.evaluate(() => engage.earthTurned), false);
  assert.equal(await p.locator('#earth-note').textContent(), 'Earth’s sky · the same direction from home');
  await p.mouse.up();
  assert.equal(await p.evaluate(() => engage.earthHeld), false);
  const back = await where();
  assert.ok(back.behind === away.behind && (away.behind || (Math.abs(back.x - away.x) < 1 && Math.abs(back.y - away.y) < 1)), 'letting go did not bring back the sky from here');
  assert.ok(await p.locator('#earth-note').isHidden());
  // Space holds it, from the keyboard.
  await p.focus('#earth-sky');
  await p.keyboard.down(' ');
  assert.ok(await p.evaluate(() => engage.earthHeld), 'Space did not hold it');
  await p.keyboard.up(' ');
  assert.equal(await p.evaluate(() => engage.earthHeld), false);
  await p.locator('#earth-sky').evaluate(el => el.click());
  assert.ok(await p.evaluate(() => engage.earthHeld), 'a screen reader’s click did not turn it on');
  // Putting the log away lets go of it.
  await p.tap('#arrival .close');
  assert.equal(await p.evaluate(() => engage.earthHeld), false);
  // On a leg from one star to another the ship arrives facing along that leg, and seen from home the star is often
  // somewhere else: from Sirius to Procyon, off the screen. Then Earth's sky faces Procyon as seen from home, ringed
  // in the clear part of the screen above the log, and letting go brings the arrival's view back.
  await p.evaluate(() => { engage.jump('Sirius'); engage.jump('Procyon'); });
  await p.waitForTimeout(400);
  const fromSirius = await where();
  const away2 = await p.evaluate(() => engage.project('Procyon'));
  await p.locator('#earth-sky').evaluate(el => el.click());
  assert.ok(await p.evaluate(() => engage.earthHeld && engage.earthTurned), 'Earth’s sky did not turn to find Procyon');
  await p.waitForTimeout(200);
  const ring = (await p.evaluate(() => engage.labels())).find(l => l.text === 'Procyon');
  const sheetTop = await p.locator('#arrival').evaluate(el => el.getBoundingClientRect().top);
  const headBottom = await p.locator('#earth-note').evaluate(el => el.getBoundingClientRect().bottom);
  assert.ok(ring && ring.y > headBottom && ring.y < sheetTop, `Procyon is not ringed in sight from home: ${JSON.stringify(ring)} between ${headBottom} and ${sheetTop}`);
  assert.equal(await p.locator('#earth-note').textContent(), 'Earth’s sky · Procyon seen from home');
  await p.locator('#earth-sky').evaluate(el => el.click());
  assert.equal(await p.evaluate(() => engage.earthTurned), false);
  await p.waitForTimeout(150);
  const after = await p.evaluate(() => engage.project('Procyon'));
  assert.ok(Math.abs(after.x - away2.x) < 1 && Math.abs(after.y - away2.y) < 1 && fromSirius, 'letting go did not bring back the arrival’s view');
  // Home: no button.
  await p.evaluate(() => engage.jump('Sol'));
  await p.waitForTimeout(300);
  assert.ok(await p.locator('#earth-sky').isHidden(), 'Earth’s sky offered at home');
  await ctx2.close();
}

// Holding in a planet's orbit, the viewscreen draws that planet beside its star: Proxima b at Proxima, wholly on
// the screen clear of the header and the helm, 20° to 45° from the star, lit from the star's side as a crescent, and
// its name under it. It stays where it is in the sky as the view turns. Not at a star with none held, nor in flight;
// at home it is Earth, beside the Sun.
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await ctx2.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => { engage.jump('Proxima Centauri'); engage.closeSheets(); });
  await p.waitForFunction(() => engage.planet, null, { timeout: 20000 });
  const pl = await p.evaluate(() => engage.planet);
  assert.equal(pl.name, 'Proxima b');
  assert.ok(pl.theta >= 20 && pl.theta <= 45, `Proxima b is ${pl.theta}° from its star`);
  const helm = await p.locator('#console').boundingBox();
  assert.ok(pl.x - pl.r > 0 && pl.x + pl.r < 1280 && pl.y + pl.r < 800 && !(pl.x - pl.r < helm.x + helm.width && pl.y + pl.r > helm.y), `Proxima b is not clear on the screen: ${JSON.stringify(pl)}`);
  // Lit on the side toward the star: a point just inside its edge there is brighter than one on the far side.
  const lit = await p.evaluate(() => {
    const s = engage.project('Proxima Centauri'), q = engage.planet, c = document.getElementById('labels'), k = c.width / c.clientWidth;
    const dx = s.x - q.x, dy = s.y - q.y, l = Math.hypot(dx, dy);
    const at = f => { const x = Math.round((q.x + dx / l * q.r * f) * k), y = Math.round((q.y + dy / l * q.r * f) * k); const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return d[0] + d[1] + d[2]; };
    return [at(0.93), at(-0.93), at(0)];
  });
  assert.ok(lit[0] > 120 && lit[0] > lit[1] * 3 && lit[0] > lit[2] * 3, `Proxima b is not lit from its star: ${lit}`);
  // It stays put in the sky: turned a little, it moves on the screen but not among the stars.
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(300);
  const pl1 = await p.evaluate(() => engage.planet);
  assert.ok(Math.abs(pl1.x - pl.x) > 10 && pl1.dir.every((v, k) => Math.abs(v - pl.dir[k]) < 1e-12), 'the planet did not stay put in the sky as the view turned');
  // Vega has none held; in flight there is none.
  await p.evaluate(() => { engage.jump('Vega'); engage.closeSheets(); });
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => engage.planet), null);
  // Home: Earth beside the Sun, once the view turns to it.
  await p.evaluate(() => { engage.jump('Sol'); engage.closeSheets(); });
  await p.keyboard.press('h');
  await p.waitForFunction(() => engage.planet?.name === 'Earth', null, { timeout: 20000 });
  await ctx2.close();
}

// The captain's log pinned open: on a screen 1,200 pixels wide or more, Pin open on the log's header keeps it as a
// column down the right, part of the bridge (no scrim, the helm in reach), while the ship flies. An arrival's entry
// opens in its place and gives it back with the new entry at its head; autopilot's stops add to it as they come. It
// stays pinned after a reload; Escape leaves it, and its close button unpins it. Narrower, there is no pin, and the
// bridge looks as it always has until you pin it.
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await ctx2.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  assert.ok(await p.locator('#log').isHidden(), 'the log is open before anyone pinned it');
  await p.evaluate(() => engage.jump('Proxima Centauri'));
  await p.evaluate(() => engage.closeSheets());
  await p.click('#open-log');
  assert.ok(await p.locator('#log-pin').isVisible());
  assert.equal(await p.locator('#log-pin').getAttribute('aria-pressed'), 'false');
  await p.click('#log-pin');
  const docked = () => p.evaluate(() => { const l = document.getElementById('log'); return !l.hidden && l.classList.contains('docked') && document.getElementById('scrim').hidden && !document.getElementById('bridge').inert; });
  assert.ok(await docked(), 'pinning did not leave the log open beside the bridge');
  assert.equal(await p.locator('#log-pin').innerText(), 'PINNED');
  const box = await p.locator('#log').boundingBox();
  assert.ok(box.x > 640 && box.x + box.width <= 1280 && box.height > 600, `the pinned log is not a column down the right: ${JSON.stringify(box)}`);
  // The helm is still in reach: a course can be set and flown with the log open.
  assert.equal(await p.locator('#choose').evaluate(el => el.closest('[inert]')), null);
  const before = await p.locator('#entries .past').count();
  await p.evaluate(() => engage.jump('Vega'));
  assert.ok(await p.locator('#arrival').isVisible() && await p.locator('#log').isHidden(), 'the arrival did not open in the log’s place');
  await p.click('#arrival .close');
  assert.ok(await docked(), 'putting the arrival away did not give the log back');
  assert.equal(await p.locator('#entries .past').count(), before + 1, 'the new entry is not in the pinned log');
  assert.match(await p.locator('#entries .past').first().innerText(), /Vega/);
  // Escape leaves it pinned; a reload keeps it.
  await p.keyboard.press('Escape');
  assert.ok(await docked(), 'Escape put the pinned log away');
  await p.reload();
  await bridgeReady(p);
  await p.waitForFunction(() => document.getElementById('log').classList.contains('docked') && !document.getElementById('log').hidden);
  // Autopilot's stops add to it as they are made.
  await p.evaluate(() => engage.speed(30));
  const n0 = await p.locator('#entries .past').count();
  await p.evaluate(() => engage.autopilot(true));
  await p.waitForFunction(n => document.querySelectorAll('#entries .past').length > n, n0, { timeout: 30000 });
  assert.ok(await docked(), 'the pinned log went away on autopilot');
  await p.evaluate(() => engage.autopilot(false));
  // Its close button unpins it, and so it stays.
  await p.click('#log .close');
  assert.ok(await p.locator('#log').isHidden());
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).opts.pinLog), false);
  // On a narrower screen there is no pin.
  await p.setViewportSize({ width: 1100, height: 800 });
  await p.click('#open-log');
  assert.ok(await p.locator('#log-pin').isHidden(), 'the pin is offered on a screen under 1,200 pixels');
  await ctx2.close();
}

// Autopilot: from Bridge settings the helm and the round buttons go and the ship flies itself, to the nearest
// destination with notes not yet in the log, holding at each with two lines on screen and writing each stop in the
// log, then on again. A voyage under way flies its next leg. A touch takes the helm back without picking a star; at a
// keyboard F starts it and any key stops it.
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx2.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#intro-go');
  await p.evaluate(() => engage.speed(30));
  await p.tap('#open-settings');
  await p.tap('#autopilot');
  assert.ok(await p.evaluate(() => engage.auto));
  assert.ok(await p.locator('#settings').evaluate(el => el.hidden), 'Bridge settings stayed up');
  assert.ok(await p.locator('#console').evaluate(el => el.inert), 'the helm stayed in reach');
  assert.equal(await p.locator('.hud-buttons').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  const stop = async n => p.waitForFunction(n => engage.state.log.length >= n && !engage.trip && !document.getElementById('caption').hidden, n, { timeout: 30000 });
  await stop(1);
  assert.equal(await p.locator('#cap-title').innerText(), 'Proxima Centauri', 'the first stop is not the nearest destination');
  assert.match(await p.locator('#cap-sub').innerText(), /4\.2\d ly from Sol$/);
  assert.ok(await p.locator('#arrival').evaluate(el => el.hidden), 'the arrival’s log came up under autopilot');
  // On by itself, after the hold: Alpha Centauri, next door.
  await stop(2);
  assert.equal(await p.locator('#cap-title').innerText(), 'Alpha Centauri');
  assert.deepEqual(await p.evaluate(() => engage.state.log.map(e => e.title)), ['Alpha Centauri', 'Proxima Centauri']);
  // A touch on the viewscreen takes the helm back, and picks no star.
  await p.waitForFunction(() => engage.trip?.phase === 'cruise', null, { timeout: 30000 });
  await p.touchscreen.tap(195, 400);
  assert.equal(await p.evaluate(() => engage.auto), false);
  await p.waitForFunction(() => !engage.trip, null, { timeout: 30000 });
  assert.equal(await p.locator('#console').evaluate(el => el.inert), false, 'the helm did not come back');
  assert.ok(await p.locator('#caption').evaluate(el => el.hidden));
  assert.equal(await p.evaluate(() => engage.state.target), null, 'the touch that stopped it picked a star');
  assert.ok(await p.locator('#arrival').evaluate(el => !el.hidden), 'the flight under way did not end in its log entry');
  const n = await p.evaluate(() => engage.state.log.length);
  await p.waitForTimeout(1500);
  assert.equal(await p.evaluate(() => engage.state.log.length), n, 'it went on flying after the helm was taken back');
  // Once it has been everywhere, its later rounds fly and hold but write nothing: a night left on adds no repeats.
  // It goes on round them all, not back and forth between two.
  const everywhere = await p.evaluate(() => {
    engage.closeSheets();
    engage.state.log = engage.autoStars().filter(i => i > 0).map((star, k) => ({ id: Date.now() - 1e6 + k, star, title: `Star ${star}`, stardate: '2026.880', intro: '', sections: [], ly: 1 }));
    engage.autopilot(true);
    return engage.state.log.length;
  });
  await p.waitForFunction(() => engage.autoSince?.length >= 3 && !engage.trip && !document.getElementById('caption').hidden, null, { timeout: 60000 });
  const since = await p.evaluate(() => engage.autoSince);
  assert.equal(new Set(since).size, since.length, `autopilot flew back to a star it had just been to: ${since}`);
  assert.equal(await p.evaluate(() => engage.state.log.length), everywhere, 'autopilot wrote a repeat visit in the log');
  assert.notEqual(await p.locator('#cap-title').innerText(), '', 'a repeat stop showed no caption');
  await p.evaluate(() => engage.autopilot(false));
  await p.waitForFunction(() => !engage.trip, null, { timeout: 30000 });
  await p.evaluate(() => engage.closeSheets());
  // With a voyage under way it flies the next leg, not the nearest new star.
  // (Sirius is in the log already, and a voyage's leg is written all the same: the log marks the voyage flown.)
  await p.evaluate(() => { engage.closeSheets(); engage.state.voyage = { id: 'brightest', leg: 0 }; engage.autopilot(true); });
  await stop(everywhere + 1);
  assert.equal(await p.locator('#cap-title').innerText(), 'Sirius', 'autopilot did not fly the voyage’s next leg');
  assert.match(await p.locator('#cap-sub').innerText(), /^Leg 1 of 7, The brightest seven · /);
  await p.evaluate(() => engage.autopilot(false));
  await ctx2.close();
}
// At a keyboard: F starts it, and any key stops it, doing nothing else.
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx2.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.click('#intro-go');
  await p.evaluate(() => engage.speed(30));
  await p.locator('body').press('f');
  assert.ok(await p.evaluate(() => engage.auto), 'F did not start autopilot');
  await p.waitForFunction(() => engage.state.log.length >= 1 && !engage.trip, null, { timeout: 30000 });
  const fov = await p.evaluate(() => engage.state.fov);
  await p.keyboard.press('-');
  assert.equal(await p.evaluate(() => engage.auto), false, 'a key did not take the helm back');
  assert.equal(await p.evaluate(() => engage.state.fov), fov, 'the key that stopped it zoomed out as well');
  assert.equal(await p.locator('#console').evaluate(el => el.inert), false);
  await ctx2.close();
}

// The planetary survey: flip through the files, set course from one, and play the drill.
await page.goto(base + 'survey.html#K');
await page.waitForFunction(() => window.survey);
assert.match(await text('#file h2'), /Class K/);
await page.click('#next');
assert.match(await text('#file h2'), /Class H/);
assert.equal(new URL(page.url()).hash, '#H');
await page.locator('#strip .chip').nth(0).click();
assert.match(await text('#file h2'), /Class M/);
assert.equal(await page.getByRole('button', { name: 'Class M: Earth-like' }).count(), 1, 'the thumbnails are not buttons to a screen reader');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the survey scrolls sideways on a phone');
await page.waitForTimeout(1500); // the sharp map paints in the background
const lit = await page.evaluate(() => {
  const c = document.getElementById('globe'), g = c.getContext('2d');
  const d = g.getImageData(c.width * 0.35, c.height * 0.35, c.width * 0.3, c.height * 0.3).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4) / 3;
});
assert.ok(lit > 40, 'the planet is not drawn');
// With reduced motion the globe stands still, so it isn't drawn again and again.
await page.emulateMedia({ reducedMotion: 'reduce' });
const redraws = await page.evaluate(() => new Promise(done => {
  const put = CanvasRenderingContext2D.prototype.putImageData;
  let n = 0;
  CanvasRenderingContext2D.prototype.putImageData = function (...a) { if (this.canvas.id === 'globe') n++; return put.apply(this, a); };
  setTimeout(() => { CanvasRenderingContext2D.prototype.putImageData = put; done(n); }, 1500);
}));
await page.emulateMedia({ reducedMotion: null });
assert.ok(redraws <= 1, `the globe was drawn ${redraws} times in 1.5 seconds without moving`);
await Promise.all([page.waitForNavigation(), page.locator('#file .fly').first().click()]);
await bridgeReady();
assert.equal(await text('#target-name'), 'Proxima Centauri', 'set course did not choose the star');
assert.equal(new URL(page.url()).search, '', 'the course link stayed in the address');

// Moons and dwarf planets are a third group of files: Europa has its real readings, the class it would be filed under,
// that class's file a tap away, and a creature grown under its ice. Titan, whose seas are methane, has none yet.
await page.goto(base + 'survey.html#europa');
await page.waitForFunction(() => window.survey && document.querySelector('#file h2'));
assert.equal(await text('#file h2'), 'Europa');
assert.equal(await text('#counter'), 'FILE 20 OF 26');
assert.equal(await page.locator('#badge').innerText(), 'FILED AS\nP');
assert.deepEqual(await page.locator('#strip .strip-group').allInnerTexts(), ['STARFLEET', 'REAL, UNNAMED', 'MOONS AND DWARF PLANETS']);
assert.match(await text('#file .readings'), /3,122 km across/);
assert.match(await text('#file .readings'), /Round Jupiter every 3\.6 days/);
assert.equal(await page.title(), 'Europa · Planetary survey · Engage');
await page.locator('#file a', { hasText: 'Read the Class P file' }).click();
await page.waitForFunction(() => /Class P/.test(document.querySelector('#file h2').textContent));
await page.goto(base + 'survey.html#titan');
await page.waitForFunction(() => document.querySelector('#file h2')?.textContent === 'Titan');
assert.match(await text('#file .readings'), /94 K \(−179 °C\)/);
assert.equal(await page.locator('#file a', { hasText: 'Grow a creature' }).count(), 0, 'Titan grows a creature from rules for water');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'a moon’s file scrolls sideways on a phone');
// A link to a file far down the strip opens with its globe in view: the strip scrolls to its thumbnail, not the page.
{
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await wide.newPage();
  await p.goto(base + 'survey.html#titan');
  await p.waitForFunction(() => document.querySelector('#file h2')?.textContent === 'Titan');
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => scrollY), 0, 'the page scrolled down to the moon’s thumbnail, taking the globe off the top');
  await wide.close();
}
await page.goto(base + 'survey.html#enceladus');
await page.waitForFunction(() => document.querySelector('#file h2')?.textContent === 'Enceladus');
await Promise.all([page.waitForNavigation(), page.locator('#file a', { hasText: 'Grow a creature for Enceladus' }).click()]);
await page.waitForFunction(() => window.xeno?.current);
assert.deepEqual(await page.evaluate(() => [xeno.current.world?.name, xeno.current.env.habitat]), ['Enceladus', 'under-ice']);
assert.match(await text('#specimen'), /Enceladus circles Saturn/);

await page.goto(base + 'survey.html#drill');
await page.waitForFunction(() => window.survey?.world);
let world = await page.evaluate(() => survey.world.cls.id);
await page.click(`#choices [data-id="${world}"]`);
assert.match(await text('#verdict-head'), /Record filed/);
assert.match(await text('#score'), /streak 1/i);
await page.click('#drill-next');
world = await page.evaluate(() => survey.world.cls.id);
const wrong = await page.evaluate(() => survey.world.choices.find(c => c.id !== survey.world.cls.id).id);
await page.click(`#choices [data-id="${wrong}"]`);
assert.match(await text('#verdict-head'), /wouldn’t fool anyone/);
assert.match(await text('#score'), /streak 0 · best 1/i);
// Under the score, the files used so far and, once a slip has been made twice, the one made most often.
const said = sel => page.locator(sel).evaluate(el => (el.hidden ? null : el.textContent));
assert.equal(await said('#used-count'), '1 of 17 files used');
assert.equal(await page.locator('#used-badges li.on').count(), 1);
assert.equal(await page.locator('#used-badges li').count(), 17);
assert.equal(await said('#caught'), null, 'one slip was called the one made most often');
await page.evaluate(([w, x]) => { const s = JSON.parse(localStorage.getItem('engage.survey.v1')); s.mixed[`${w}>${x}`] = 2; localStorage.setItem('engage.survey.v1', JSON.stringify(s)); }, [world, wrong]);
{
  const p = await ctx.newPage();
  await p.goto(base + 'survey.html#drill');
  await p.waitForFunction(() => window.survey?.world);
  assert.match(await p.locator('#caught').textContent(), /^Most often caught out: .+, mistaken for .+ \(2 times\)$/);
  await p.close();
}
// A long sitting: 60 more worlds. Each quiz world is painted for itself and let go with it, so the painted maps
// kept for good stay at the 17 survey files' own (two sizes each) however long the quiz runs.
for (let n = 0; n < 60; n++) {
  await page.click('#drill-next');
  assert.equal(await page.evaluate(() => [survey.world.cls, ...survey.world.choices].some(c => c.of !== undefined)), false, 'a moon came up in Cover your tracks');
  await page.evaluate(() => survey.answer(survey.world.cls.id));
  if (n % 20 === 0) await page.waitForTimeout(400); // let a sharp map finish painting now and then, as it would at a person's pace
}
const kept = await page.evaluate(() => survey.cached);
assert.ok(kept <= 34, `the quiz left ${kept} painted maps behind after 62 questions`);
assert.match(await text('#score'), /streak 60 · best 60/i);
world = await page.evaluate(() => survey.world.cls.id);
await page.click('#verdict-file');
assert.equal(await shown('#files'), true, 'reading the file did not open it');
assert.equal(await page.evaluate(() => location.hash.slice(1)), world);
// Cover your tracks' other rounds. Sensors only: no picture, and no word on air, water or life, which are the files'
// own. The other way: a file and four worlds, by their numbers alone. Neither changes how the streak is kept.
{
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'survey.html#drill');
  await p.waitForFunction(() => window.survey?.world);
  await p.click('[data-round="sensors"]');
  assert.equal(await p.evaluate(() => survey.world.kind), 'sensors');
  assert.equal(await p.locator('#drill-view').isVisible(), false, 'sensors only showed the picture');
  assert.deepEqual(await p.locator('#readings dt').allTextContents(), ['Width', 'Mass', await p.evaluate(() => (['J', 'T', 'hot-jupiter', 'ice-giant', 'sub-neptune'].includes(survey.world.cls.id) ? 'Temperature' : 'Surface')), 'Year']);
  const streak0 = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.survey.v1')).streak);
  await p.click(`#choices [data-id="${await p.evaluate(() => survey.world.cls.id)}"]`);
  assert.match(await p.locator('#verdict-head').textContent(), /Record filed/);
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.survey.v1')).streak), streak0 + 1);
  await p.click('[data-round="reverse"]');
  const rev = await p.evaluate(() => ({ id: survey.world.cls.id, worlds: survey.world.worlds.map(w => w.cls.id) }));
  assert.equal(await p.locator('#choices .choice').count(), 4);
  assert.equal(await p.locator('#choices canvas').count(), 0, 'the other way round showed the worlds’ pictures, which match their files’');
  assert.equal(await p.locator('#drill-view').isVisible(), false);
  assert.match(await p.locator('#prompt').textContent(), /^Which of these worlds would pass for the .+ file\?$/);
  const slip = rev.worlds.find(id => id !== rev.id);
  await p.click(`#choices [data-id="${slip}"]`);
  // Named as it would be mid-sentence: "for a lava world", not "for Lava world".
  const asked = await p.evaluate(() => { const c = survey.world.cls; return c.inText || (c.letter ? `Class ${c.letter}` : c.name); });
  assert.ok((await p.locator('#verdict-head').textContent()).startsWith(`That world wouldn’t pass for ${asked}. It’s `));
  assert.equal(await p.locator('#choices .right').getAttribute('data-id'), rev.id);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.survey.v1')));
  assert.equal(saved.streak, 0);
  assert.equal(saved.round, 'reverse', 'the round played last was not kept');
  assert.ok(saved.mixed[`${slip}>${rev.id}`] >= 1, 'a slip the other way round went on the record the wrong way about');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the other way round scrolls sideways on a phone');

  // Today's exam: the same five worlds for everyone today. It is left part-way and picked up again, then finished; it
  // leaves the streak alone, and once it's done the page shows the result and the line to send, not another world.
  const { exam: examFor, today: dayNow } = await import('../js/quiz.js');
  const want = examFor(dayNow()).map(q => q.cls.id);
  await p.click('[data-round="exam"]');
  assert.equal(new URL(p.url()).hash, '#exam');
  assert.equal(await p.locator('#exam-head').textContent(), 'Today’s exam · World 1 of 5');
  const marks = [true, false, true, true, true];
  const take = async right => {
    const w = await p.evaluate(() => ({ id: survey.world.cls.id, offered: survey.world.kind === 'reverse' ? survey.world.worlds.map(x => x.cls.id) : survey.world.choices.map(x => x.id) }));
    await p.click(`#choices [data-id="${right ? w.id : w.offered.find(id => id !== w.id)}"]`);
    return w.id;
  };
  const got = [await take(true)];
  await p.click('#drill-next');
  got.push(await take(false));
  {
    const q = await ctx.newPage();
    await q.goto(base + 'survey.html#exam');
    await q.waitForFunction(() => window.survey?.world);
    assert.equal(await q.locator('#exam-head').textContent(), 'Today’s exam · World 3 of 5', 'an exam left part-way started again');
    await q.close();
  }
  for (const right of marks.slice(2)) { await p.click('#drill-next'); got.push(await take(right)); }
  assert.deepEqual(got, want, 'today’s exam asked other worlds than everyone else’s');
  assert.equal(await p.locator('#drill-next').textContent(), 'See how you did');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.survey.v1')).streak), 0, 'the exam counted on the streak');
  await p.click('#drill-next');
  assert.equal(await p.locator('#exam-result').isVisible(), true);
  assert.equal(await p.locator('#drill-play').isVisible(), false);
  assert.equal(await p.locator('#exam-score').textContent(), '4 of 5 filed');
  assert.deepEqual(await p.locator('#exam-marks li').evaluateAll(l => l.map(x => x.className)), ['ok', 'bad', 'ok', 'ok', 'ok']);
  assert.match(await p.locator('#exam-line').textContent(), /^Cover your tracks, \d+ [A-Z][a-z]{2}: 4 of 5 filed$/);
  await p.reload();
  await p.waitForFunction(() => window.survey);
  assert.equal(await p.locator('#exam-result').isVisible(), true, 'a finished exam could be taken again');
  await p.click('[data-round="files"]');
  assert.equal(await p.evaluate(() => survey.world.kind), 'files');
  assert.equal(await p.locator('#drill-view').isVisible(), true);
  await p.close();
}

// Two tabs: one at a Standard world, the other opening today's exam. The Standard answer counts on the streak, not on
// the exam, and one exam world answered in both tabs is marked once.
{
  const two = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await two.newPage(), b = await two.newPage();
  a.on('pageerror', e => problems.push(e.message));
  const kept = () => a.evaluate(() => JSON.parse(localStorage.getItem('engage.survey.v1')));
  await a.goto(base + 'survey.html#drill');
  await a.waitForFunction(() => window.survey?.world);
  await b.goto(base + 'survey.html#exam');
  await b.waitForFunction(() => window.survey?.world?.exam);
  await a.waitForFunction(() => JSON.parse(localStorage.getItem('engage.survey.v1')).round === 'exam');
  await a.evaluate(() => survey.answer(survey.world.cls.id));
  let s = await kept();
  assert.deepEqual(s.exam.marks, [], 'a Standard world answered in one tab went on the exam open in another');
  assert.equal(s.streak, 1, 'a Standard world answered while another tab sat the exam missed the streak');
  await a.click('[data-round="exam"]');
  assert.equal(await a.locator('#exam-head').textContent(), 'Today’s exam · World 1 of 5');
  await b.evaluate(() => survey.answer(survey.world.cls.id));
  await a.evaluate(() => survey.answer(survey.world.cls.id));
  s = await kept();
  assert.deepEqual(s.exam.marks, [true], 'one exam world answered in two tabs was marked twice');
  await two.close();
}

// Long-range sensors: Planet hunt. Tap three dips on the star's light for the planet's year, set the line at the floor
// of the dip for its size, then file it. A tap on nothing says so; three dips of two planets aren't a year; dips too
// faint to see are found by trying years until the passes add up; and the wobble gives 51 Pegasi b's mass.
{
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const status = () => p.locator('#hunt-status').textContent();
  // Taps the real plot at a moment in the curve, as a finger would.
  const tapAt = async at => {
    const box = await p.locator('#hunt-plot').boundingBox();
    const L = await p.evaluate(() => ({ rowDays: survey.hunt.curve.level.rowDays, rows: survey.hunt.curve.rows, wob: !!survey.hunt.curve.level.wobble }));
    const rowH = L.wob ? 200 : L.rows > 3 ? 88 : 110, row = Math.floor(at / L.rowDays);
    await p.mouse.click(box.x + 10 + (at - row * L.rowDays) / L.rowDays * (box.width - 20), box.y + row * rowH + rowH / 2);
  };
  const firstOf = (name, n = 3) => p.evaluate(([name, n]) => { const e = survey.huntTest.events(); const pl = name || e[0].planet.name; return e.filter(x => x.planet.name === pl).slice(0, n).map(x => x.at); }, [name, n]);
  const setLine = v => p.locator('#depth-range').evaluate((r, v) => { r.value = Math.round(v); r.dispatchEvent(new Event('input')); }, v);
  await p.goto(base + 'survey.html#M');
  await p.waitForFunction(() => window.survey);
  await p.click('[data-mode="hunt"]');
  await p.waitForFunction(() => survey.hunt.curve);
  assert.match(new URL(p.url()).hash, /^#hunt=1\.\d+$/);
  assert.equal(await p.title(), 'Long-range sensors · Planetary survey · Engage');
  await p.goto(base + 'survey.html#hunt=1.42');
  await p.waitForFunction(() => survey.hunt.curve?.seed === 42);
  const curve42 = await p.evaluate(() => Array.from(survey.hunt.curve.y.slice(0, 20)));
  const dips = await firstOf();
  await tapAt(dips[0] + 1.2 * (dips[1] - dips[0]) / 2.4);
  assert.match(await status(), /^Nothing there but scatter/);
  await tapAt(dips[0]);
  assert.equal(await status(), '1 of 3. Tap another dip.');
  await tapAt(dips[1]); await tapAt(dips[2]);
  const found = await p.evaluate(() => ({ stage: survey.hunt.stage, name: survey.hunt.found.name, days: survey.hunt.found.days, depth: survey.hunt.found.k ** 2, file: survey.hunt.found.file }));
  assert.equal(found.stage, 'depth');
  assert.match(await status(), /^One every [\d.]+ days: that is its year\. Now drag the line to the bottom of the dips\.$/);
  await setLine(found.depth * 1e5 * 0.5);
  await p.click('#depth-go');
  assert.equal(await status(), 'Not quite: the floor of the dip is lower than that.');
  await setLine(found.depth * 1e5);
  await p.click('#depth-go');
  assert.match(await status(), /dimmer, so the planet is about [\d.]+% of its star’s width: about .+\.$/);
  assert.equal(await p.locator('#hunt-choices .choice').count(), 4);
  await p.click(`#hunt-choices [data-file="${found.file}"]`);
  assert.equal(await p.locator('#reveal-head').textContent(), `Filed. It’s ${found.name}.`);
  assert.equal(await p.locator('#reveal-links a').first().getAttribute('href'), `#${found.file}`);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the planet hunt scrolls sideways on a phone');
  // The same link draws the same curve: a teacher can send one to a class.
  const q = await ctx.newPage();
  await q.goto(base + 'survey.html#hunt=1.42');
  await q.waitForFunction(() => survey.hunt.curve);
  assert.deepEqual(await q.evaluate(() => Array.from(survey.hunt.curve.y.slice(0, 20))), curve42);
  await q.close();

  // Seven worlds: dips of two planets aren't one planet's year.
  await p.click('[data-level="3"]');
  const [b0, b1] = await firstOf('TRAPPIST-1 b', 2), [c0] = await firstOf('TRAPPIST-1 c', 1);
  await tapAt(b0); await tapAt(c0); await tapAt(b1);
  assert.match(await status(), /^Those dips aren’t one planet’s/);
  // Too faint to see: try the planet's own year, and the passes line up. 55 Cancri e (seed 1) at twice its year shows
  // two dips; π Mensae c (seed 2), whose year is six days, lines up too.
  const tryYear = d => p.locator('#fold-year').evaluate((r, v) => { r.value = v; r.dispatchEvent(new Event('input')); }, Math.round(Math.log(d / 0.5) / Math.log(16) * 3000));
  await p.click('[data-level="2"]');
  assert.equal(await p.locator('#hunt-fold').isVisible(), true);
  for (const seed of [1, 2]) {
    await p.goto(`${base}survey.html#hunt=2.${seed}`);
    await p.waitForFunction(s => survey.hunt.curve?.seed === s, seed);
    const P = await p.evaluate(() => survey.hunt.curve.planets[0].days);
    if (seed === 1) { await tryYear(P * 2); assert.equal(await status(), 'Two dips in one fold: the year is half this.'); }
    await tryYear(P * 1.1);
    assert.equal(await status(), 'Drag the year until a dip shows in the passes added up.');
    await tryYear(P);
    assert.match(await status(), /^The passes line up\./);
  }
  // The wobble: 51 Pegasi b, at least half Jupiter's mass, and Set course for its star.
  await p.click('[data-level="4"]');
  for (const at of await firstOf()) await tapAt(at);
  assert.match(await status(), /^One every 4\.23 days: that is its year\. Now drag the line to the top of the wave\.$/);
  await setLine(56);
  await p.click('#depth-go');
  assert.match(await status(), /The star swings 56 m\/s each way, so the planet weighs at least 0\.47 times as much as Jupiter\.$/);
  await p.locator('#hunt-choices .choice:not([data-file="hot-jupiter"])').first().click();
  assert.match(await p.locator('#reveal-head').textContent(), /^Not that file: by its size and year it’s a hot Jupiter\. It’s 51 Pegasi b\.$/);
  assert.equal(await p.locator('#reveal-links a', { hasText: 'Set course' }).getAttribute('href'), './?course=Helvetios');
  await p.close();
}

// A picture nobody can see isn't drawn. Five rooms animate a canvas, and each kept drawing it sixty times a second
// with the canvas scrolled out of sight (a long file read to its end, the notebook under a viewscreen); the survey's
// globe, painted pixel by pixel, kept a whole processor core busy that way. Each room now stops drawing while its
// canvas is off the screen and picks up again within a few frames of its coming back. On the screen the survey's
// globe still turns, but is drawn at most 30 times a second.
{
  const quiet = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await quiet.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const frames = n => p.evaluate(n => new Promise(done => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : done()); f(); }), n);
  const settled = () => p.waitForFunction(() => !window.contact.busy, null, { timeout: 20000 });
  const rooms = [
    ['survey', '#globe', () => window.survey, null],
    ['xeno', '#tank', () => window.xeno?.current, null],
    ['missions', '#map', () => window.missions, null],
    ['maru', '#plot', () => window.maru, async () => { await p.tap('#start'); }],
    ['contact', '#screen', () => window.contact, async () => { await p.tap('#start'); await settled(); }],
  ];
  for (const [room, canvas, ready, begin] of rooms) {
    // (The two games' pages are short at the start: on a shorter screen their viewscreens scroll right off it.)
    await p.setViewportSize(begin ? { width: 390, height: 300 } : { width: 390, height: 844 });
    await p.goto(`${base}${room}.html`);
    await p.waitForFunction(ready);
    if (begin) await begin();
    const draws = () => p.evaluate(name => window[name].draws, room);
    const pixels = () => p.locator(canvas).evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });
    await p.waitForFunction(name => window[name].draws > 2, room);
    const [n0, t0, look0] = [await draws(), Date.now(), room === 'survey' ? await pixels() : 0];
    await p.waitForTimeout(700);
    const [n1, secs] = [await draws(), (Date.now() - t0) / 1000];
    assert.ok(n1 - n0 >= 3, `${room}’s picture stands still on the screen: ${n1 - n0} draws in ${secs.toFixed(1)} s`);
    if (room === 'survey') {
      assert.ok((n1 - n0) / secs <= 34, `the globe is drawn ${((n1 - n0) / secs).toFixed(0)} times a second`);
      assert.notEqual(await pixels(), look0, 'the globe is drawn but does not turn');
    }
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await frames(4);
    assert.ok(await p.locator(canvas).evaluate(c => c.getBoundingClientRect().bottom) < -125, `${room}’s canvas is still near the screen at the end of the page`);
    const away = await draws();
    await p.waitForTimeout(500);
    assert.equal(await draws(), away, `${room} went on drawing a picture scrolled out of sight`);
    await p.evaluate(() => window.scrollTo(0, 0));
    await frames(4);
    assert.ok(await draws() > away, `${room}’s picture was not drawn again when it came back on the screen`);
  }
  await quiet.close();
}

// On a slow phone (the processor slowed to a quarter) the survey's globe is drawn smaller and stretched back up to
// the same place on the screen, so a tap on Next isn't held up behind it.
{
  const slow = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await slow.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const cdp = await slow.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(base + 'survey.html#M');
  await p.waitForFunction(() => window.survey);
  const box0 = await p.locator('#globe').boundingBox();
  await p.waitForFunction(() => survey.globeScale < 1, null, { timeout: 30000 });
  await p.waitForFunction(() => { const c = document.getElementById('globe'); return c.width < Math.round(c.getBoundingClientRect().width * 2) * 0.8; }, null, { timeout: 10000 });
  assert.deepEqual(await p.locator('#globe').boundingBox(), box0, 'the smaller globe moved or shrank on the screen');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await slow.close();
}

// The Kobayashi Maru: reached from the bridge, played to the end, graded and remembered.
await page.goto(base);
await bridgeReady();
await Promise.all([page.waitForNavigation(), page.click('#open-maru')]);
await page.waitForFunction(() => window.maru);
assert.equal(await shown('#brief'), true);
assert.deepEqual(await page.locator('.jd-foot a').allInnerTexts(), ['Part of junkdrawer.works', 'Privacy', 'Engage'], 'the footer’s own link comes before the drawer’s');
assert.equal(await shown('#rewrite'), false, 'the simulator can be reprogrammed before taking the test');
await page.click('#start');
const order = async id => {
  await page.click(`.order[data-id="${id}"]`);
  await page.waitForFunction(() => !maru.busy, null, { timeout: 20000 });
};
await order('hail-maru');
assert.match(await text('#comms'), /381 aboard/);
await order('enter');
assert.equal(await shown('#alert'), true, 'no red alert when the Klingons arrive');
assert.match(await text('#caption'), /Leave Klingon space/);
await order('beam');
assert.equal(await text('#rescued'), '75');
await order('beam');
await order('warp');
assert.equal(await page.locator('.order').count(), 0, 'orders still offered after the simulation ended');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the Kobayashi Maru scrolls sideways on a phone');
await page.click('#read-eval');
assert.equal(await text('#eval-title'), 'The lifeboat');
assert.equal(await page.locator('.grade').count(), 4);
// A grade below an A says what cost it: never firing is the best thing about this run's restraint, and still a B.
assert.equal(await page.locator('.grade', { hasText: 'Restraint' }).locator('.w').innerText(), 'You never fired a shot, but you broke the treaty to be there.');
// How rare the ending is, and that nobody brings more than 150 home.
assert.match(await text('#eval-archive'), /^EXAMINERS’ ARCHIVE\s+About 1 in 14 ends this way, of 400,000 trials the simulator ran with orders given at random\.$/);
assert.match(await text('#eval-note'), /Nobody has brought more than 150 home\./);
// Judgment never goes above a B, and a B says so; no other grade does.
{
  const judgment = await page.evaluate(() => maru.evaluate().grades.find(x => x.name === 'Judgment').letter);
  assert.deepEqual(await page.locator('.grade .ceil').evaluateAll(els => els.map(el => [el.closest('.grade').querySelector('.n').textContent, el.textContent])), judgment === 'B' ? [['Judgment', 'The best this simulation allows']] : []);
}
await page.click('#again');
assert.match(await text('#runs'), /The lifeboat/);
// The record on the briefing: the endings as a collection (the ones not seen yet stay unnamed), the best grades and the runs taken.
assert.equal(await text('#endings-n'), '1 OF 9');
assert.deepEqual(await page.locator('#endings li').evaluateAll(els => els.map(el => (el.className ? el.textContent : '?')).filter(t => t !== '?').concat(els.length)), ['The lifeboat', 9]);
assert.match((await text('#best')).replace(/\s+/g, ' '), /^[A-F] COMPASSION [A-F] JUDGMENT B RESTRAINT [A-F] NERVE$/);
assert.equal(await text('#taken'), '1 RUN TAKEN');
assert.equal(await shown('#rewrite'), true, 'no way to reprogram the simulator after a run');
await page.click('#rewrite');
await order('enter');
for (let i = 0; i < 6; i++) await order('beam');
await order('warp');
await page.click('#read-eval');
assert.equal(await text('#eval-title'), 'Changed the rules');
await page.click('#again');
assert.equal(await text('#endings-n'), '2 OF 9');
assert.equal(await text('#taken'), '2 RUNS TAKEN');
assert.match((await text('#best')).replace(/\s+/g, ' '), /^A COMPASSION A JUDGMENT A RESTRAINT [A-F] NERVE$/, 'the best grades did not take the better run’s');
assert.deepEqual(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.maru.v1')); return [s.runs.length, s.seen, s.taken]; }), [2, ['The lifeboat', 'Changed the rules'], 2]);
// Each run keeps its line, which the captain's log gives it.
assert.match(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.maru.v1')).runs[1].line), /^Kobayashi Maru: Changed the rules, (\d+ home, )?[A-F]( [A-F])+$/);
// Today's simulation: the same dice for everyone that day, taken once, then the line to send on the briefing. Share
// this run sends that line with a link that plays the run back for a friend, turn by turn, to their evaluation, with
// nothing put on the friend's record; and then they can take the same simulation, dice and all.
{
  const mine = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await mine.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await mine.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  assert.equal(await p.locator('#daily-note').innerText(), 'The same dice for every cadet today.');
  await p.click('#daily-start');
  const { dailySeed, today } = await import('../js/maru-sim.js');
  const day = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  assert.equal(await p.evaluate(() => maru.game.seed), dailySeed(day));
  assert.equal(day, today());
  for (const id of ['enter', 'beam', 'beam', 'warp']) { await p.click(`.order[data-id="${id}"]`); await p.waitForFunction(() => !maru.busy, null, { timeout: 20000 }); }
  await p.click('#read-eval');
  assert.equal(await p.locator('#eval-eyebrow').innerText(), 'TODAY’S SIMULATION · EVALUATION');
  await p.evaluate(() => { delete Navigator.prototype.share; });
  await p.click('#share-run');
  const [line, url] = (await p.evaluate(() => navigator.clipboard.readText())).split('\n');
  assert.match(line, /^Kobayashi Maru, \d{1,2} [A-Z][a-z]{2}: The lifeboat, 150 home, [A-F] B [A-F] [A-F]$/);
  assert.match(url, /^https:\/\/engage\.junkdrawer\.works\/maru\.html#run=1\.[0-9a-z]+\.ebbw$/);
  await p.click('#again');
  assert.equal(await p.locator('#daily-start').isHidden(), true, 'today’s simulation can be taken twice');
  assert.equal(await p.locator('#daily-note').innerText(), `TODAY’S SIMULATION\n${line.replace(/^[^:]+: /, '')}`);
  await mine.close();
  const friend = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const q = await friend.newPage();
  q.on('pageerror', e => problems.push(e.message));
  await q.goto(url.replace('https://engage.junkdrawer.works/', base));
  await q.waitForFunction(() => window.maru?.watching);
  assert.equal(await q.locator('#orders').isHidden(), true, 'the orders are offered while a shared run plays back');
  await q.waitForFunction(() => /Turn 1: Cross into the Neutral Zone/.test(document.getElementById('watching-text').textContent), null, { timeout: 20000 });
  await q.click('#skip');
  await q.waitForFunction(() => !document.getElementById('eval').hidden, null, { timeout: 20000 });
  assert.equal(await q.locator('#eval-title').innerText(), 'The lifeboat');
  assert.equal(await q.locator('#eval-eyebrow').innerText(), 'A CADET’S RUN · EVALUATION');
  assert.equal(await q.locator('#eval-firsts').isHidden(), true);
  assert.equal(await q.evaluate(() => localStorage.getItem('engage.maru.v1')), null, 'a shared run went on the friend’s record');
  assert.equal(await q.locator('#again').innerText(), 'TAKE THIS SIMULATION YOURSELF');
  await q.click('#again');
  assert.deepEqual(await q.evaluate(() => [maru.game.seed, maru.game.turn, location.hash, !!maru.watching]), [dailySeed(day), 0, '', false]);
  // A link that isn't a run opens the briefing as usual.
  await q.goto('about:blank');
  await q.goto(base + 'maru.html#run=1.7.zz');
  await q.waitForFunction(() => window.maru);
  assert.equal(await q.locator('#brief').isVisible(), true);
  await friend.close();
}
// The Bridge Officer's Test, the Academy's second test on the Maru's page: tried ways cost a minute each and are
// marked so, the one order that works ends it, the board gives its verdict, and the briefing keeps the pass.
{
  const bot = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await bot.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  assert.equal(await p.locator('#officer-record').isHidden(), true);
  await p.click('#officer-start');
  assert.equal(await p.locator('#officer').isVisible(), true);
  assert.equal(await p.locator('#officer-minutes').innerText(), '6 min');
  await p.click('[data-officer="eject"]');
  assert.equal(await p.locator('#officer-minutes').innerText(), '5 min');
  assert.equal(await p.locator('[data-officer="eject"]').getAttribute('aria-disabled'), 'true');
  assert.match(await p.locator('#officer-comms').innerText(), /ejection system took the same hit/);
  await p.click('[data-officer="order"]');
  await p.click('#officer-read');
  assert.equal(await p.locator('#officer-title').innerText(), 'Passed');
  assert.match(await p.locator('#officer-note').innerText(), /You tried one other way first\./);
  await p.click('#officer-back');
  assert.match(await p.locator('#officer-record').innerText(), /^Passed on \d{1,2} [A-Z][a-z]{2}\. First time\.$/);
  assert.deepEqual(await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('engage.maru.v1')).officer; return [o.taken, !!o.passed]; }), [1, true]);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await bot.close();
}
// The rescue test, the Academy's third: the transporter reaches only the ship alongside, the best run is commended,
// the briefing keeps the record, and today's rescue is the same two ships for everyone, with a line to send.
{
  const rt = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await rt.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru?.rescue);
  assert.equal(await p.locator('#rescue-record').isHidden(), true);
  await p.evaluate(() => maru.rescue.start(false, 42));
  assert.equal(await p.locator('#rescue').isVisible(), true);
  assert.equal(await p.locator('[data-rescue="beam"]').getAttribute('aria-disabled'), 'true', 'energize works out of range');
  assert.match(await p.locator('#rescue-comms').innerText(), /There is time to save one of them\./);
  const plan = await p.evaluate(() => maru.rescue.test.plan);
  for (const id of plan) await p.tap(`[data-rescue="${id}"]`);
  await p.tap('#rescue-read');
  assert.equal(await p.locator('#rescue-title').innerText(), 'Commended');
  assert.match(await p.locator('#rescue-summary').innerText(), /and you found it\.$/);
  assert.equal(await p.locator('#rescue-share-run').isHidden(), true, 'a test that isn’t today’s offers to share');
  await p.tap('#rescue-back');
  assert.equal(await p.locator('#rescue-record').innerText(), 'One test taken. Best: 100% of what was possible, found the most once.');
  // Today's: orders until it ends, then the line to send, on the verdict and on the card.
  await p.tap('#rescue-daily');
  for (let k = 0; k < 30 && !(await p.evaluate(() => maru.rescue.test.over)); k++) await p.locator('#rescue-orders .order:not([aria-disabled])').first().tap();
  await p.tap('#rescue-read');
  assert.equal(await p.locator('#rescue-eyebrow').innerText(), 'TODAY’S RESCUE · THE BOARD’S VERDICT');
  assert.equal(await p.locator('#rescue-share-run').isVisible(), true);
  await p.tap('#rescue-back');
  assert.equal(await p.locator('#rescue-daily').isHidden(), true, 'today’s rescue offered twice');
  assert.match(await p.locator('#rescue-daily-note').innerText(), /^TODAY’S RESCUE\n\d+ home, of the \d+ it allowed$/);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.maru.v1')).rescue);
  assert.deepEqual([kept.taken, kept.runs.length, kept.full >= 1, !!kept.daily.line], [2, 2, true, true]);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await rt.close();
}
// One-switch play: with the toggle on the briefing, a highlight steps through the choices and one key or one tap
// anywhere picks the highlighted one, for the whole test and the evaluation. The setting is remembered, and first
// contact can be played the same way, a meaning in the notebook stepped on by each press.
{
  const one = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await one.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  await p.tap('#one-switch');
  await p.evaluate(() => { maru.oneSwitch.interval = 250; });
  const pickWhen = async (sel, how = 'key') => {
    await p.waitForFunction(s => document.querySelector('.scan')?.matches(s) && document.activeElement === document.querySelector('.scan'), sel, { timeout: 30000 });
    if (how === 'key') await p.keyboard.press('Space'); else await p.tap('.jd-foot');
  };
  await pickWhen('#start');
  for (const id of ['enter', 'beam', 'beam', 'warp']) await pickWhen(`.order[data-id="${id}"]`, id === 'beam' ? 'tap' : 'key');
  await pickWhen('#read-eval');
  assert.equal(await p.locator('#eval-title').innerText(), 'The lifeboat');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.maru.v1')).runs.length), 1);
  await pickWhen('#again');
  assert.equal(await p.locator('#brief').isVisible(), true);
  // A tap on the footer's links did not follow them.
  assert.match(p.url(), /maru\.html$/);
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  assert.deepEqual(await p.evaluate(() => [document.getElementById('one-switch').checked, contact.oneSwitch.on]), [true, true], 'one-switch play was not remembered');
  await p.evaluate(() => { contact.oneSwitch.interval = 250; });
  await pickWhen('#start');
  await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await pickWhen('#book li[data-id="meet"] select');
  assert.equal(await p.evaluate(() => contact.game.tags.meet), 'meet', 'a press on a meaning did not step it on');
  // The highlight waits on it for the next press, then moves on.
  assert.equal(await p.evaluate(() => document.querySelector('.scan')?.closest('li')?.dataset.id), 'meet');
  await pickWhen('#book li[data-id="meet"] .ph-add');
  await pickWhen('#send');
  await p.waitForFunction(() => !contact.busy && contact.game.beat === 1, null, { timeout: 20000 });
  // Turning it off is one of the choices on the briefing.
  await p.evaluate(() => contact.act('leave'));
  await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await pickWhen('#send');
  await pickWhen('#again');
  await pickWhen('#one-switch');
  assert.equal(await p.evaluate(() => [contact.oneSwitch.on, localStorage.getItem('engage.oneswitch')].join()), 'false,off');
  await one.close();
}
// Going to warp out of the Neutral Zone is heard as the ship goes, not a second later. The Maru used the bridge's
// jump sound for a one-second trip, and that sound's hold point, set a second in, came before its swell in time:
// silence for the first second, then the rush cutting in over the explosion. The Maru's own warp-out is rendered
// here by the page's own code into a recording (no loudspeaker, and nobody listening): there is sound in the first
// 300 ms, the most of it as the ship streaks off at 0.6 to 0.7 s, and none after a second and a half. The jump
// sound, asked for a short trip, swells from the start too.
{
  const studio = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await studio.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.addInitScript(() => {
    window.AudioContext = class extends OfflineAudioContext {
      constructor() { super(1, 44100 * 5, 44100); window.recording = this; }
      resume() { return Promise.resolve(); }
    };
  });
  await p.goto(base + 'maru.html');
  // How loud each tenth of a second is (root mean square), for the first three seconds.
  const loudness = call => p.evaluate(async call => {
    window.recording = null;
    const { sound } = await import(`./js/audio.js?take=${Math.random()}`);
    sound[call[0]](...call.slice(1));
    const d = (await window.recording.startRendering()).getChannelData(0), out = [];
    for (let i = 0; i < 30; i++) { let sum = 0; for (let k = i * 4410; k < (i + 1) * 4410; k++) sum += d[k] * d[k]; out.push(Math.sqrt(sum / 4410)); }
    return out;
  }, call);
  const out = await loudness(['warpOut']);
  assert.ok(Math.min(...out.slice(0, 3)) > 0.005, `the Maru’s warp-out is silent at the start: ${out.slice(0, 3).map(v => v.toFixed(4))}`);
  assert.ok(out.indexOf(Math.max(...out)) >= 5 && out.indexOf(Math.max(...out)) <= 7, `the warp-out is loudest at ${out.indexOf(Math.max(...out)) / 10} s, not as the ship goes`);
  assert.ok(Math.max(...out.slice(15)) < 0.0005, 'the warp-out is still sounding after a second and a half');
  const short = await loudness(['engage', 1]);
  assert.ok(short[7] > 0.001 && short[9] > short[7] && short[11] > short[9], `the jump sound for a short trip does not swell from the start: ${short.slice(5, 12).map(v => v.toFixed(4))}`);
  assert.match(await readFile(join(root, 'js/maru.js'), 'utf8'), /sound\.warpOut\(\)/, 'the Maru does not use its own warp-out');
  await studio.close();
}

// Long missions: reached from the bridge, the ships on file, a hail sent, and a course set for where one is bound.
await page.goto(base);
await bridgeReady();
await Promise.all([page.waitForNavigation(), page.click('#open-missions')]);
await page.waitForFunction(() => window.missions);
assert.equal(await text('#ship-name'), 'Voyager 1');
assert.match(await text('#sun-km'), /^\d{2},\d{3},\d{3},\d{3} km$/);
assert.match(await text('#signal'), /\d+ h \d\d m \d\d s/);
assert.equal(await page.locator('.ship-tab').count(), 6);
assert.equal(await text('#hail'), 'HAIL HER');
await page.click('#hail');
assert.match(await text('#hail-note'), /of the way there/);
// The card writes a moment one way: "today at 11:56 pm", or the day and then the month, "19 Nov at 1:51 am".
const WHEN = '(today|\\d{1,2} [A-Z][a-z]{2}) at \\d{1,2}:\\d\\d\\u202f[ap]m';
assert.match(await text('#hail-note'), new RegExp(`^Your hail, sent today at \\d{1,2}:\\d\\d\\u202f[ap]m, is .* It reaches her ${WHEN}\\.`));
// A hail in flight is not replaced by tapping again: the button says it is on its way and the time it left stays.
assert.equal(await text('#hail'), 'HAIL ON ITS WAY');
const hailed = await page.evaluate(() => JSON.parse(localStorage.getItem('engage.missions.v1')).hails.v1);
await page.waitForTimeout(60);
await page.click('#hail');
await page.click('#hail');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.missions.v1')).hails.v1), hailed, 'a second tap wiped the hail already on its way');
// The day after, with the hail arrived and her answer still crossing, it still can't be wiped; once the answer could be home, it can.
await page.evaluate(() => { missions.hails.v1 = Date.now() - 30 * 3600e3; });
await page.waitForFunction(() => document.getElementById('hail').textContent === 'Waiting for her answer');
assert.match(await text('#hail-note'), /She answers at once, and her answer lands /);
await page.click('#hail');
assert.ok(Math.abs(await page.evaluate(() => Date.now() - missions.hails.v1) - 30 * 3600e3) < 5000, 'a tap wiped a hail whose answer was still due');
await page.evaluate(() => { missions.hails.v1 = Date.now() - 60 * 3600e3; });
await page.waitForFunction(() => document.getElementById('hail').textContent === 'Hail her again');
// Sent two and a half days ago: every moment in the card is a day and a month (it used to name a weekday for some,
// a date for others, with the hour in capitals).
assert.match(await text('#hail-note'), new RegExp(`^Your hail, sent \\d{1,2} [A-Z][a-z]{2} at \\d{1,2}:\\d\\d\\u202f[ap]m, reached her ${WHEN}, and her answer came back ${WHEN}\\.`));
assert.doesNotMatch(await text('#hail-note'), /[A-Z][a-z]+day at|[AP]M/);
await page.click('#hail');
assert.ok(await page.evaluate(() => Date.now() - JSON.parse(localStorage.getItem('engage.missions.v1')).hails.v1) < 5000, 'a new hail could not be sent after the answer was due');
assert.equal(await text('#hail'), 'HAIL ON ITS WAY');
// A silent ship can't answer, so once the hail has reached her another can go.
await page.locator('.ship-tab[data-id="p10"]').click();
assert.equal(await text('#hail'), 'HAIL HER ANYWAY');
await page.evaluate(() => { missions.hails.p10 = Date.now() - 30 * 3600e3; });
await page.waitForFunction(() => document.getElementById('hail').textContent === 'Hail her again');
await page.evaluate(() => { delete missions.hails.p10; });
await page.locator('.ship-tab[data-id="v1"]').click();
await page.locator('.ship-tab[data-id="jwst"]').click();
assert.equal(await page.evaluate(() => missions.view), 'earth', 'Webb did not open the near-Earth view');
assert.match(await text('#signal'), /seconds/);
await page.click('#view-sun');
assert.equal(await page.evaluate(() => missions.sel), 'v1');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'long missions scrolls sideways on a phone');
// The numbers tick over ten times a second, so they aren't in a part of the page that's read out as it changes.
const chatter = await page.evaluate(() => new Promise(done => {
  let changes = 0;
  const watch = new MutationObserver(list => { changes += list.length; });
  for (const el of document.querySelectorAll('[aria-live]:not([aria-live="off"])')) watch.observe(el, { subtree: true, childList: true, characterData: true });
  setTimeout(() => { watch.disconnect(); done(changes); }, 1000);
}));
assert.equal(chatter, 0, 'screen readers would read out the ticking numbers');
const mapLit = await page.evaluate(() => {
  const c = document.getElementById('map'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) n++;
  return n;
});
assert.ok(mapLit > 5000, 'the map is not drawn');
// The Golden Record: on both Voyagers, its lists closed until opened; on no other ship.
assert.equal(await page.locator('#golden').isVisible(), true, 'Voyager 1 has no Golden Record panel');
assert.equal(await page.locator('#golden-music').isVisible(), false);
await page.locator('#golden-music-title').click();
assert.equal(await page.locator('#golden-music li').count(), 27);
assert.match(await page.locator('#golden-music li').nth(6).innerText(), /^“Johnny B. Goode”\nUnited States · written and performed by Chuck Berry · 2:38$/);
assert.equal(await page.locator('#golden-greetings li').count(), 55);
assert.equal(await text('#golden-greetings-title'), 'Greetings in 55 languages');
await page.locator('.ship-tab[data-id="nh"]').click();
assert.equal(await page.locator('#golden').isHidden(), true, 'New Horizons carries a Golden Record');
await page.locator('.ship-tab[data-id="v2"]').click();
assert.equal(await page.locator('#golden').isVisible(), true, 'Voyager 2 has no Golden Record panel');
await Promise.all([page.waitForNavigation(), page.click('#ship-course')]);
await bridgeReady();
assert.equal(await text('#target-name'), 'Ross 248', 'set course did not choose the star Voyager 2 is bound for');

// On the near-Earth map, the Moon's name stays off Earth's: on 13 October 2026 the Moon is just past new, between Earth
// and the Sun, where its name used to land on Earth's.
{
  const near = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await near.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-13T19:00:00Z'));
  await p.goto(base + 'missions.html#jwst');
  await p.waitForFunction(() => window.missions?.view === 'earth' && missions.nearLabels.earth);
  const { earth, moon } = await p.evaluate(() => missions.nearLabels);
  assert.ok(moon, 'the Moon has no name');
  assert.ok(moon.x1 <= earth.x0 || earth.x1 <= moon.x0 || moon.y1 <= earth.y0 || earth.y1 <= moon.y0, 'the Moon’s name is on top of Earth’s');
  await near.close();
}

// Voyager 1 passed one light-day from Earth on 18 November 2026. The day after, her file says so, with the ring on
// the map (a light-day from the Sun) next; the week before, the crossing itself was next, and so the warp scale said.
{
  const day = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
  const p = await day.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-19T15:00:00Z'));
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions && !document.getElementById('passed').hidden);
  assert.match(await p.locator('#passed').innerText(), /^JUST PASSED\s+18 November 2026 \(yesterday\): one light-day from Earth\. .*Nothing people have made has been this far\.$/i);
  assert.match(await p.locator('#next').innerText(), /3 February 2027 \(in 77 days\): one light-day from the Sun/);
  assert.match(await p.locator('#signal').innerText(), /^24 h 0/);
  await p.locator('.ship-tab[data-id="v2"]').click();
  assert.equal(await p.locator('#passed').isHidden(), true, 'Voyager 2 has passed no light-day');
  await p.goto(base + 'warp.html#voyager');
  await p.waitForFunction(() => window.warpScale);
  assert.match(await p.locator('#place .about').innerText(), /has been more than a light-day from Earth since 18 November 2026\.$/);
  assert.equal(await p.locator('.rung[data-id="voyager"] .t.w1').innerText(), '1 day', 'light takes “1 days” to reach Voyager 1');
  await p.clock.setFixedTime(new Date('2026-11-10T15:00:00Z'));
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions && !document.getElementById('next').hidden);
  assert.equal(await p.locator('#passed').isHidden(), true);
  assert.match(await p.locator('#next').innerText(), /18 November 2026 \(in 8 days\): one light-day from Earth/);
  await p.goto(base + 'warp.html#voyager');
  await p.waitForFunction(() => window.warpScale);
  assert.match(await p.locator('#place .about').innerText(), /reaches one light-day from Earth in 8 days, on 18 November 2026\.$/);
  // Webb's loop round L2 is charted to 25 December 2027. After that her file gives round figures for L2 and says
  // why, and not "1,500,000 km" to the kilometre and "0.00 km/s round L2".
  await p.clock.setFixedTime(new Date('2028-02-10T15:00:00Z'));
  await p.goto(base + 'missions.html#jwst');
  await p.waitForFunction(() => window.missions?.view === 'earth' && document.getElementById('earth-km').textContent);
  assert.equal(await p.locator('#earth-km').innerText(), 'about 1,500,000 km');
  assert.match(await p.locator('#earth-au').innerText(), /isn’t charted for this date/);
  assert.equal(await p.locator('#speed-h').innerText(), 'round the Sun with Earth');
  assert.match(await p.locator('#scale').innerText(), /charted here for October 2026 to December 2027 only/);
  await p.clock.setFixedTime(new Date('2027-06-01T15:00:00Z'));
  await p.reload();
  await p.waitForFunction(() => window.missions?.view === 'earth' && /^\d/.test(document.getElementById('earth-km').textContent));
  assert.match(await p.locator('#earth-km').innerText(), /^1,\d{3},\d{3} km$/);
  assert.match(await p.locator('#speed-h').innerText(), /and 0\.\d\d km\/s round L2$/);
  await day.close();
}

// The timeline under the long missions' map: from 1972 to 2100, every ship and reading moves with it, the selected
// ship's log is a row of ticks, and a date in her log goes to that day. The room opens on now; a hail always goes now.
{
  const tl = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
  const p = await tl.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-19T17:00:00Z'));
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions && !document.getElementById('sky-row').hidden);
  assert.equal(await p.evaluate(() => missions.at), null);
  assert.equal(await p.locator('#tl-date').innerText(), 'Now, 19 November 2026');
  assert.equal(await p.locator('#tl-now').isHidden(), true);
  assert.equal(await p.locator('.tl-tick').count(), 7, 'Voyager 1’s seven log entries are not ticks on the timeline');
  // A date in her mission log: the Pale Blue Dot, 40 AU out, with the entry over the map.
  await p.locator('#ship-log .when[data-day="1990-02-14"]').click();
  assert.equal(await p.locator('#clock').innerText(), '14 FEBRUARY 1990');
  assert.match(await p.locator('#tl-event').innerText(), /^14 FEBRUARY 1990 · VOYAGER 1\nTurned around and took the Pale Blue Dot/);
  assert.match(await p.locator('#sun-au').innerText(), /^40\.\d{3} AU$/);
  assert.match(await p.locator('#ship-where').innerText(), /^Today: In interstellar space/);
  assert.equal(await p.locator('#status-title').innerText(), 'SHIP’S STATUS TODAY');
  assert.deepEqual(await p.evaluate(() => [document.getElementById('dishes').textContent, document.getElementById('passed').hidden, document.getElementById('sky-link').hidden]), ['', true, true], 'today’s lines are shown for 1990');
  assert.equal(await p.locator('.tl-tick.on').getAttribute('data-day'), '1990-02-14');
  assert.equal(await p.evaluate(() => location.hash), '#v1');
  // A hail sent from 1990 goes now, at today's distance.
  await p.click('#hail');
  assert.ok(Math.abs(await p.evaluate(() => Date.now() - missions.hails.v1)) < 5000);
  assert.match(await p.locator('#hail-note').innerText(), /It reaches her 20 Nov at 5:00/);
  // Before she was launched, and Pioneer 10 still talking in 1980.
  const day = iso => p.evaluate(d => Math.floor((Date.parse(d) - Date.UTC(1972, 0, 1)) / 864e5), iso);
  await p.locator('#tl').fill(String(await day('1975-06-01T12:00:00Z')));
  assert.equal(await p.locator('#ship-agency').innerText(), 'NASA · NOT LAUNCHED YET');
  assert.equal(await p.locator('#sun-km').innerText(), 'Not launched yet');
  assert.equal(await p.locator('.ship-tab[data-id="v1"] .t-sub').innerText(), 'launches 1977');
  assert.match(await p.locator('.ship-tab[data-id="p10"] .t-sub').innerText(), /^\d+\.\d AU$/);
  await p.locator('.ship-tab[data-id="p10"]').click();
  await p.locator('#tl').fill(String(await day('1980-06-01T12:00:00Z')));
  assert.equal(await p.locator('#ship-agency').innerText(), 'NASA · ON MISSION', 'Pioneer 10 was silent in 1980');
  assert.match(await p.locator('#sun-au').innerText(), /^2\d\.\d{3} AU$/);
  // On to 2100: Voyager 1 coasting at about 432 AU.
  await p.locator('.ship-tab[data-id="v1"]').click();
  await p.locator('#tl').fill(await p.locator('#tl').getAttribute('max'));
  assert.equal(await p.locator('#tl-date').innerText(), '31 December 2100');
  assert.match(await p.locator('#sun-au').innerText(), /^43\d\.\d{3} AU$/);
  assert.equal(await p.locator('#ship-agency').innerText(), 'NASA · WHERE SHE’LL BE');
  // Now brings the room back to today, as it opened.
  await p.click('#tl-now');
  assert.equal(await p.evaluate(() => missions.at), null);
  assert.equal(await p.locator('#tl-now').isHidden(), true);
  assert.match(await p.locator('#clock').innerText(), /^STARDATE /);
  assert.equal(await p.locator('#tl-event').isHidden(), true);
  assert.match(await p.locator('#dishes').innerText(), /could hear her now/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the timeline makes the page scroll sideways');
  await tl.close();
}

// Hails that land: the room opens on the ship whose hail landed while you were away, says so over the map with a
// tally, puts a dot on another ship's tab when hers lands, and once twice the light-time has passed shows what she
// sent back, typed out at her downlink rate the first time and whole after that. Voyager 2's hail, sent at 2 am on
// 18 November, reached her at about 10 pm (20 light-hours) and her answer is due at about 6 pm on the 19th.
{
  const H = 3600e3, T = Date.parse('2026-11-19T08:00:00Z');
  const land = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
  await land.addInitScript(t => {
    if (!localStorage.getItem('engage.missions.v1')) localStorage.setItem('engage.missions.v1', JSON.stringify({ hails: { v2: t - 30 * 3600e3, v1: t - 3600e3, p10: t - 40 * 3600e3 } }));
  }, T);
  const p = await land.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.clock.setFixedTime(new Date(T));
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions);
  // Pioneer 10's hail reached her earlier than Voyager 2's, so Voyager 2's is the news, and her file is the one open.
  assert.equal(await p.evaluate(() => missions.sel), 'v2', 'the room did not open on the ship whose hail landed overnight');
  assert.equal(await p.locator('#news-go').innerText(), 'Your hail reached Voyager 2 overnight.');
  assert.equal(await p.locator('#tally').innerText(), 'HAILS SENT 3, ANSWERED 0');
  assert.equal(await p.locator('.ship-tab[data-id="p10"]').getAttribute('class').then(c => c.includes('ping')), true, 'Pioneer 10’s landed hail has no dot');
  assert.equal(await p.locator('.ship-tab.ping').count(), 1, 'a tab with nothing new has a dot');
  assert.equal(await p.locator('#reply').isHidden(), true, 'an answer showed before it was due');
  // Pioneer 10's file clears her dot; she is silent and sends nothing back.
  await p.locator('.ship-tab[data-id="p10"]').click();
  assert.equal(await p.locator('.ship-tab.ping').count(), 0);
  assert.equal(await p.locator('#reply').isHidden(), true, 'a silent ship answered');
  // Evening: Voyager 2's answer is in. The room opens on her with the news, and types her answer out.
  await p.clock.setFixedTime(new Date(T + 11 * H));
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions && !document.getElementById('reply').hidden);
  assert.equal(await p.evaluate(() => missions.sel), 'v2');
  assert.match(await p.locator('#news-go').innerText(), /^Voyager 2’s answer to your hail came in today at 6:\d\d\u202fpm\.$/);
  assert.equal(await p.locator('#tally').innerText(), 'HAILS SENT 3, ANSWERED 1');
  assert.match(await p.locator('#hail-note').innerText(), /and her answer came back today at 6:\d\d\u202fpm\./);
  assert.match(await p.locator('#reply-head').textContent(), /^Her answer came in today at 6:\d\d\u202fpm$/);
  const full = await p.locator('#reply-full').textContent();
  assert.match(full, /^Voyager 2 to Earth\. Your hail reached me 18 Nov at 10:\d\d\u202fpm, 144\.\d AU from the Sun and 20 hours out from you\..* Canberra .* I am sending this at 160 bits a second\. Voyager 2 out\.$/);
  assert.ok((await p.locator('#reply-text').textContent()).length < full.length, 'her answer did not type out');
  assert.match(await p.locator('#reply-note').innerText(), /160 bits a second\. The real Voyager 2 answers only NASA\.$/);
  // Seen once, it is whole the next time, and the answer is counted only once.
  await p.reload();
  await p.waitForFunction(() => window.missions && !document.getElementById('reply').hidden);
  assert.equal(await p.locator('#reply-text').textContent(), full);
  assert.equal(await p.locator('#tally').innerText(), 'HAILS SENT 3, ANSWERED 1');
  // A hail that lands while another ship's file is open puts a dot on her tab, and the news line opens her file.
  await p.evaluate(() => { missions.choose('nh'); });
  await p.click('#hail');
  assert.equal(await p.locator('#tally').innerText(), 'HAILS SENT 4, ANSWERED 1');
  await p.evaluate(() => { missions.choose('v1'); });
  await p.clock.setFixedTime(new Date(T + 11 * H + 10 * H));
  await p.waitForFunction(() => document.querySelector('.ship-tab[data-id="nh"]').classList.contains('ping'), null, { timeout: 10000 });
  assert.match(await p.locator('#news-go').innerText(), /^Your hail reached New Horizons (just now|today at)/);
  await p.click('#news-go');
  assert.equal(await p.evaluate(() => missions.sel), 'nh');
  assert.equal(await p.locator('.ship-tab[data-id="nh"]').getAttribute('class').then(c => c.includes('ping')), false);
  // A hail before any is answered says nothing over the map but the tally; a first visit says nothing at all.
  const fresh = await land.browser().newContext({ viewport: { width: 390, height: 844 } });
  const q = await fresh.newPage();
  await q.goto(base + 'missions.html');
  await q.waitForFunction(() => window.missions);
  assert.equal(await q.locator('#hail-news').isHidden(), true, 'a first visit has news of hails');
  assert.equal(await q.evaluate(() => missions.sel), 'v1');
  await fresh.close();
  await land.close();
}

// Which of NASA's three dish sites could hear each ship, from where she is in the sky, and the constellation she is
// in, with a link that marks her in tonight's sky. At 17:00 UTC on 19 November 2026 Voyager 1 is up at Goldstone and
// Madrid, and Canberra next has her at 10:30 pm; Voyager 2 is too far south for any site but Canberra.
{
  const dish = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
  const p = await dish.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-19T17:00:00Z'));
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions && !document.getElementById('sky-row').hidden);
  assert.equal(await p.locator('#dishes').innerText(), 'Goldstone and Madrid could hear her now. Canberra next, today at 10:30\u202fpm.');
  assert.equal(await p.locator('#sky-con').innerText(), 'Ophiuchus');
  assert.match(await p.locator('#sky-note').innerText(), /^the constellation she’s in\. Far too faint for any telescope to see\.$/);
  await p.locator('.ship-tab[data-id="v2"]').click();
  assert.equal(await p.locator('#dishes').innerText(), 'Canberra could hear her now. She is too far south for Goldstone and Madrid.');
  assert.equal(await p.locator('#sky-con').innerText(), 'Pavo');
  await p.locator('.ship-tab[data-id="p10"]').click();
  assert.match(await p.locator('#dishes').innerText(), /^Nobody listens for her any more\. .*, if she called\./);
  await p.locator('.ship-tab[data-id="v1"]').click();
  assert.equal(await p.locator('#sky-link').getAttribute('href'), './tonight.html#ship=v1');
  await Promise.all([p.waitForNavigation(), p.locator('#sky-link').click()]);
  await p.waitForFunction(() => window.tonight && !document.getElementById('card').hidden);
  assert.equal(await p.locator('#card-kind').innerText(), 'LONG MISSIONS');
  assert.equal(await p.locator('#card-title').innerText(), 'Voyager 1');
  assert.match(await p.locator('#card-sub').innerText(), /^2\d\.\d billion km away · in Ophiuchus$/);
  assert.match(await p.locator('#card-line').innerText(), /^Far too faint for any telescope to see/);
  assert.equal(await p.locator('#card-doors a').getAttribute('href'), './missions.html#v1');
  assert.equal(await p.locator('#card-course').isHidden(), true, 'a ship has a course to set');
  // Her mark is on the sky where she is, when she is up: turned to her, it is drawn and can be tapped.
  const ship = await p.evaluate(() => window.tonight.ship);
  assert.equal(ship.id, 'v1');
  if (ship.alt > 0) assert.ok(ship.drawn, 'Voyager 1 is up but has no mark');
  await p.evaluate(() => { const t = window.tonight; t.place(-35.3, 149.1, 'Canberra', 'Australia/Sydney'); t.look(0, 0, 80); });
  await p.waitForTimeout(100);
  assert.equal((await p.evaluate(() => window.tonight.ship)).drawn, false, 'Voyager 1 is drawn under the ground from Canberra');
  await dish.close();
}

// Impulse power, in the warp scale room: the whole sky round the ship, dead ahead in the middle. Opening the throttle
// to nine tenths of light speed squeezes the forward half of the sky within 26° of dead ahead, makes an hour aboard
// 2 hours 18 minutes at home, and shifts the light ahead to the blue and behind to the red. The heading is the place
// on the card when it is a star.
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx2.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'warp.html#vega');
  await p.locator('#impulse').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => window.warpScale?.impulse.ready, null, { timeout: 30000 });
  assert.equal(await p.evaluate(() => warpScale.impulse.heading), 'Vega');
  assert.equal(await p.locator('#impulse-speed').innerText(), 'Full stop');
  assert.match(await p.locator('#impulse-read').innerText(), /1 hour aboard is 1 hour on Earth/);
  // Arcturus, about 65° from Vega in Earth's sky, is drawn that far out at a full stop.
  const rest = await p.evaluate(() => warpScale.impulse.where('Arcturus'));
  assert.ok(rest.fromMiddle > 55 && rest.fromMiddle < 75, `Arcturus drawn ${rest.fromMiddle}° from dead ahead at rest`);
  // The sky is seen from inside, as from the ground, north up: Polaris above Vega, Deneb to its east on the left and
  // Arcturus to its west on the right. It was drawn the other way round, as if from outside a globe.
  const mid = await p.evaluate(() => { const r = document.getElementById('impulse-sky').getBoundingClientRect(); return { x: r.width / 2, y: r.height / 2 + 8 }; });
  const [deneb, arcturus, polaris] = await p.evaluate(() => ['Deneb', 'Arcturus', 'Polaris'].map(n => warpScale.impulse.where(n)));
  assert.ok(deneb.x < mid.x && arcturus.x > mid.x && polaris.y < mid.y, `the sky round Vega is mirrored: Deneb at ${deneb.x}, Arcturus at ${arcturus.x}`);
  await p.locator('#throttle').fill('0.9');
  assert.equal(await p.locator('#impulse-speed').innerText(), '0.9 of light speed, 269,813 km/s');
  const read = await p.locator('#impulse-read').innerText();
  assert.match(read, /Squeezed within 26° of dead ahead/);
  assert.match(read, /1 hour aboard is 2 hours 18 minutes on Earth/);
  assert.match(read, /Light arrives at 4\.4 times its frequency: green as ultraviolet/);
  assert.match(read, /At 0\.23 times: green as infrared/);
  const fast = await p.evaluate(() => warpScale.impulse.where('Arcturus'));
  assert.ok(fast.fromMiddle < rest.fromMiddle - 20 && fast.d > 1, 'Arcturus did not crowd toward dead ahead and turn bluer');
  // A star behind the ship at rest is still behind, and redder.
  const behind = await p.evaluate(() => { const names = ['Canopus', 'Sirius', 'Rigel', 'Achernar']; return names.map(n => warpScale.impulse.where(n)).find(s => s.fromMiddle > 120); });
  assert.ok(behind && behind.d < 1);
  assert.match(await p.locator('#impulse-sky').getAttribute('aria-label'), /26 degrees round dead ahead/);
  // The full impulse mark sits under the track where the thumb is at a quarter of light speed, and sets it there.
  const mark = await p.locator('#full-impulse').boundingBox(), track = await p.locator('#throttle').boundingBox();
  const at = mark.x + mark.width / 2, want = track.x + 12 + (track.width - 24) * 0.25 / 0.999;
  assert.ok(Math.abs(at - want) < 2 && mark.y > track.y + track.height / 2 && mark.height >= 32, `the full impulse mark is at ${at}, not ${want}`);
  await p.locator('#full-impulse').click();
  assert.equal(await p.locator('#throttle').inputValue(), '0.25');
  assert.equal(await p.locator('#impulse-speed').innerText(), 'Full impulse: 0.25 of light speed, 74,948 km/s');
  assert.match(await p.locator('#impulse-read').innerText(), /1 hour aboard is 1 hour 2 minutes on Earth/);
  // A place that is no star heads for Proxima Centauri.
  await p.evaluate(() => warpScale.select('core'));
  assert.equal(await p.evaluate(() => warpScale.impulse.heading), 'Proxima Centauri');
  await ctx2.close();
}

// A link cut off mid-way by a chat app can end in a stray "%", which isn't an address at all. The warp scale, the lab
// and the survey each stopped dead on one; they open as they would with no link. The lab also reads a class in
// either case, keeping the specimen number, and takes specimen 0, which it never grows, as no number.
{
  const cut = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await cut.newPage();
  const broke = [];
  p.on('pageerror', e => broke.push(e.message));
  await p.goto(base + 'warp.html#%');
  await p.waitForFunction(() => window.warpScale?.place === 'core');
  assert.ok(await p.locator('#ladder .rung').count() > 15, 'the ladder is missing after a cut-off link');
  await p.goto(base + 'warp.html?warp=7.5#%E0%A4%A');
  await p.waitForFunction(() => window.warpScale?.place === 'core' && document.getElementById('custom-warp').value === '7.5');
  await p.goto(base + 'xeno.html#%');
  await p.waitForFunction(() => window.xeno?.current);
  assert.match(await p.locator('#tank-tag').innerText(), /^Class M · Specimen \d{4}$/i);
  await p.goto(base + 'survey.html#%');
  await p.waitForFunction(() => window.survey);
  assert.match(await p.locator('#file h2').innerText(), /^Class M/);
  // And when a bad link arrives on a page that is already open.
  await p.evaluate(() => { location.hash = '#P'; });
  await p.waitForFunction(() => /^Class P/.test(document.querySelector('#file h2').innerText));
  await p.evaluate(() => { location.hash = '#%zz'; });
  await p.evaluate(() => new Promise(r => setTimeout(r, 100)));
  assert.match(await p.locator('#file h2').innerText(), /^Class P/, 'a bad link changed the file that was open');
  await p.goto(base + 'xeno.html#m-5');
  await p.waitForFunction(() => window.xeno?.current);
  assert.deepEqual(await p.evaluate(() => [xeno.current.classId, xeno.current.seed, location.hash]), ['M', 5, '#M-5'], 'a lower-case link grew some other creature');
  await p.goto(base + 'xeno.html#LAVA-WORLD-7');
  await p.reload();
  await p.waitForFunction(() => window.xeno?.current);
  assert.deepEqual(await p.evaluate(() => [xeno.current.classId, xeno.current.seed]), ['lava-world', 7]);
  await p.goto(base + 'xeno.html#K-0');
  await p.reload();
  await p.waitForFunction(() => window.xeno?.current);
  const zero = await p.evaluate(() => [xeno.current.classId, xeno.current.seed]);
  assert.ok(zero[0] === 'K' && zero[1] >= 1 && zero[1] <= 9999, `#K-0 grew specimen ${zero[1]} of Class ${zero[0]}`);
  assert.doesNotMatch(await p.locator('#tank-tag').innerText(), /0000/);
  assert.deepEqual(broke, [], 'a cut-off link stopped a page');
  await cut.close();
}

// A damaged save keeps what's still good and starts the rest afresh, instead of stopping the page.
{
  const junk = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await junk.addInitScript(() => {
    if (sessionStorage.getItem('damaged')) return;
    sessionStorage.setItem('damaged', '1');
    localStorage.setItem('engage.v1', JSON.stringify({ offset: null, fov: 0, log: [null, { star: 'Sirius' }], seenIntro: true }));
    localStorage.setItem('engage.maru.v1', JSON.stringify({ runs: null }));
    localStorage.setItem('engage.missions.v1', JSON.stringify({ hails: null }));
    localStorage.setItem('engage.tonight.v1', JSON.stringify({ sky: 'bogus', place: { name: 'Nowhere' } }));
    localStorage.setItem('engage.xeno.v1', JSON.stringify({ jars: [null, { id: 'Z', seed: 1 }, 'x'] }));
    localStorage.setItem('engage.contact.v1', JSON.stringify({ runs: [null, 3, { title: 7 }] }));
    localStorage.setItem('engage.warp.v1', JSON.stringify({ place: 7, warp: 'fast' }));
  });
  const p = await junk.newPage();
  const broke = [];
  p.on('pageerror', e => broke.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.locator('#where').innerText(), 'Earth orbit');
  await p.click('#open-log');
  assert.match(await p.locator('#stats').innerText(), /Nothing logged yet/);
  for (const [file, hook] of [['maru.html', 'maru'], ['missions.html', 'missions'], ['xeno.html', 'xeno'], ['contact.html', 'contact'], ['warp.html', 'warpScale'], ['tonight.html', 'tonight']]) {
    await p.goto(base + file);
    await p.waitForFunction(name => window[name], hook);
  }
  await p.click('#open-list');
  assert.match(await p.locator('#list-note').innerText(), /from the suburbs/);
  assert.deepEqual(broke, [], 'a damaged save stopped a page');
  await junk.close();
}

// Tonight's sky: reached from the bridge, the stars tagged where they really are, a tap on Vulcan, and a course set.
await page.goto(base);
await bridgeReady();
await Promise.all([page.waitForNavigation(), page.click('#open-sky')]);
await page.waitForFunction(() => window.tonight);
await page.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-10-11T04:30:00Z'); });
const vulcan = await page.evaluate(() => tonight.tag('Vulcan'));
assert.ok(vulcan.alt > 20 && vulcan.alt < 26, `Vulcan’s sun is not where it is at 12:30 am in New York: ${vulcan.alt}`);
assert.ok(vulcan.seen, 'a magnitude 4.4 star is not visible from the suburbs');
assert.equal(await page.evaluate(() => tonight.tag('Wolf 359').seen), false, 'Wolf 359 can be seen without a telescope');
// Only Starfleet's stars that are up and bright enough get a whole tag; the rest are a quiet ring, still there to tap.
{
  await page.evaluate(() => tonight.look(180, 30, 120));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const [boxes, rings] = await page.evaluate(() => [tonight.tags().map(t => t.name), tonight.rings()]);
  assert.ok(rings.length > 0, 'no quiet rings drawn');
  for (const n of rings) {
    const t = await page.evaluate(name => tonight.tag(name), n);
    if (t) assert.ok(t.alt < 0 || !t.seen, `${n} is up and visible but drawn as a ring alone`);
  }
  for (const n of boxes) {
    const t = await page.evaluate(name => tonight.tag(name), n);
    if (t) assert.ok(t.alt >= 0 && t.seen, `${n} has a whole tag though it is ${t.alt < 0 ? 'below the horizon' : 'too faint to see'}`);
  }
  // Wolf 359 is far too faint: chosen, it is drawn in full; its card closed, it goes back to a ring.
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => { tonight.aimAt('Wolf 359'); tonight.show({ kind: 'star', i: tonight.state.sel.i }); });
  await frame();
  assert.ok((await page.evaluate(() => tonight.tags())).some(t => t.name === 'Wolf 359'), 'the chosen star is still a ring alone');
  await page.click('#card [data-close]');
  await frame();
  assert.ok(!(await page.evaluate(() => tonight.tags())).some(t => t.name === 'Wolf 359'), 'Wolf 359, too faint to see, still has a whole tag');
  assert.ok((await page.evaluate(() => tonight.rings())).includes('Wolf 359'), 'Wolf 359 lost its ring');
  // A star that behaves says where it is in its cycle tonight: Algol's next eclipse, in New York's time.
  await page.evaluate(() => { tonight.aimAt('Algol I'); tonight.show({ kind: 'star', i: tonight.state.sel.i }); });
  assert.match(await text('#card-now'), /^An eclipsing star: every 2\.87 days .* The next eclipse is deepest Mon 12 Oct, 4:1\d\sam, when it fades to 3\.4/);
  await page.click('#card [data-close]');
  await page.evaluate(() => { tonight.aimAt('Vulcan'); tonight.show({ kind: 'star', i: tonight.state.sel.i }); });
  assert.equal(await shown('#card-now'), false, 'a steady star has a Right now line');
  await page.click('#card [data-close]');
}
assert.match(await text('#clock'), /12:30/);
assert.equal(await shown('#daylight'), false, 'the daylight notice shows at night');
await page.evaluate(() => tonight.aimAt('Vulcan'));
await page.waitForTimeout(200);
const spot = await page.evaluate(() => tonight.where('Vulcan'));
await page.touchscreen.tap(spot.x, spot.y);
assert.equal(await text('#card-title'), 'Vulcan', 'tapping the tag did not open Vulcan');
assert.match(await text('#card-look'), /up in the south-east/);
// With the card open, looking somewhere else stays put when the sky is worked out again (every 20 seconds, and
// whenever the time slider moves), while the card keeps up.
const lookBefore = await text('#card-look');
await page.evaluate(() => tonight.look(60, 30));
await page.locator('#time').evaluate(el => { el.value = 60; el.dispatchEvent(new Event('input')); });
await page.waitForTimeout(1200);
const looking = await page.evaluate(() => tonight.state.view);
assert.ok(Math.abs(looking.az - 60) < 0.5 && Math.abs(looking.alt - 30) < 0.5, `the card turned the view back to its star (${looking.az}, ${looking.alt})`);
assert.notEqual(await text('#card-look'), lookBefore, 'the card did not keep up with the sky');
await page.locator('#time').evaluate(el => { el.value = 0; el.dispatchEvent(new Event('input')); });
const skyLit = await page.evaluate(() => {
  const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) n++;
  return n;
});
assert.ok(skyLit > 500, 'the sky is not drawn');
// The list, and a city picked by hand.
await page.click('[data-close]');
await page.click('#open-list');
assert.match(await text('#list-note'), /of Starfleet’s \d+ charted stars/);
// The list opens on Starfleet's stars that are up, the highest first (at 12:30 am in New York in October, Gamma
// Trianguli VI, 72° up).
assert.match(await page.locator('.system.trek').first().innerText(), /^Gamma Trianguli VI\n.* · 7\d° up in the east$/);
await page.locator('#list [data-close]').click();
await page.click('#open-place');
await page.locator('.city', { hasText: 'Sydney' }).click();
assert.equal(await text('#place-name'), 'Sydney');
assert.ok(await page.evaluate(() => tonight.tag('Cochrane’s home').alt) > 0, 'Alpha Centauri is not up from Sydney');
// Holding the phone up toward the east, 30° above the horizon.
await page.evaluate(() => tonight.sense(270, 120, 0));
const pointing = await page.evaluate(() => tonight.pointing());
assert.ok(Math.abs(pointing.az - 90) < 1 && Math.abs(pointing.alt - 30) < 1, 'the sky does not follow the phone');
await page.evaluate(() => tonight.unsense());
// When the Moon, not the sky, hides a star, the card says so. Under a dark sky in New York late on 25 October 2026,
// the Moon brings the limit down to 5.1, just past Tellar (61 Cygni, magnitude 5.2).
await page.click('#open-place');
await page.click('.sky-opt[data-id="dark"]');
await page.locator('#places [data-close]').click();
await page.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-10-26T02:00:00Z'); });
await page.click('#open-list');
assert.match(await text('#list-note'), /bright enough to see under a dark sky\.$/);
await page.locator('.system', { hasText: 'Tellar' }).click();
assert.match(await text('#card-look'), /up in the west\. The Moon is washing it out tonight\.$/, 'the card blamed the sky for the Moon');
await page.locator('#card [data-close]').click();
await page.click('#open-place');
await page.click('.sky-opt[data-id="suburb"]');
await page.locator('#places [data-close]').click();
// In daylight it says so, and offers the evening.
await page.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-10-10T17:00:00Z'); });
assert.equal(await shown('#daylight'), true, 'no daylight notice at noon');
// Tags stay out from under the notice: with the Vega colony's star right behind it, its tag isn't drawn there.
{
  await page.evaluate(() => tonight.aimAt('Vega colony'));
  const notice = await page.locator('#daylight').boundingBox();
  await page.evaluate(y => {
    const { az } = tonight.state.view;
    let { alt } = tonight.state.view;
    for (let k = 0; k < 40; k++) { alt += (y - tonight.where('Vega colony').y) / 10; tonight.look(az, alt); }
  }, notice.y + notice.height / 2);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.ok(Math.abs((await page.evaluate(() => tonight.where('Vega colony'))).y - (notice.y + notice.height / 2)) < 8, 'Vega is not behind the notice');
  for (const t of await page.evaluate(() => tonight.tags())) {
    assert.ok(t.x > notice.x + notice.width || t.x + t.w < notice.x || t.y > notice.y + notice.height || t.y + t.h < notice.y, `${t.name}’s tag is under the daylight notice`);
  }
}
await page.click('#go-dark');
assert.ok(await page.evaluate(() => tonight.state.sunAlt) < -11, 'show tonight did not move to the dark');
// Early on a June morning the dark is more than twelve hours off, and the slider's full day still reaches it.
{
  await page.evaluate(() => { const s = document.getElementById('time'); s.value = 0; s.dispatchEvent(new Event('input')); tonight.at('2026-06-21T10:00:00Z'); });
  assert.equal(await shown('#daylight'), true);
  const min = Number(await page.locator('#go-dark').getAttribute('data-min'));
  assert.ok(min > 720 && min <= 1440 && await shown('#go-dark'), `the daylight notice offers no evening ${min} minutes off`);
  await page.click('#go-dark');
  assert.deepEqual(await page.evaluate(() => [tonight.state.offsetMin, Number(document.getElementById('time').value)]), [min, min]);
  assert.ok(await page.evaluate(() => tonight.state.sunAlt) < -11, 'show tonight did not move to the dark');
  await page.evaluate(() => { const s = document.getElementById('time'); s.value = 0; s.dispatchEvent(new Event('input')); });
}
// Venus as a morning crescent on 19 November 2026 is magnitude −4.9, as bright as it ever gets and no brighter.
await page.evaluate(() => { tonight.at('2026-11-19T11:15:00Z'); tonight.show({ kind: 'planet', name: 'venus' }); });
assert.match(await text('#card-line'), /^It shines at magnitude −4\.[89], brighter than any star/);
await page.click('#card [data-close]');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'tonight’s sky scrolls sideways on a phone');
// Tonight's plan, at the head of the list. New York at 6:30 pm on 18 November 2026: dark already, the Moon sets at
// one, the Leonids are a day past their peak, and the most of Starfleet's 28 stars are well up at 1:00 am, as the Moon
// sets and the winter sky is high. Its button moves
// the time slider there and gets the list out of the way.
{
  const reset = (iso, min = 0) => page.evaluate(([t, m]) => { const s = document.getElementById('time'); s.value = m; s.dispatchEvent(new Event('input')); tonight.at(t); }, [iso, min]);
  const sliderWas = await page.evaluate(() => tonight.state.offsetMin);
  // (The page writes a time with a narrow space before "pm" that doesn't break; here an ordinary one will do.)
  const plain = t => t.replace(/\s+/g, ' ').trim();
  const lines = async () => (await page.evaluate(() => [...document.querySelectorAll('#plan > p')].filter(p => !p.hidden).map(p => p.firstChild.textContent))).map(plain);
  await reset('2026-11-18T23:30:00Z');
  await page.click('#open-list');
  assert.deepEqual(await lines(), [
    'Dark until 5:44 am. Moon sets 1:00 am.',
    'Best at 1:00 am: Capella IV, Rigel VII and 12 more are up.',
    'The Leonids are active tonight (peaked 17 Nov): look east after 11:00 pm. Up to 15 an hour at the peak, under a dark sky.',
  ]);
  assert.equal(plain(await text('#plan-go')), 'Show 1:00 am');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the plan makes the list scroll sideways');
  await page.click('#plan-go');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('time').value, tonight.state.offsetMin, document.getElementById('list').hidden]),
    ['390', 390, true], 'the plan’s button did not move the time slider to the best time');
  assert.equal(plain(await page.evaluate(() => document.getElementById('time-out').textContent)), '1:00 am');
  assert.match(plain(await text('#clock')), /1:00 am/);
  // At that moment fourteen of them really are well up, and with the slider there the button has nothing left to do.
  const { CHARTS } = await import('../js/charts.js');
  assert.equal(await page.evaluate(tags => tags.filter(n => { const t = tonight.tag(n); return t.seen && t.alt > 15; }).length, CHARTS.map(c => c.tag)), 14);
  await page.click('#open-list');
  assert.equal(await shown('#plan-go'), false);
  await page.click('#list [data-close]');
  // From nine in the morning the best time is 16 hours off. The slider reaches a full day, so the button is there
  // (it was named with no button while the slider stopped at twelve hours), and it moves the slider all the way.
  await reset('2026-11-18T14:00:00Z');
  await page.click('#open-list');
  assert.deepEqual((await lines()).slice(0, 2), ['Dark from 5:38 pm to 5:44 am. Moon sets 1:00 am.', 'Best at 1:00 am: Capella IV, Rigel VII and 12 more are up.']);
  assert.equal(plain(await text('#plan-go')), 'Show 1:00 am');
  await page.click('#plan-go');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('time').value, tonight.state.offsetMin, document.getElementById('time').max]), ['960', 960, '1440']);
  assert.equal(await page.locator('#time').getAttribute('aria-label'), 'Time: now to 24 hours ahead');
  await reset('2026-11-18T14:00:00Z');
  // The Leonids' radiant is marked on the sky once it is up and the Sun is down, and its card says what it is.
  await reset('2026-11-19T07:00:00Z');
  await page.evaluate(() => tonight.look(95, 30, 80));
  await page.waitForFunction(() => tonight.shower?.drawn);
  assert.equal(await page.evaluate(() => tonight.shower.name), 'Leonids');
  await page.evaluate(() => tonight.show({ kind: 'shower' }));
  assert.deepEqual([await text('#card-kind'), await text('#card-title'), await text('#card-sub')], ['METEOR SHOWER', 'Leonids', 'Active 6 Nov to 30 Nov · peaked 17 Nov']);
  assert.equal(await shown('#card-course'), false);
  await page.click('#card [data-close]');
  await reset('2026-11-18T23:30:00Z'); // 6:30 pm: Leo hasn't risen
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => [tonight.shower.name, tonight.shower.alt < 0, tonight.shower.drawn]), ['Leonids', true, false]);
  await reset('2026-10-01T04:00:00Z'); // no shower on
  assert.equal(await page.evaluate(() => tonight.shower), null);
  // Reykjavík in June: one line, no button, and the note under it doesn't promise a dark that isn't coming.
  await page.evaluate(() => tonight.place(64.15, -21.94, 'Reykjavík', 'Atlantic/Reykjavik'));
  await reset('2026-06-20T22:00:00Z');
  await page.click('#open-list');
  assert.deepEqual(await lines(), ['It doesn’t get dark here tonight: the Sun never goes far below the horizon.']);
  assert.equal(await shown('#plan-go'), false);
  assert.match(await text('#list-note'), /are up, and would be bright enough to see from the suburbs if it got dark\./);
  await page.click('#list [data-close]');
  await page.evaluate(() => tonight.place(40.71, -74.01, 'New York', 'America/New_York'));
  // The constellations are named, each at the middle of its figure. New York at 9 pm on 15 January 2027, looking
  // south-east: Orion and his neighbours. Closer in than about 40° of view there are no names, in twilight they are
  // still there, and in daylight they are gone with the stars.
  const names = async (iso, fov) => { await reset(iso); await page.evaluate(f => tonight.look(150, 40, f), fov); await page.waitForTimeout(150); return page.evaluate(() => tonight.names()); };
  const evening = await names('2027-01-16T02:00:00Z', 80);
  assert.ok(evening.includes('Orion') && evening.includes('Canis Major') && evening.includes('Lepus'), `named: ${evening}`);
  assert.equal(new Set(evening).size, evening.length, 'a constellation was named twice');
  // A name never sits on a tag: no two labels drawn share any of the screen.
  {
    const boxes = await page.evaluate(() => tonight.tags());
    const orion = await page.evaluate(() => tonight.nameBox('Orion'));
    assert.ok(orion && orion.x >= 0 && orion.x + orion.w <= 390, `ORION is at ${JSON.stringify(orion)}`);
    for (const t of boxes) assert.ok(orion.x >= t.x + t.w || t.x >= orion.x + orion.w || orion.y >= t.y + t.h || t.y >= orion.y + orion.h, `ORION is written over ${t.name}’s tag`);
  }
  assert.deepEqual(await names('2027-01-16T02:00:00Z', 30), []);
  assert.ok((await names('2027-01-16T02:00:00Z', 45)).includes('Orion'));
  assert.ok((await names('2027-01-15T22:25:00Z', 80)).length > 2, 'no names in twilight');
  assert.deepEqual(await names('2027-01-15T18:00:00Z', 80), [], 'constellations named in daylight');
  // A star's card says which constellation it is in.
  await reset('2027-01-16T02:00:00Z');
  await page.evaluate(() => tonight.aimAt('Rigel VII'));
  await page.evaluate(() => tonight.show({ kind: 'star', i: tonight.state.sel.i }));
  assert.equal(plain(await text('#card-sub')), 'Rigel · 863 ly away · in Orion');
  await page.click('#card [data-close]');
  await reset('2026-11-19T11:15:00Z', sliderWas);
}

// Two planets close together each keep their name. Before dawn on 18 November 2026 Mars and Jupiter are 1.4° apart in
// Leo: Mars's name used to take the only place tried, Jupiter went unnamed, and its disc was painted over "Mars".
// Each name is clear of both discs and of the other name, close in and in the wide view, upright and on its side.
for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  const dawn = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
  const p = await dawn.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  await p.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-11-18T09:30:00Z'); });
  const where = `on a ${viewport.width}×${viewport.height} screen`;
  for (const fov of [30, 80]) {
    await p.evaluate(f => { tonight.aimAt('Regulus'); const v = tonight.state.view; tonight.look(v.az, v.alt, f); }, fov);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const { labels, bodies } = await p.evaluate(() => ({ labels: tonight.labels(), bodies: tonight.bodies() }));
    const meet = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const names = ['Mars', 'Jupiter'].map(n => labels.find(l => l.text === n));
    assert.ok(names[0] && names[1], `Mars and Jupiter are not both named ${where} at ${fov}°: ${labels.map(l => l.text)}`);
    assert.ok(!meet(names[0], names[1]), `Mars's and Jupiter's names overlap ${where} at ${fov}°`);
    for (const l of names) {
      assert.ok(l.x >= 0 && l.x + l.w <= viewport.width, `${l.text}'s name runs off the screen ${where}`);
      for (const b of bodies) assert.ok(!meet(l, { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }), `${l.text}'s name is under ${b.name}'s disc ${where} at ${fov}°`);
    }
  }
  await dawn.close();
}

// On a phone on its side the card's words scroll and Set course stays on the screen. The card used to run past the
// bottom edge there, with the button cut off or out of reach altogether. Every card in the list, at two sizes; the
// list itself scrolls as a whole on a screen that short, so every row of it can be reached under tonight's plan.
for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
  const side = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
  const p = await side.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  await p.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-11-18T08:20:00Z'); });
  await p.click('#open-list');
  const rows = await p.locator('#systems .system').count();
  assert.ok(rows > 25, `only ${rows} systems in tonight's list`);
  for (let k = 0; k < rows; k++) {
    if (k) await p.click('#open-list');
    await p.locator('#systems .system').nth(k).click();
    await p.locator('#card').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    // (A cluster or nebula the bridge doesn't fly to has no Set course: there its last row, the doors and Share, is
    // what must be on the screen.)
    const card = await p.evaluate(() => {
      const course = document.getElementById('card-course'), last = course.hidden ? document.getElementById('card-share-row') : course;
      const b = last.getBoundingClientRect(), c = document.getElementById('card').getBoundingClientRect();
      return { title: document.getElementById('card-title').textContent, top: c.top, button: b.bottom, height: course.hidden ? 44 : b.height };
    });
    assert.ok(card.height >= 44 && card.button <= viewport.height + 0.5, `${card.title}'s Set course ends at ${card.button} on a ${viewport.width}×${viewport.height} screen`);
    assert.ok(card.top >= 0, `${card.title}'s card starts above a ${viewport.width}×${viewport.height} screen`);
    await p.click('#card [data-close]');
  }
  await side.close();
}

// The place button, the only way into "Where you are", is a full-size tap target, and a guessed place and the time
// both fit on a phone.
{
  const here = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
  const p = await here.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-13T17:00:00Z'));
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  await p.evaluate(() => document.fonts.ready);
  assert.equal(await p.locator('#place-name').innerText(), 'Near New York?');
  assert.ok((await p.locator('#open-place').boundingBox()).height >= 44, 'the place button is too small to tap');
  // The row of controls is not a line of the bridge's star list, whatever its class says: no rule is drawn under it.
  assert.equal(await p.locator('.controls .row').evaluate(el => getComputedStyle(el).borderBottomWidth), '0px', 'a hairline is drawn under tonight’s controls');
  const cut = await p.evaluate(() => ['open-place', 'clock'].filter(id => { const el = document.getElementById(id); return el.scrollWidth > el.clientWidth; }));
  assert.deepEqual(cut, [], `“${await p.locator('#open-place').innerText()}” is cut off`);
  await here.close();
}

// On a wider screen the time follows the place after a dot. While the sky is still being charted there's no time yet,
// and no dot hanging after "Finding you…" either.
{
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await wide.newPage();
  p.on('pageerror', e => problems.push(e.message));
  let release;
  const held = new Promise(r => { release = r; });
  await p.route('**/data/stars.bin', async route => { await held; await route.continue(); });
  await p.goto(base + 'tonight.html');
  const dot = () => p.evaluate(() => getComputedStyle(document.getElementById('clock'), '::before').content);
  assert.equal(await dot(), 'none', 'a dot hangs after “Finding you…” before there’s a time');
  release();
  await p.waitForFunction(() => window.tonight);
  assert.equal(await dot(), '"· "', 'no dot between the place and the time');
  await wide.close();
}

// Away from the listed cities, the place is guessed from the time zone's standard time, not summer time: in July,
// Amsterdam's clocks are two hours ahead of UTC, but its zone is the one an hour ahead, 15° east.
{
  const summer = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Amsterdam' });
  const p = await summer.newPage();
  await p.clock.setFixedTime(new Date('2026-07-01T21:00:00Z'));
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  const guess = await p.evaluate(() => tonight.state.place);
  assert.equal(guess.how, 'guess');
  assert.equal(guess.lon, 15, `guessed ${guess.lon}° from Amsterdam’s time zone in summer`);
  // A guess saved the old way, from summer time, is made again; a city picked by hand is kept.
  await p.evaluate(() => localStorage.setItem('engage.tonight.v1', JSON.stringify({ place: { name: 'your time zone', lat: 40, lon: 30, tz: 'Europe/Amsterdam', how: 'guess' }, sky: 'dark' })));
  await p.reload();
  await p.waitForFunction(() => window.tonight);
  assert.equal(await p.evaluate(() => tonight.state.place.lon), 15, 'an old guess made from summer time was kept');
  await p.evaluate(() => tonight.place(48.86, 2.35, 'Paris', 'Europe/Paris'));
  await p.reload();
  await p.waitForFunction(() => window.tonight);
  assert.equal(await p.evaluate(() => tonight.state.place.name), 'Paris', 'the city picked by hand was guessed over');
  await summer.close();
}
// Chrome gives Argentina's zone by its old name, America/Buenos_Aires. That is still Buenos Aires, in the southern
// sky, and not "your time zone" at 40° north in the middle of the Atlantic.
{
  const south = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Argentina/Buenos_Aires' });
  const p = await south.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  assert.equal(await p.locator('#place-name').innerText(), 'Near Buenos Aires?');
  const guess = await p.evaluate(() => tonight.state.place);
  assert.deepEqual([guess.lat, guess.lon, guess.how], [-34.6, -58.38, 'guess']);
  assert.ok(await p.evaluate(() => { tonight.at('2026-11-19T03:00:00Z'); return tonight.tag('Cochrane’s home').alt; }) > 0, 'Alpha Centauri never sets from Buenos Aires');
  await south.close();
}
await page.evaluate(() => { tonight.at('2026-10-11T04:30:00Z'); tonight.aimAt('Vulcan'); });
await page.waitForTimeout(200);
const v2 = await page.evaluate(() => tonight.where('Vulcan'));
await page.touchscreen.tap(v2.x, v2.y);
await Promise.all([page.waitForNavigation(), page.click('#card-course')]);
await bridgeReady();
assert.equal(await text('#target-name'), '40 Eridani', 'set course did not choose Vulcan’s sun');

await page.goto(base);
await bridgeReady();

// Tonight's sky knows where the ship has been, from the bridge's log (which it only reads). After flying to Vega twice
// and to Alpheratz, a star with no notes, Vega's tag carries the mark and its card says when, Alpheratz has a quiet
// tag of its own, and a link like tonight.html#star=Vega opens straight on the card.
{
  const been = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await been.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.click('#intro-go');
  await p.evaluate(() => { for (const name of ['Vega', 'Alpheratz', 'Vega']) { engage.jump(name); engage.closeSheets(); } });
  const stardate = await p.evaluate(() => engage.state.log[0].stardate);
  // The log's records are worked out from its entries, and an entry can be acted on: set course for its star again
  // (not for the star the ship is at), or see where it is in the real sky tonight.
  await p.click('#open-log');
  // (Vega to Alpheratz and back are the same 90.3 ly, so either may hold the longest trip.)
  assert.match((await p.locator('#records div').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join('; '),
    /^FARTHEST FROM SOL Alpheratz · 97\.0 ly; LONGEST TRIP 90\.3 ly to (Alpheratz|Vega); MOST VISITED Vega · 2 visits; CHARTED DESTINATIONS 2 of 35; KINDS OF STAR 2 of 7 OBAFGKM$/);
  assert.equal(await p.locator('.past').nth(0).locator('[data-again]').count(), 0, 'the log offers a course for the star the ship is at');
  await p.locator('.past summary').nth(1).click();
  // Share this course, from an entry: with no share sheet (a desktop browser) the link is copied and the button says
  // so for a moment. Opened on the bridge, the link sets that course.
  await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.copied = t; } } }));
  const shareIt = p.locator('.past').nth(1).getByRole('button', { name: 'Share this course' });
  await shareIt.click();
  assert.equal(await p.locator('.past').nth(1).locator('[data-share]').innerText(), 'LINK COPIED');
  const link = await p.evaluate(() => window.copied);
  assert.equal(link, 'https://engage.junkdrawer.works/?course=Alpheratz');
  await p.waitForFunction(() => document.querySelector('.past:nth-of-type(2) [data-share]').textContent === 'Share this course', null, { timeout: 4000 })
    .catch(() => assert.fail('the button went on saying Link copied'));
  // Where nothing can be copied either (some embedded viewers), the link is shown, selected, to copy by hand.
  await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('not allowed'); } } }));
  await shareIt.click();
  assert.deepEqual(await p.locator('.past').nth(1).locator('.share-link').evaluate(el => [el.value, el.selectionEnd - el.selectionStart, document.activeElement === el]), [link, link.length, true]);
  await p.goto(link.replace('https://engage.junkdrawer.works/', base));
  await bridgeReady(p);
  assert.equal(await p.locator('#target-name').innerText(), 'Alpheratz', 'the shared link did not set the course');
  await p.evaluate(() => engage.target('no such star')); // clear it again
  assert.equal(await p.locator('#engage').isDisabled(), true);
  await p.click('#open-log');
  await p.locator('.past summary').nth(1).click();
  await p.locator('.past').nth(1).getByRole('button', { name: 'Set course again' }).click();
  assert.equal(await p.locator('#log').evaluate(el => el.hidden), true, 'Set course again left the log open');
  assert.equal(await p.locator('#target-name').innerText(), 'Alpheratz');
  assert.equal(await p.locator('#engage').isDisabled(), false);
  await p.click('#open-log');
  await p.locator('.past summary').nth(0).click();
  const bridgeSave = await p.evaluate(() => localStorage.getItem('engage.v1'));
  await Promise.all([p.waitForNavigation(), p.locator('.past').nth(0).getByRole('link', { name: 'In your sky tonight' }).click()]);
  assert.equal(new URL(p.url()).pathname + new URL(p.url()).hash, '/tonight.html#star=Vega');
  await p.waitForFunction(() => window.tonight);
  assert.equal(await p.locator('#card').evaluate(el => el.hidden), false, 'a link to a star did not open its card');
  assert.equal(await p.locator('#card-title').innerText(), 'Vega colony');
  assert.equal(await p.locator('#card-been').innerText(), `You’ve dropped out of warp here twice, the last on stardate ${stardate}.`);
  // The ship is holding at Vega, so the card offers no course for it (the bridge would open with nothing chosen):
  // it says where the ship is, with a way back.
  assert.equal(await p.locator('#card-course').evaluate(el => el.hidden), true, 'the card offers a course for the star the ship is at');
  assert.equal((await p.locator('#card-here').innerText()).replace(/\s+/g, ' '), 'The ship is holding here now. Back to the bridge');
  assert.equal(await p.locator('#card-here a').evaluate(a => a.pathname), '/');
  assert.equal(await p.evaluate(() => tonight.state.sel.kind), 'star');
  await p.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-10-11T00:30:00Z'); tonight.aimAt('Vega'); });
  await p.waitForTimeout(200);
  const marks = Object.fromEntries((await p.evaluate(() => tonight.tags())).map(t => [t.name, t.been]));
  assert.equal(marks['Vega colony'], true, 'Vega’s tag does not say the ship has been there');
  assert.equal(marks.Farpoint, false, 'a star the ship has not been to is marked as visited');
  await p.evaluate(() => { location.hash = '#star=Alpheratz'; });
  await p.waitForFunction(() => document.getElementById('card-title').textContent === 'Alpheratz');
  assert.equal(await p.locator('#card-kind').innerText(), 'FROM YOUR LOG');
  assert.equal(await p.locator('#card-been').innerText(), `You dropped out of warp here on stardate ${stardate}.`);
  await p.waitForTimeout(1100); // the view turns to it
  assert.ok((await p.evaluate(() => tonight.tags())).some(t => t.name === 'Alpheratz' && t.been), 'a logged star with no notes has no tag');
  // A star in the log that the ship has left again offers the course again. The name is the card's heading, not
  // in the button, where it ran to two lines on a phone; a screen reader still hears which star.
  assert.equal(await p.locator('#card-here').evaluate(el => el.hidden), true);
  assert.match(await p.locator('#card-course').innerText(), /^Set course again$/i);
  assert.deepEqual(await p.locator('#card-course').evaluate(a => [a.getAttribute('aria-label'), a.search, a.getBoundingClientRect().height]), ['Set course again for Alpheratz', '?course=Alpheratz', 48]);
  // A star the ship hasn't been to says nothing about it, and offers a first course.
  await p.evaluate(() => { location.hash = '#star=Deneb'; });
  await p.waitForFunction(() => document.getElementById('card-title').textContent === 'Farpoint');
  assert.equal(await p.locator('#card-been').evaluate(el => el.hidden), true);
  assert.match(await p.locator('#card-course').innerText(), /^Set course$/i);
  assert.equal(await p.locator('#card-course').getAttribute('aria-label'), 'Set course for Deneb');
  await p.click('#card .close');
  await p.click('#open-list');
  assert.match(await p.locator('#list-note').innerText(), /You’ve flown to 2 of the stars listed here\.$/);
  assert.equal(await p.locator('#systems .s-been').count(), 2);
  assert.ok(await p.evaluate(() => localStorage.getItem('engage.v1')) === bridgeSave, 'tonight’s sky wrote to the bridge’s save');
  // A course link for the star the ship is at (an old card, the survey, a shared link) can't set a course. The helm
  // says why, and doesn't open as if the link had done nothing.
  await p.goto(base + '?course=Vega');
  await bridgeReady(p);
  assert.deepEqual([await p.locator('#target-name').innerText(), await p.locator('#target-sub').innerText()], ['Choose another star', 'You’re holding at Vega.']);
  assert.equal(await p.locator('#engage').isDisabled(), true);
  await p.evaluate(() => engage.target('Deneb'));
  assert.equal(await p.locator('#target-name').innerText(), 'Deneb');

  // A logged star is described here as the bridge describes it. ρ Cassiopeiae has no measured distance: its tag and
  // card say so, with no "3,262 ly away" and no year for its light. Mira's type names no size, and she is a giant.
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => { for (const name of ['ρ Cassiopeiae', 'Mira', 'Sol']) { engage.jump(name); engage.closeSheets(); } });
  // The entry for coming home has no course to share (a link home sets nothing on a bridge that is already there).
  await p.click('#open-log');
  await p.locator('.past').first().locator('summary').click();
  assert.deepEqual(await p.locator('.past').first().locator('.entry-actions > *').evaluateAll(els => els.map(el => el.textContent)), ['In your sky tonight']);
  assert.equal(await p.locator('.past').nth(1).locator('[data-share]').count(), 1);
  await p.goto(base + 'tonight.html#star=' + encodeURIComponent('ρ Cassiopeiae'));
  await p.waitForFunction(() => window.tonight && document.getElementById('card-title').textContent === 'ρ Cassiopeiae');
  assert.equal(await p.locator('#card-sub').innerText(), 'Distance not measured · in Cassiopeia');
  const rho = await p.locator('#card-facts').innerText();
  assert.match(rho, /^Yellow-white supergiant, spectral type F8Iavar\. Nobody has measured how far away it is/);
  assert.doesNotMatch(await p.locator('#card').innerText(), /3,262|BCE|left it in/, 'tonight’s sky gave an unmeasured star a distance or a year');
  await p.evaluate(() => { location.hash = '#star=Mira'; });
  await p.waitForFunction(() => document.getElementById('card-title').textContent === 'Mira');
  assert.match(await p.locator('#card-facts').innerText(), /^Red giant, spectral type M5e-M9e\. The light reaching you tonight left it in 17\d\d\.$/);
  await p.click('#card .close');

  // A logged star too faint to see from here has no tag and no ring on the sky (a long log of catalogue stars buried
  // Starfleet's tags in amber "too faint to see" and rings); it stays in the list, Been there, and is drawn in full
  // while it is chosen. Gliese 153 A, magnitude 9 from Earth, never sets from New York.
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => { engage.jump('Gliese 153A'); engage.closeSheets(); });
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  await p.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-10-11T03:30:00Z'); tonight.aimAt('Gliese 153A'); });
  await p.keyboard.press('Escape'); // looking that way with nothing chosen
  await p.evaluate(() => tonight.look(tonight.state.view.az, tonight.state.view.alt, 80));
  await p.waitForTimeout(200);
  const faint = await p.evaluate(() => ({ tag: tonight.tag('Gliese 153A'), tags: tonight.tags().map(t => t.name), rings: tonight.rings(), at: tonight.where('Gliese 153A') }));
  assert.ok(faint.tag && faint.tag.alt > 0 && !faint.tag.seen, `Gliese 153A is not up and too faint: ${JSON.stringify(faint.tag)}`);
  assert.ok(faint.at && faint.at.x > 0 && faint.at.x < 390 && faint.at.y > 100 && faint.at.y < 700, 'Gliese 153A is not on the screen');
  assert.ok(!faint.tags.includes('Gliese 153A') && !faint.rings.includes('Gliese 153A'), 'a logged star too faint to see is marked on the sky');
  assert.ok(faint.tags.length + faint.rings.length > 0, 'nothing else is tagged there either');
  await p.click('#open-list');
  const row = p.locator('#systems .system', { hasText: 'Gliese 153A' });
  assert.match(await row.innerText(), /Been there[\s\S]*too faint to see/i);
  await row.click();
  await p.waitForTimeout(1100);
  assert.ok((await p.evaluate(() => tonight.tags())).some(t => t.name === 'Gliese 153A' && t.been), 'a faint logged star chosen from the list is not drawn');
  await been.close();
}

// Nebulae and clusters as destinations: the Orion Nebula is in Set course under its own heading, the flight holds 28
// light years out with the whole nebula painted ahead at its true size, the log says where the ship is and that the
// shape is an impression, and its course page is the nebula's own. From Earth, facing Orion, it is a faint patch.
{
  const neb = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await neb.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.click('#intro-go');
  await p.evaluate(() => engage.lookAtStar('θ¹ Orionis'));
  await p.waitForTimeout(400);
  const home = (await p.evaluate(() => engage.sights)).find(x => x.id === 'orion');
  assert.ok(home && home.r > 3 && home.r < 20, `from Earth the Orion Nebula is not a small patch: ${JSON.stringify(home)}`);
  await p.click('#choose');
  const heads = await p.locator('#picker .group').allInnerTexts();
  assert.ok(heads.some(h => /nebulae and clusters/i.test(h)), `no Nebulae and clusters heading in Set course: ${heads}`);
  await p.locator('#picker .row', { hasText: 'The Orion Nebula' }).click();
  assert.equal(await p.locator('#target-name').innerText(), 'The Orion Nebula');
  await p.evaluate(() => { engage.speed(50); });
  await p.tap('#engage');
  await p.waitForFunction(() => !engage.trip && !document.getElementById('arrival').hidden, null, { timeout: 60000 });
  assert.match(await p.locator('#arrival').innerText(), /We’ve dropped out of warp at the Orion Nebula, 1,344 ly from Sol, and are holding 28 light years out, with the whole nebula ahead\./);
  assert.match(await p.locator('#arrival').innerText(), /its glow is real, its shape an impression/);
  await p.evaluate(() => engage.closeSheets());
  await p.waitForTimeout(300);
  const there = (await p.evaluate(() => engage.sights)).find(x => x.id === 'orion');
  assert.ok(there && there.r > 120, `the nebula is not painted across the viewscreen: ${JSON.stringify(there)}`);
  assert.equal(await p.locator('#where').innerText(), 'The Orion Nebula');
  const page = await (await fetch(base + 'course/the-orion-nebula.html')).text();
  assert.match(page, /<meta property="og:title" content="Set course for the Orion Nebula">/);
  assert.match(page, /<meta property="og:description" content="A cloud about 25 light years across where new stars are being born/);
  await neb.close();
}

// Clusters, nebulae and galaxies in tonight's sky, from the one list the bridge and the warp scale use too. New York
// at 10 pm on 8 January 2027, a suburban sky and the Moon down: the Pleiades and the Hyades are tagged as patches at
// their true size, a link opens a card, the Pleiades take Alcyone's place (its course and its visits), and the list
// has them under their own heading, the ones too faint for this sky said to be.
{
  const deep = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await deep.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.click('#intro-go');
  await p.evaluate(() => { engage.jump('Alcyone'); engage.closeSheets(); engage.jump('Sol'); engage.closeSheets(); });
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  await p.evaluate(() => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2027-01-09T03:00:00Z'); tonight.look(190, 45, 90); });
  await p.waitForTimeout(200);
  const drawn = await p.evaluate(() => tonight.sights());
  const pleiades = drawn.find(x => x.id === 'pleiades');
  assert.ok(pleiades && pleiades.box && pleiades.been, `the Pleiades are not tagged, or not as visited: ${JSON.stringify(drawn)}`);
  assert.ok(drawn.some(x => x.id === 'hyades'), 'the Hyades are not drawn');
  // Its tag is beside it, not over it.
  const b = pleiades.box;
  assert.ok(!(pleiades.x > b.x && pleiades.x < b.x + b.w && pleiades.y > b.y && pleiades.y < b.y + b.h), 'the Pleiades’ tag covers them');
  // Alcyone has no tag of its own any more: the Pleiades are it.
  assert.ok(!(await p.evaluate(() => tonight.tags())).some(t => t.name === 'The Pleiades'), 'the Pleiades are tagged twice');
  // A link from the log to Alcyone opens the Pleiades' card, with its course and when the ship was there.
  await p.evaluate(() => { location.hash = '#star=Alcyone'; });
  await p.waitForFunction(() => document.getElementById('card-title').textContent === 'The Pleiades');
  assert.equal(await p.locator('#card-kind').innerText(), 'STAR CLUSTER');
  assert.equal(await p.locator('#card-sub').innerText(), '403 light years away · in Taurus');
  assert.match(await p.locator('#card-been').innerText(), /^You dropped out of warp here on stardate /);
  assert.deepEqual(await p.locator('#card-course').evaluate(a => [a.hidden, a.search, a.textContent.trim()]), [false, '?course=Alcyone', 'Set course again']);
  assert.equal(await p.locator('#card-doors a').getAttribute('href'), './warp.html#pleiades');
  // The Orion Nebula's own link, its card and what it says about seeing it.
  await p.evaluate(() => { location.hash = '#sight=orion'; });
  await p.waitForFunction(() => document.getElementById('card-title').textContent === 'The Orion Nebula');
  assert.deepEqual([await p.locator('#card-kind').innerText(), await p.locator('#card-sub').innerText()], ['NEBULA', 'M42 · 1,344 light years away · in Orion']);
  assert.match(await p.locator('#card-look').innerText(), /^\d+° up in the south(-[a-z]+)?\. You can see it by eye from the suburbs\. Binoculars show it better\.$/);
  assert.match(await p.locator('#card-facts').innerText(), /^1\.1° across the sky, about 25 light years wide\. The light reaching you tonight left it in 68\d\. A nebula is a captain’s favourite place/);
  assert.deepEqual(await p.locator('#card-course').evaluate(a => [a.hidden, decodeURIComponent(a.search)]), [false, '?course=θ¹ Orionis']);
  assert.equal(await p.locator('#card-share').innerText(), 'Share this nebula');
  assert.equal(await p.locator('#card-doors a').getAttribute('href'), './warp.html#orion');
  await p.click('#card .close');
  await p.click('#open-list');
  const rows = await p.locator('#systems .system.sight').allInnerTexts();
  assert.equal(rows.length, 14);
  assert.ok(await p.locator('#systems .systems-head').isVisible());
  const row = name => rows.find(r => r.startsWith(name)).replace(/\s+/g, ' ');
  assert.match(row('Andromeda'), /too faint to see$/, 'Andromeda is said to be visible from the suburbs');
  assert.match(row('The Ring Nebula'), /(needs a telescope|Below the horizon)$/);
  // The warp scale's rung for a cluster opens its card here.
  await p.goto(base + 'warp.html#beehive');
  await p.waitForFunction(() => window.warpScale);
  assert.equal(await p.locator('#place h2').innerText(), 'The Beehive');
  await Promise.all([p.waitForNavigation(), p.getByRole('link', { name: 'In your sky tonight' }).click()]);
  await p.waitForFunction(() => window.tonight && document.getElementById('card-title').textContent === 'The Beehive');
  await deep.close();
}

// Records kept before the rooms kept standing ones: the Kobayashi Maru's runs and first contact's encounters with
// nothing beside them, and a bridge log from before its entries could be acted on. Nothing in them is lost, and the
// endings seen, best grades and runs taken, the species met, contacts made and best notebook, are filled in from them.
{
  const old = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const grades = letters => ['Compassion', 'Judgment', 'Restraint', 'Nerve'].map((name, k) => ({ name, letter: letters[k] }));
  const maruRuns = [
    { title: 'The lifeboat', outcome: 'warp', grades: grades('CBBB'), at: '2026-11-16T10:00:00.000Z' },
    { title: 'By the book', outcome: 'stayed', grades: grades('FCAF'), at: '2026-11-17T10:00:00.000Z' },
  ];
  const contactRuns = [
    { title: 'First contact', outcome: 'contact', people: 'Thaejy', decoded: 1, of: 11, at: '2026-11-15T10:00:00.000Z' },
    { title: 'The channel closes', outcome: 'silence', people: 'Orruvan', decoded: 7, of: 8, at: '2026-11-16T10:00:00.000Z' },
  ];
  const bridge = {
    at: 0, offset: [1e-6, 0, 0], yaw: 1, pitch: 0, fov: 1, target: null, warp: 7, ly: 8.5, opts: { lines: true, labels: false, sound: false }, seenIntro: true,
    log: [
      { star: 0, title: 'Sol', stardate: '2026.870', intro: 'Back home, holding in Earth’s orbit.', sections: [['The star', 'Yellow dwarf.']], ly: 4.25 },
      { star: 1, title: 'A star', stardate: '2026.860', intro: 'We’ve dropped out of warp.', sections: [['The star', 'Red dwarf.'], ['', 'A note.']], ly: 4.25 },
    ],
  };
  await old.addInitScript(([maru, contact, engage]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('engage.maru.v1', JSON.stringify({ runs: maru }));
    localStorage.setItem('engage.contact.v1', JSON.stringify({ runs: contact }));
    localStorage.setItem('engage.v1', JSON.stringify(engage));
  }, [maruRuns, contactRuns, bridge]);
  const p = await old.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  assert.equal(await p.locator('#endings-n').innerText(), '2 OF 9');
  assert.deepEqual(await p.locator('#endings li.seen').allInnerTexts(), ['By the book', 'The lifeboat']);
  assert.equal((await p.locator('#best').innerText()).replace(/\s+/g, ' '), 'C COMPASSION B JUDGMENT A RESTRAINT B NERVE');
  assert.equal(await p.locator('#taken').innerText(), '2 RUNS TAKEN');
  assert.equal(await p.locator('#runs li').count(), 2);
  // Each run's date is the day and then the month, as the captain's log writes dates, whatever the browser's own way.
  for (const when of await p.locator('#runs .when').allInnerTexts()) assert.match(when, /^\d{1,2} [A-Z][a-z]{2}$/, `a run is dated “${when}”`);
  // The next run is added to them, and the old runs are saved back as they were.
  await p.click('#start');
  await p.click('.order[data-id="leave"]');
  await p.waitForFunction(() => !maru.busy && document.getElementById('read-eval'), null, { timeout: 20000 });
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.maru.v1')));
  assert.deepEqual(kept.runs.slice(0, 2), maruRuns, 'the old runs were changed');
  assert.deepEqual([kept.runs.length, kept.seen, kept.taken, kept.best.Restraint], [3, ['By the book', 'The lifeboat'], 3, 'A']);

  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  assert.equal((await p.locator('#tally').innerText()).replace(/\s+/g, ' '), '2 SPECIES MET 1 CONTACT MADE 7/8 BEST NOTEBOOK CONVERSATIONAL');
  assert.equal(await p.locator('#runs li').count(), 2);
  await p.click('#start');
  await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await p.click('#leave');
  await p.waitForFunction(() => !contact.busy && contact.game.over, null, { timeout: 20000 });
  const heard = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.contact.v1')));
  assert.deepEqual(heard.runs.slice(0, 2), contactRuns, 'the old encounters were changed');
  assert.deepEqual([heard.runs.length, heard.met, heard.contacts, heard.best], [3, 3, 1, { decoded: 7, of: 8 }]);

  // The bridge's log, opened and saved again, is the log it was; its records and each entry's actions come from it.
  await p.goto(base);
  await bridgeReady(p);
  await p.click('#open-log');
  assert.match(await p.locator('#stats').innerText(), /^2 stars visited · 8\.50 ly travelled$/);
  assert.equal(await p.locator('.past').count(), 2);
  assert.equal(await p.locator('.past [data-again]').count(), 1, 'an old entry has no Set course again');
  assert.match((await p.locator('#records').innerText()).replace(/\s+/g, ' '), /CHARTED DESTINATIONS \d+ of 35 KINDS OF STAR \d of 7 OBAFGKM( Rare kinds: [\w, -]+)?$/);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')));
  assert.deepEqual(after.log, bridge.log, 'the old log was changed');
  // (Settings that came later, the mission clock, Report and the pinned log, are added to the old ones, off.)
  const { clock, report, pinLog, ...opts } = after.opts;
  assert.deepEqual([after.warp, after.ly, opts, clock, report, pinLog], [bridge.warp, bridge.ly, bridge.opts, false, false, false]);
  await old.close();
}

// The screen stays awake while the phone is pointed at the sky, and while a warp-scale race runs, and not otherwise.
// (Headless Chromium has no screen to keep awake, so the browser's wake lock is stood in for: it counts what is
// asked of it.)
{
  const awake = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await awake.addInitScript(() => {
    window.wake = { asked: 0, held: 0, last: null };
    if (window.DeviceOrientationEvent) DeviceOrientationEvent.requestPermission = async () => 'granted'; // as on a phone that has said yes
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async type => {
      if (type !== 'screen') throw new Error('not a screen lock');
      const lock = new EventTarget();
      lock.release = async () => { if (lock.gone) return; lock.gone = true; window.wake.held--; lock.dispatchEvent(new Event('release')); };
      window.wake.asked++; window.wake.held++; window.wake.last = lock;
      return lock;
    } } });
  });
  const p = await awake.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const wake = async () => { await p.waitForTimeout(50); return p.evaluate(() => [window.wake.asked, window.wake.held]); };
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  assert.deepEqual(await wake(), [0, 0], 'the screen is kept awake before anything asked for it');
  await p.click('#sensors');
  await p.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, beta: 60, gamma: 0, absolute: true })));
  assert.equal(await p.locator('#sensors').innerText(), 'STOP');
  assert.deepEqual(await wake(), [1, 1], 'Point your phone did not keep the screen awake');
  // The browser lets go of the lock when the page is hidden; back on screen, it is asked for again.
  await p.evaluate(() => { window.wake.last.release(); document.dispatchEvent(new Event('visibilitychange')); });
  assert.deepEqual(await wake(), [2, 1], 'the screen was not kept awake again after coming back to the page');
  await p.click('#sensors');
  assert.deepEqual(await wake(), [2, 0], 'Stop left the screen held awake');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.deepEqual(await wake(), [2, 0], 'coming back to the page kept the screen awake with the sensors off');
  // Stopping and pointing again starts the wait for a first reading afresh: the first try's wait, still running, used
  // to end the second try two and a half seconds after the first began, and take the button away for good.
  await p.click('#sensors');
  await p.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, beta: 60, gamma: 0, absolute: true })));
  await p.click('#sensors'); // stop
  await p.waitForTimeout(2000);
  await p.click('#sensors'); // point again: a slow compass takes a second to answer
  await p.waitForTimeout(1000);
  assert.deepEqual(await p.evaluate(() => [tonight.state.sensing, document.getElementById('sensors').hidden]), [true, false], 'pointing again was cut short by the first try’s wait');
  await p.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, beta: 60, gamma: 0, absolute: true })));
  await p.click('#sensors'); // stop
  assert.deepEqual(await wake(), [4, 0]);
  // With no compass to read, pointing gives up after a moment, and lets the screen go with it.
  await p.click('#sensors');
  assert.deepEqual(await wake(), [5, 1]);
  await p.waitForFunction(() => document.getElementById('sensors').hidden, null, { timeout: 6000 });
  assert.deepEqual(await wake(), [5, 0], 'the screen stayed awake after pointing gave up');

  await p.goto(base + 'warp.html');
  await p.waitForFunction(() => window.warpScale);
  assert.deepEqual(await wake(), [0, 0]);
  await p.click('#go');
  assert.deepEqual(await wake(), [1, 1], 'a race did not keep the screen awake');
  await p.click('#go'); // skip ahead
  assert.deepEqual(await wake(), [1, 0], 'the screen stayed awake after the race');
  await p.click('#go'); // race again
  await p.locator('.rung[data-id="vulcan"]').click();
  assert.deepEqual(await wake(), [2, 0], 'picking another place left the screen held awake');
  await awake.close();
}

// The xenobiology lab: reached from the bridge, a creature grown for a class, kept in a jar, and reached from a survey file.
await Promise.all([page.waitForNavigation(), page.click('#open-xeno')]);
await page.waitForFunction(() => window.xeno?.current);
assert.match(await text('#specimen .eyebrow'), /Class M/i);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the lab scrolls sideways on a phone');
await page.getByRole('button', { name: 'Class L: Forested, no animals' }).click();
assert.match(new URL(page.url()).hash, /^#L-\d+$/);
assert.match(await text('#specimen'), /grew a plant/);
const firstL = await page.evaluate(() => xeno.current.seed);
await page.click('#again');
assert.notEqual(await page.evaluate(() => xeno.current.seed), firstL, 'growing another grew the same one');
await page.evaluate(() => xeno.show('lava-world', 7));
assert.match(await text('#refs'), /Horta/);
assert.equal(await page.locator('#specimen .notes li').count(), 4);
await page.waitForTimeout(1600); // it grows in
const tankLit = await page.evaluate(() => {
  const c = document.getElementById('tank'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set(); for (let i = 0; i < d.length; i += 40) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
  return seen.size;
});
assert.ok(tankLit > 40, 'the tank is not drawn');
await page.click('#keep');
assert.equal(await text('#keep'), 'IN A JAR');
assert.equal(await page.locator('#jars .jar').count(), 1);
await page.reload();
await page.waitForFunction(() => window.xeno?.current);
assert.deepEqual(await page.evaluate(() => [xeno.current.classId, xeno.current.seed]), ['lava-world', 7], 'the link did not bring back the same creature');
// Send this creature hands the share sheet (stood in for here) a link to the live site that grows the same one again.
{
  const name = await text('#specimen h2');
  await page.evaluate(() => { navigator.share = async data => { window.shared = data; }; });
  await page.click('#send');
  const shared = await page.evaluate(() => window.shared);
  assert.equal(shared.url, 'https://engage.junkdrawer.works/xeno.html#lava-world-7');
  assert.ok(shared.text.toLowerCase().includes(name.toLowerCase()) && shared.text.includes('a lava world'), `the message does not name the creature: ${shared.text}`);
  await page.evaluate(() => xeno.show('M', 1));
  await page.goto(shared.url.replace('https://engage.junkdrawer.works/', base));
  await page.waitForFunction(() => window.xeno?.current?.seed === 7);
  assert.equal(await text('#specimen h2'), name, 'the shared link grew a different creature');
}
assert.equal(await page.locator('#jars .jar').count(), 1, 'the jar was not kept');
// Letting one go can be taken back, and the count beside Keep links down to the jars.
assert.match(await text('#kept-note'), /^1 kept in your jars/);
// Under a thumb: the jar's let-go button is a 30 px disc, and a tap lands on it from 7 px outside the disc all round;
// the lab's text links are 44 px tall.
{
  await page.locator('#jars .jar-drop').scrollIntoViewIfNeeded();
  const reach = await page.evaluate(() => {
    const drop = document.querySelector('#jars .jar-drop'), r = drop.getBoundingClientRect();
    const at = (x, y) => document.elementFromPoint(x, y) === drop;
    return { disc: [r.width, r.height], hits: [at(r.left - 6, r.top + 15), at(r.right + 6, r.top + 15), at(r.left + 15, r.top - 6), at(r.left + 15, r.bottom + 6)], past: at(r.left - 10, r.top + 15) };
  });
  assert.deepEqual(reach, { disc: [30, 30], hits: [true, true, true, true], past: false }, 'the jar’s let-go button is not a 30 px disc with a 44 px tap area');
  for (const sel of ['#send', '#kept-note a', '#specimen .to-file']) assert.ok(await page.locator(sel).first().evaluate(el => el.getBoundingClientRect().height) >= 44, `${sel} is under 44 px tall`);
}
await page.click('#jars .jar-drop');
assert.equal(await page.locator('#jars .jar').count(), 0);
assert.match(await text('#jar-undo'), /^Let the .+ go\.\s+Undo$/i);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.length), 0);
await page.click('#jar-undo-go');
// (A jar keeps when it was kept, for the captain's log.)
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.map(({ at, ...j }) => [j, Date.parse(at) > 0])), [[{ id: 'lava-world', seed: 7 }, true]], 'Undo did not put the creature back in its jar');
assert.equal(await shown('#jar-undo'), false);
assert.equal(await text('#keep'), 'IN A JAR');
await page.click('#jars .jar-drop');
await page.waitForFunction(() => document.getElementById('jars-wrap').hidden, null, { timeout: 15000 }); // the Undo line goes after a few seconds
assert.equal(await shown('#kept-note'), false);
// The shelf holds 40. A 41st is never kept by quietly dropping the oldest: Keep says the jars are full and waits.
for (let seed = 1; seed <= 41; seed++) {
  await page.evaluate(n => xeno.show('M', n, false), seed);
  if (seed <= 40) await page.click('#keep');
}
assert.equal(await page.evaluate(() => xeno.jars.length), 40);
assert.ok(await page.locator('#keep').isDisabled(), 'Keep still works with every jar full');
assert.equal(await text('#keep'), 'JARS FULL: LET ONE GO FIRST');
assert.match(await text('#jars-head'), /40 OF 40/i);
assert.match(await text('#kept-note'), /All 40 jars are full/);
await page.evaluate(() => document.getElementById('keep').click()); // even a click that gets through changes nothing
assert.deepEqual(await page.evaluate(() => (({ at, ...j }) => j)(xeno.jars[39])), { id: 'M', seed: 1 }, 'the first creature kept was dropped to make room');
assert.equal(await page.evaluate(() => xeno.jars.some(j => j.seed === 41)), false);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the lab scrolls sideways with full jars');
// The link beside Keep goes down to the jars without changing the address, which names the creature in the tank.
await page.click('#kept-note a');
assert.equal(new URL(page.url()).hash, '#M-41');
// Let one go, and the 41st can be kept; the other 39 are still there.
await page.click('#jars .jar-drop'); // the newest, seed 40
assert.equal(await text('#keep'), 'KEEP IN A JAR');
await page.click('#keep');
assert.deepEqual(await page.evaluate(() => xeno.jars.map(j => j.seed)), [41, ...Array.from({ length: 39 }, (_, i) => 39 - i)]);
// With the shelf full again, the Undo for the one let go has nowhere to put it, so it is withdrawn.
assert.equal(await shown('#jar-undo'), false);
assert.equal(await page.evaluate(() => xeno.jars.length), 40);
assert.equal(await page.evaluate(() => xeno.jars.some(j => j.seed === 40)), false);
await page.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
await page.goto(base + 'survey.html#O');
await page.waitForFunction(() => window.survey);
await Promise.all([page.waitForNavigation(), page.locator('#file a', { hasText: 'Grow a creature for Class O' }).click()]);
await page.waitForFunction(() => window.xeno?.current);
assert.equal(await page.evaluate(() => xeno.current.classId), 'O');
// Grow another gives another animal by name too. Lava worlds and hot Jupiters had one name for every creature and
// Class N three; ten presses on each now bring at least five names, and no blank or broken one.
for (const id of ['lava-world', 'hot-jupiter', 'N']) {
  await page.evaluate(c => xeno.show(c, 1, false), id);
  const seen = new Set();
  for (let k = 0; k < 10; k++) {
    await page.click('#again');
    const [common, latin] = [await text('#specimen h2'), await text('#specimen .latin')];
    assert.match(common, /^[A-Z][a-z-]+ [a-z -]+ [a-z-]+$/, `${id}: “${common}”`);
    assert.match(latin, /^[A-Z][a-z]+ [a-z]+$/, `${id}: “${latin}”`);
    seen.add(common);
  }
  assert.ok(seen.size >= 5, `ten ${id} creatures had ${seen.size} names between them: ${[...seen].join(', ')}`);
}
// A flyer's raised wing stays inside the tank and under its tag. It used to run off the top (Class O's specimen
// 102, Class M's 66, Class Y's 8), so the top rows of the picture had a wing's edge in them; now they are sky, which
// changes only smoothly from one pixel to the next. Looked at through a whole wingbeat.
for (const [id, seed] of [['O', 102], ['M', 66], ['Y', 8]]) {
  await page.evaluate(([c, n]) => xeno.show(c, n, false), [id, seed]);
  assert.equal(await page.evaluate(() => xeno.current.body.plan), 'flyer');
  let worst = 0;
  for (let k = 0; k < 14; k++) {
    await page.waitForTimeout(210);
    worst = Math.max(worst, await page.evaluate(() => {
      const c = document.getElementById('tank'), g = c.getContext('2d');
      let jump = 0;
      for (const y of [0, 1, Math.round(c.height * 0.05)]) {
        const d = g.getImageData(0, y, c.width, 1).data;
        for (let i = 4; i < d.length; i += 4) jump = Math.max(jump, Math.abs(d[i] - d[i - 4]) + Math.abs(d[i + 1] - d[i - 3]) + Math.abs(d[i + 2] - d[i - 2]));
      }
      return jump;
    }));
  }
  assert.ok(worst < 40, `${id}-${seed}: something with an edge (a wing?) is in the top rows of the tank: a jump of ${worst}`);
}
// A link that names nothing the lab knows says so; one that does, and any creature grown after, doesn't.
for (const [hash, note] of [['#Q-3', true], ['#world=GJ%201214%20b-5', true], ['#M-5x', true], ['#M-5', false], ['', false], ['#world=Proxima%20b-5', false]]) {
  await page.goto(base + 'maru.html');
  await page.goto(base + 'xeno.html' + hash);
  await page.waitForFunction(() => window.xeno?.current);
  assert.equal(await shown('#link-note'), note, `xeno.html${hash}`);
  if (note) {
    assert.equal(await text('#link-note'), 'That link didn’t name a creature the lab knows, so here’s a new one.');
    await page.click('#again');
    assert.equal(await shown('#link-note'), false, 'the note stayed after growing another');
  }
}
// A creature for a real planet. The Class M file's planets each have their own link beside Set course; the lab grows
// one from TRAPPIST-1 e's own width, mass, temperature and star, and the link, a reload and a jar all bring it back.
await page.goto(base + 'survey.html#M');
await page.waitForFunction(() => window.survey);
assert.deepEqual(await page.locator('#file .worlds a', { hasText: 'Grow a creature for' }).allInnerTexts().then(l => l.map(t => t.replace(/\s*→$/, ''))),
  ['GROW A CREATURE FOR PROXIMA B', 'GROW A CREATURE FOR TEEGARDEN’S STAR B', 'GROW A CREATURE FOR TRAPPIST-1 E']);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the survey scrolls sideways with the lab’s links');
await Promise.all([page.waitForNavigation(), page.locator('#file a', { hasText: 'Grow a creature for TRAPPIST-1 e' }).click()]);
await page.waitForFunction(() => window.xeno?.current);
{
  const grown = () => page.evaluate(() => ({ world: xeno.current.world?.name, seed: xeno.current.seed, name: xeno.current.name.common, g: xeno.current.env.g, star: xeno.current.env.star, hash: location.hash }));
  const first = await grown();
  assert.equal(first.world, 'TRAPPIST-1 e');
  assert.equal(first.hash, `#world=TRAPPIST-1%20e-${first.seed}`);
  assert.ok(Math.abs(first.g - 0.692 / 0.92 ** 2) < 1e-9 && first.star === 'red', 'the creature was not grown from the planet’s own readings');
  assert.equal(await text('#tank-tag'), `TRAPPIST-1 E · SPECIMEN ${String(first.seed).padStart(4, '0')}`);
  assert.equal(await text('#specimen .eyebrow'), 'GROWN FOR TRAPPIST-1 E, 40.7 LIGHT YEARS AWAY');
  assert.equal(await page.locator('#specimen .notes li').count(), 5);
  assert.match(await text('#specimen .notes li:last-child'), /^WHAT WE REALLY KNOW\s+A little smaller than Earth/);
  assert.match(await text('#specimen .notes li:first-child'), /TRAPPIST-1 e is 0\.92 times as wide as Earth and 0\.69 times as heavy/);
  assert.match(await text('#specimen .odds'), /That is if TRAPPIST-1 e is the kind of place its file hopes for/);
  assert.equal(await page.locator('#strip .chip[aria-current="true"]').getAttribute('data-id'), 'M');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the lab scrolls sideways with a real planet’s creature');
  await page.reload();
  await page.waitForFunction(() => window.xeno?.current);
  assert.deepEqual(await grown(), first, 'a reload grew a different creature for TRAPPIST-1 e');
  // Kept, it goes in a jar under the planet's name, and the jar opens the same one after other creatures and a reload.
  await page.click('#keep');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.map(({ at, ...j }) => j)), [{ world: 'TRAPPIST-1 e', seed: first.seed }]);
  assert.equal(await text('#jars .jar-cls'), 'TRAPPIST-1 e');
  // Send this creature shares the planet's link.
  await page.evaluate(() => { navigator.share = async data => { window.shared = data; }; });
  await page.click('#send');
  const shared = await page.evaluate(() => window.shared);
  assert.equal(shared.url, `https://engage.junkdrawer.works/xeno.html#world=TRAPPIST-1%20e-${first.seed}`);
  assert.ok(shared.text.includes('grown for TRAPPIST-1 e in'), shared.text);
  // Grow another stays with the planet; the class's own creature with the same number is a different animal, and
  // isn't the one in the jar.
  await page.click('#again');
  const second = await grown();
  assert.equal(second.world, 'TRAPPIST-1 e');
  assert.notEqual(second.seed, first.seed);
  assert.equal(await text('#keep'), 'KEEP IN A JAR');
  await page.evaluate(n => xeno.show('M', n, false), first.seed);
  assert.equal(await text('#keep'), 'KEEP IN A JAR', 'Class M’s creature was taken for the one kept for TRAPPIST-1 e');
  assert.equal(await page.evaluate(() => xeno.current.world), undefined);
  await page.reload();
  await page.waitForFunction(() => window.xeno?.current);
  assert.equal(await page.locator('#jars .jar').count(), 1, 'the jar for a real planet did not last a reload');
  await page.click('#jars .jar-open');
  assert.deepEqual(await grown(), first, 'the jar opened a different creature');
  assert.equal(await text('#keep'), 'IN A JAR');
  // The shared link, opened cold, and the other planets on the file from the card.
  await page.goto(base + 'xeno.html#M-1');
  await page.goto(shared.url.replace('https://engage.junkdrawer.works/', base));
  await page.waitForFunction(n => window.xeno?.current?.seed === n && !!xeno.current.world, first.seed);
  assert.deepEqual(await grown(), first, 'the shared link grew a different creature');
  await page.locator('#specimen .for-real a', { hasText: 'Proxima b' }).click();
  await page.waitForFunction(() => xeno.current.world?.name === 'Proxima b');
  assert.match(await text('#specimen .notes li:first-child'), /GRAVITY · 1 G, IF IT IS ROCK\s+Proxima b is at least 1\.06 times as heavy as Earth/);
  // A planet the lab has no readings for, or no planet at all, is no link: the lab opens as usual. Class links go on working.
  for (const [hash, want] of [['#world=GJ%201214%20b-5', null], ['#world=Vulcan-5', null], ['#world=proxima%20b-42', 'Proxima b'], ['#M-42', undefined]]) {
    await page.goto(base + 'xeno.html');
    await page.goto(base + 'xeno.html' + hash);
    await page.reload();
    await page.waitForFunction(() => window.xeno?.current);
    const got = await grown();
    if (want === null) assert.deepEqual([got.world, /^#M-\d+$/.test(got.hash)], [undefined, true], `${hash} grew ${JSON.stringify(got)}`);
    else assert.deepEqual([got.world, got.seed], [want, 42], `${hash} grew ${JSON.stringify(got)}`);
  }
  await page.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
}
// The bench: the creature in the tank grown again under four sliders. It opens on the same animal, a slider changes
// what its reading decides and lights that field note, the address keeps the readings, and Grow goes back.
{
  const { benchPos, benchValue } = await import('../js/xeno-gen.js');
  const g25 = benchValue('g', benchPos('g', 2.5)); // 2.5 g, as near as the slider goes
  await page.goto(base + 'maru.html');
  await page.goto(base + 'xeno.html#M-42');
  await page.waitForFunction(() => window.xeno?.current);
  const before = await page.evaluate(() => ({ name: xeno.current.name.common, legs: xeno.current.body.legs, g: xeno.current.env.g }));
  assert.equal(await page.getAttribute('#tab-grow', 'aria-selected'), 'true');
  await page.click('#tab-bench');
  assert.equal(await page.evaluate(() => xeno.mode), 'bench');
  assert.equal(await page.getAttribute('#tab-bench', 'aria-selected'), 'true');
  assert.equal(await shown('#bench-panel'), true);
  assert.equal(await shown('#grow-panel'), false);
  assert.equal(new URL(page.url()).hash, '#bench=M-42&g=1.235&air=1.07&light=red&heat=265.9');
  assert.equal(await text('#specimen h2'), before.name, 'the bench opened on a different animal');
  assert.match(await text('#specimen .eyebrow'), /^ON THE BENCH · FROM CLASS M’S SPECIMEN 0042$/);
  assert.equal(await text('#o-g'), '1.2 g');
  assert.match(await text('#passes'), /^These readings would pass for Class M, the file it was grown for\.$/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the bench scrolls sideways on a phone');
  // More gravity, more legs: at 2.5 g the six-legged walker stands on eight, the gravity note lights up and the
  // legs glow in the tank for a moment.
  await page.locator('#tank').scrollIntoViewIfNeeded();
  await page.locator('#s-g').fill(String(benchPos('g', 2.5)));
  assert.deepEqual(await page.evaluate(() => [xeno.current.body.legs, xeno.current.body.build, xeno.readings.g]), [8, 'squat', g25]);
  assert.equal(await text('#o-g'), '2.5 g');
  assert.match(await text('#specimen .notes li.lit'), /^GRAVITY · 2\.5 G\s+At 2\.5 g it weighs 2\.5 times/);
  assert.equal(await page.locator('#specimen .notes li.lit').count(), 1);
  await page.waitForFunction(() => (xeno.current.body.pulse?.legs || 0) > 0.2);
  await page.waitForFunction(() => !xeno.current.body.pulse?.legs, null, { timeout: 5000 }); // and only for a moment
  assert.match(await text('#passes'), /would pass for a super-Earth\.$/);
  assert.equal(new URL(page.url()).hash, `#bench=M-42&g=${g25}&air=1.07&light=red&heat=265.9`);
  await page.waitForFunction(() => !document.querySelector('#specimen .notes li.lit'), null, { timeout: 5000 });
  // Only gravity moved: the colour and the eyes are the animal's own.
  const lights = await page.evaluate(() => JSON.stringify([xeno.current.body.color, xeno.current.body.eyes]));
  // No star: no eyes, and the light note says why. Thin air: breathing sacs.
  await page.locator('#s-star').fill('0');
  assert.deepEqual(await page.evaluate(() => [xeno.current.body.eyes, xeno.current.env.star]), [0, 'none']);
  assert.match(await text('#specimen .notes li.lit'), /^LIGHT · NONE\s+With no star, the only light is what living things make\./);
  await page.locator('#s-pressure').fill(String(benchPos('pressure', 0.01)));
  assert.equal(await page.evaluate(() => xeno.current.body.sacs), true);
  // A reload, or the link, brings back the same readings; one it can't read is the animal's own.
  const hash = new URL(page.url()).hash;
  await page.reload();
  await page.waitForFunction(() => window.xeno?.current);
  assert.equal(await page.evaluate(() => xeno.mode), 'bench');
  assert.equal(new URL(page.url()).hash, hash);
  assert.deepEqual(await page.evaluate(() => [xeno.current.body.legs, xeno.current.body.eyes, xeno.current.body.sacs]), [8, 0, true]);
  assert.equal(await page.inputValue('#s-g'), String(benchPos('g', g25)));
  // Send these readings shares that link.
  await page.evaluate(() => { navigator.share = async data => { window.shared = data; }; });
  await page.click('#bench-send');
  assert.equal(await page.evaluate(() => window.shared.url), `https://engage.junkdrawer.works/xeno.html${hash}`);
  // Back to its own readings, then Grow: the creature it started from, with its own link.
  await page.click('#bench-reset');
  assert.deepEqual(await page.evaluate(() => [xeno.current.name.common, xeno.current.body.legs, xeno.readings.g]), [before.name, before.legs, before.g]);
  await page.locator('#s-g').fill(String(benchPos('g', 2.5)));
  assert.equal(await page.evaluate(() => JSON.stringify([xeno.current.body.color, xeno.current.body.eyes])), lights);
  await page.click('#tab-grow');
  assert.deepEqual(await page.evaluate(() => [xeno.mode, xeno.current.name.common, xeno.current.body.legs, location.hash]), ['grow', before.name, before.legs, '#M-42']);
  assert.equal(await shown('#grow-panel'), true);
  // The arrow keys move between the tabs; the strip leaves the bench for a new creature.
  await page.focus('#tab-grow');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => [xeno.mode, document.activeElement.id].join()), 'bench,tab-bench');
  await page.getByRole('button', { name: 'Class K: Thin air, needs domes' }).click();
  assert.deepEqual(await page.evaluate(() => [xeno.mode, xeno.current.classId]), ['grow', 'K']);
  for (const [link, want] of [['#bench=M-42&g=junk&light=pink', [1.235, 'red']], ['#bench=world=Proxima%20b-7&g=0.38', [0.38, 'red']]]) {
    await page.goto(base + 'maru.html'); // (a page apart: a long run of address changes in one page is slowed by the browser)
    await page.goto(base + 'xeno.html' + link);
    await page.reload();
    await page.waitForFunction(() => window.xeno?.current);
    assert.deepEqual(await page.evaluate(() => [xeno.mode, Math.round(xeno.readings.g * 1000) / 1000, xeno.readings.star]), ['bench', ...want], link);
  }
  assert.match(await text('#specimen .eyebrow'), /FROM PROXIMA B’S SPECIMEN 0007/);
}
// Side by side: Compare picks two jars and the panel above the shelf shows both, a row for each field note and a
// sentence from the difference. Its link opens the same two for anyone, with no jars at all.
{
  await page.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
  await page.goto(base + 'maru.html');
  await page.goto(base + 'xeno.html#M-42');
  await page.waitForFunction(() => window.xeno?.current);
  for (const [id, seed] of [['M', 42], ['K', 8371], ['O', 5]]) { await page.evaluate(([c, n]) => xeno.show(c, n, false), [id, seed]); await page.click('#keep'); }
  assert.equal(await shown('#compare'), true);
  await page.click('#compare');
  assert.equal(await shown('#compare-hint'), true);
  assert.equal(await page.locator('#jars .jar-drop:visible').count(), 0, 'the let-go buttons stayed while picking two');
  await page.click('#jars .jar:nth-child(2) .jar-open'); // the Class K walker
  assert.equal(await page.getAttribute('#jars .jar:nth-child(2) .jar-open', 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => xeno.current.classId), 'O', 'picking a jar opened it in the tank');
  await page.click('#jars .jar:nth-child(3) .jar-open'); // the Class M walker
  assert.equal(await shown('#pair'), true);
  assert.equal(await shown('#compare-hint'), false);
  assert.equal(new URL(page.url()).hash, '#pair=K-8371&M-42');
  assert.deepEqual(await page.locator('#pair-table th').allInnerTexts(), ['GRAVITY', 'AIR', 'LIGHT', 'HEAT']);
  assert.deepEqual(await page.locator('#pair-table tr:nth-child(2) td').allInnerTexts(), ['0.017 atm', '1.1 atm']);
  assert.equal(await text('#pair-why'), 'Air: 0.017 atm against 1.1 atm. That is why one breathes through sacs along its back and the other breathes much as we do.');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the pair scrolls sideways on a phone');
  // Each picture grows its creature in the tank; the pair stays.
  await page.click('#pair-pics [data-pair="0"]');
  assert.deepEqual(await page.evaluate(() => [xeno.current.classId, xeno.current.seed]), ['K', 8371]);
  assert.equal(await shown('#pair'), true);
  await page.evaluate(() => { navigator.share = async data => { window.shared = data; }; });
  await page.click('#pair-send');
  const link = await page.evaluate(() => window.shared.url);
  assert.equal(link, 'https://engage.junkdrawer.works/xeno.html#pair=K-8371&M-42');
  await page.click('#pair-close');
  assert.equal(await shown('#pair'), false);
  assert.equal(new URL(page.url()).hash, '#K-8371');
  // The link, opened with no jars: the first creature in the tank and the two side by side. A creature for a real
  // planet pairs too; a link short of a number names nothing.
  await page.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
  for (const [hash, want] of [[link.split('#')[1], ['K', 8371, 'M-42']], ['pair=world=Proxima%20b-7&lava-world-7', ['M', 7, 'lava-world-7']]]) {
    await page.goto(base + 'maru.html'); // (a page apart: a long run of address changes in one page is slowed by the browser)
    await page.goto(base + 'xeno.html#' + hash);
    await page.reload();
    await page.waitForFunction(() => window.xeno?.current);
    assert.equal(await shown('#pair'), true, hash);
    assert.equal(await page.locator('#jars .jar').count(), 0);
    assert.deepEqual(await page.evaluate(() => [xeno.current.classId, xeno.current.seed, xeno.pair[1].world ? '' : `${xeno.pair[1].id}-${xeno.pair[1].seed}`]), want, hash);
  }
  assert.match(await text('#pair-pics'), /Proxima b/);
  await page.goto(base + 'maru.html');
  await page.goto(base + 'xeno.html#pair=M-42&K');
  await page.waitForFunction(() => window.xeno?.current);
  assert.deepEqual([await shown('#pair'), await shown('#link-note')], [false, true]);
}
// Names on the jars: tapping a jar's name gives it one of yours, kept above its own on the shelf and on its card.
{
  await page.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
  await page.goto(base + 'maru.html');
  await page.goto(base + 'xeno.html#M-42');
  await page.waitForFunction(() => window.xeno?.current);
  await page.click('#keep');
  const own = await text('#specimen h2');
  assert.match(await page.getAttribute('#jars .jar-title', 'aria-label'), /^Give the .+ a name$/);
  assert.ok(await page.locator('#jars .jar-title').evaluate(el => el.getBoundingClientRect().height) >= 44, 'the jar’s name is under 44 px tall');
  await page.click('#jars .jar-title');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'jar-field');
  await page.keyboard.type('  Biscuit  ');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.map(j => j.name)), ['Biscuit']);
  assert.deepEqual(await page.locator('#jars .jar-title span').allInnerTexts(), ['Biscuit', own]);
  assert.equal(await text('#specimen .own-name'), 'Biscuit');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'jar-title', 'the name lost its place for the keyboard');
  await page.reload();
  await page.waitForFunction(() => window.xeno?.current);
  assert.equal(await text('#jars .jar-own'), 'Biscuit', 'the name did not last a reload');
  assert.equal(await text('#specimen .own-name'), 'Biscuit');
  // Escape leaves it as it was; a long name is cut to 24 letters; an empty one takes the name away.
  await page.click('#jars .jar-title');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Something else');
  await page.keyboard.press('Escape');
  assert.equal(await text('#jars .jar-own'), 'Biscuit');
  await page.click('#jars .jar-title');
  await page.fill('#jars .jar-field', 'The Very Honourable Biscuit the Third');
  await page.keyboard.press('Enter');
  assert.equal(await text('#jars .jar-own'), 'The Very Honourable Bisc');
  await page.click('#jars .jar-title');
  await page.fill('#jars .jar-field', '   ');
  await page.click('#specimen h2'); // leaving the field keeps what it holds
  assert.equal(await page.locator('#jars .jar-own').count(), 0);
  assert.equal(await page.locator('#specimen .own-name').count(), 0);
  assert.deepEqual(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('engage.xeno.v1')).jars[0]).sort()), ['at', 'id', 'seed']);
  // A named jar let go says so by its name.
  await page.click('#jars .jar-title');
  await page.fill('#jars .jar-field', 'Biscuit');
  await page.keyboard.press('Enter');
  await page.click('#jars .jar-drop');
  assert.match(await text('#jar-undo'), /^Let Biscuit go\.\s+Undo$/);
  await page.click('#jar-undo-go');
  assert.equal(await text('#jars .jar-own'), 'Biscuit');
  // A name that isn't text, from a copy or another version, is dropped and the jar kept.
  await page.evaluate(() => localStorage.setItem('engage.xeno.v1', JSON.stringify({ jars: [{ id: 'M', seed: 42, name: 7 }, { id: 'K', seed: 3, name: ' Rex ' }] })));
  await page.reload();
  await page.waitForFunction(() => window.xeno?.current);
  assert.deepEqual(await page.evaluate(() => xeno.jars.map(j => j.name ?? null)), [null, 'Rex']);
  await page.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
}
// Save a picture: the creature card, 1080 × 1620, handed to the share sheet with the creature's link, or downloaded
// where a browser can't share a file. A jar's name is on it.
{
  await page.goto(base + 'maru.html');
  await page.goto(base + 'xeno.html#K-8371');
  await page.waitForFunction(() => window.xeno?.current);
  await page.evaluate(() => {
    navigator.canShare = data => !!data.files?.length;
    navigator.share = async data => {
      const f = data.files[0], bmp = await createImageBitmap(f);
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      const seen = new Set(), d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      window.shot = { name: f.name, type: f.type, size: [bmp.width, bmp.height], colours: seen.size, text: data.text, url: data.url };
    };
  });
  await page.click('#picture');
  await page.waitForFunction(() => window.shot);
  const pic = await page.evaluate(() => window.shot);
  assert.deepEqual([pic.name, pic.type, pic.size, pic.text, pic.url], ['whip-tailed-rust-plain-stalker.png', 'image/png', [1080, 1620], 'https://engage.junkdrawer.works/xeno.html#K-8371', undefined]);
  assert.ok(pic.colours > 60, `the picture is nearly blank: ${pic.colours} colours`);
  assert.equal(await page.isDisabled('#picture'), false);
  // Kept and named, the file takes the name; closing the share sheet downloads nothing.
  await page.click('#keep');
  await page.click('#jars .jar-title');
  await page.fill('#jars .jar-field', 'Biscuit');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { window.shot = null; });
  await page.click('#picture');
  await page.waitForFunction(() => window.shot);
  assert.equal(await page.evaluate(() => window.shot.name), 'biscuit.png');
  let downloaded = false;
  page.once('download', () => { downloaded = true; });
  await page.evaluate(() => { navigator.share = async () => { window.cancelled = true; throw new DOMException('closed', 'AbortError'); }; });
  await page.click('#picture');
  await page.waitForFunction(() => window.cancelled);
  await page.waitForTimeout(300);
  assert.equal(downloaded, false, 'closing the share sheet downloaded the picture');
  // With no way to share a file, it downloads.
  await page.evaluate(() => { navigator.canShare = undefined; });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#picture')]);
  assert.equal(download.suggestedFilename(), 'biscuit.png');
  await page.evaluate(() => localStorage.removeItem('engage.xeno.v1'));
}
// Grow its neighbours: what it eats and what eats it, drawn in the tank beside it, with two more notes. A plant has
// none to grow; a new creature starts without them.
{
  await page.goto(base + 'maru.html');
  await page.goto(base + 'xeno.html#J-9258');
  await page.waitForFunction(() => window.xeno?.current);
  await page.locator('#tank').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600); // it grows in
  assert.equal(await page.locator('#specimen .notes').count(), 1);
  assert.equal(await text('#kin'), 'Grow its neighbours');
  await page.click('#kin');
  assert.equal(await page.getAttribute('#kin', 'aria-pressed'), 'true');
  assert.equal(await text('#kin'), 'Hide its neighbours');
  assert.deepEqual(await page.locator('#specimen .notes.kin h3').allInnerTexts().then(l => l.map(t => t.replace(/ · .*/, ''))), ['WHAT IT EATS', 'WHAT EATS IT']);
  assert.match(await text('#specimen .notes.kin li:first-child p'), /A sinker, one of the three kinds of life Carl Sagan and Edwin Salpeter imagined/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'kin');
  // Drawn: the hunter swims off to the lower left, where the tank had only cloud.
  const at = () => page.evaluate(() => { const c = document.getElementById('tank'), d = c.getContext('2d').getImageData(Math.round(c.width * 0.12), Math.round(c.height * 0.76), Math.round(c.width * 0.1), Math.round(c.height * 0.08)).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`); return s.size; });
  await page.locator('#tank').scrollIntoViewIfNeeded(); // (the tank isn't drawn while it is out of sight)
  await page.waitForTimeout(200);
  const withKin = await at();
  await page.click('#kin');
  assert.equal(await page.locator('#specimen .notes.kin').count(), 0);
  await page.locator('#tank').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const without = await at();
  assert.ok(withKin > without + 10, `the hunter is not drawn in the tank: ${withKin} colours with it, ${without} without`);
  await page.click('#kin');
  await page.click('#again');
  assert.equal(await page.locator('#specimen .notes.kin').count(), 0, 'a new creature came with the last one’s neighbours');
  assert.equal(await page.evaluate(() => !!xeno.current.kin), false);
  await page.getByRole('button', { name: 'Class L: Forested, no animals' }).click();
  assert.equal(await page.locator('#kin').count(), 0, 'a plant offered to grow its neighbours');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}
await page.goto(base);
await bridgeReady();

// First contact: reached from the bridge, phrases tapped from the notebook and guessed at, a misunderstanding, the
// encounter carried through to the end, the debrief, and the record on the briefing.
await Promise.all([page.waitForNavigation(), page.click('#open-contact')]);
await page.waitForFunction(() => window.contact);
await page.click('#start');
const settled = () => page.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
await settled();
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'first contact scrolls sideways on a phone');
assert.equal(await page.locator('#book li').count(), 2, 'the notebook does not hold their first two phrases');
// The notebook under a thumb: each phrase, the button a reply is built with, is 44 px tall, and its list of meanings
// is in 16 px type (Safari on an iPhone zooms the page in on a smaller one, and stays zoomed).
for (const row of await page.locator('#book li').all()) {
  assert.ok((await row.locator('.ph-add').boundingBox()).height >= 44, 'a notebook phrase is under 44 px tall');
  assert.ok(await row.locator('select').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16 && el.getBoundingClientRect().height >= 40), 'a notebook list is in small type');
}
assert.ok(await page.locator('#send').isDisabled(), 'an empty reply can be sent');
await page.locator('#book select').first().selectOption('meet');
assert.match(await text('#comms'), /Hello, meeting\?/, 'the guess does not show on the channel');
await page.locator('#book .ph-add').nth(1).click(); // "we" makes no sense as a reply to hello
await page.click('#send');
await settled();
assert.equal(await page.locator('#patience i.gone').count(), 1, 'a misunderstanding cost no patience');
assert.equal(await page.evaluate(() => contact.game.misses), 1);
await page.locator('#book .ph-add').first().click();
assert.equal(await page.locator('#reply li').count(), 1);
await page.click('#send');
await settled();
assert.equal(await page.evaluate(() => contact.game.beat), 1, 'saying hello back did not move it on');
// On a phone the reply and Send stay at the foot of the screen while it lasts, with their latest words above them:
// scrolled to the end of the notebook, a phrase can be tapped and sent without scrolling back up.
{
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const last = page.locator('#book .ph-add:not([aria-disabled])').last();
  await last.click();
  const at = await page.evaluate(() => {
    const send = document.getElementById('send').getBoundingClientRect(), dock = document.getElementById('dock');
    const foot = document.querySelector('.jd-foot').getBoundingClientRect();
    return { fixed: getComputedStyle(dock).position, inView: send.top >= 0 && send.bottom <= innerHeight, footClear: foot.bottom - parseFloat(getComputedStyle(document.querySelector('.jd-foot')).paddingBottom) <= dock.getBoundingClientRect().top + 1, said: document.getElementById('dock-said').textContent, chips: document.querySelectorAll('#reply li').length };
  });
  const words = await page.evaluate(() => contact.game.log.filter(l => l.who === 'them').at(-1).ids.map(id => `“${contact.game.lang.phrases[id]}”`).join(' '));
  assert.deepEqual(at, { fixed: 'fixed', inView: true, footClear: true, said: words, chips: 1 }, 'the reply is not kept at the foot of a phone screen');
  await page.click('#reply button[data-i="0"]');
  // On a wide screen it stays in the page, beside the viewscreen.
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('dock')).position), 'static');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(n => window.contact.draws > n + 2, await page.evaluate(() => window.contact.draws));
}
const screenLit = await page.evaluate(() => {
  const c = document.getElementById('screen'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set(); for (let i = 0; i < d.length; i += 40) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
  return seen.size;
});
assert.ok(screenLit > 40, 'the viewscreen is not drawn');
for (let n = 0; n < 20 && !(await page.evaluate(() => contact.game.over)); n++) {
  await page.evaluate(() => { contact.pick(contact.hint()); contact.send(); });
  await settled();
}
assert.equal(await page.evaluate(() => contact.game.over), 'contact');
assert.equal(await text('#send'), 'READ THE DEBRIEF');
assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('dock')).position), 'static', 'the bar stayed at the foot after it ended');
await page.click('#send');
assert.equal(await text('#eval-title'), 'First contact');
assert.match(await text('#eval-score'), /^1\/1[0-9]/, 'the one right guess is not counted');
assert.ok(await shown('#eval-story'), 'their new phrase is missing');
// How rare the ending is, from the archive of encounters answered at random.
assert.match(await text('#eval-archive'), /^EXAMINERS’ ARCHIVE\s+About 1 in 2\d ends this way, of 40,000 encounters answered with phrases picked at random\.$/);
// Share this encounter: a line and a link that plays it back for a friend, guesses and all, to their debrief, with
// nothing put on the friend's record; then they can answer the same hail, in the same language.
{
  await page.evaluate(() => { delete Navigator.prototype.share; });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#share-run');
  const [line, url] = (await page.evaluate(() => navigator.clipboard.readText())).split('\n');
  assert.match(line, /^First contact: First contact, 1 of 1\d phrases decoded$/);
  assert.match(url, /^https:\/\/engage\.junkdrawer\.works\/contact\.html#run=1\.[0-9a-z]+\.[a-z~-]+\.[a-m]{2}$/);
  const friend = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const q = await friend.newPage();
  q.on('pageerror', e => problems.push(e.message));
  await q.goto(url.replace('https://engage.junkdrawer.works/', base));
  await q.waitForFunction(() => window.contact?.watching);
  assert.equal(await q.locator('.reply').isHidden(), true, 'the reply is offered while a shared encounter plays back');
  await q.waitForFunction(() => /They answered/.test(document.getElementById('watching-text').textContent), null, { timeout: 20000 });
  await q.click('#skip');
  await q.waitForFunction(() => !document.getElementById('eval').hidden, null, { timeout: 20000 });
  assert.equal(await q.locator('#eval-title').innerText(), 'First contact');
  assert.equal(await q.locator('#eval-eyebrow').innerText(), 'A SHARED ENCOUNTER · DEBRIEF');
  assert.match(await q.locator('#eval-score').innerText(), /^1\/1\d/);
  assert.equal(await q.evaluate(() => localStorage.getItem('engage.contact.v1')), null, 'a shared encounter went on the friend’s record');
  const seed = await q.evaluate(() => contact.game.seed);
  await q.click('#again');
  assert.deepEqual(await q.evaluate(() => [contact.game.seed, contact.game.turn, location.hash, !!contact.watching]), [seed, 0, '', false]);
  await friend.close();
}
await page.click('#again');
// The record on the briefing: one species met, one contact made, and the notebook as it really did, so a contact made
// with one phrase decoded doesn't read as a full success.
assert.match(await text('#runs'), /1 of 1[0-9] phrases decoded · Lost in translation/);
assert.match((await text('#tally')).replace(/\s+/g, ' '), /^1 SPECIES MET 1 CONTACT MADE 1\/1[0-9] BEST NOTEBOOK LOST IN TRANSLATION$/);
// Breaking off from the next ship is a second species met, and no second contact.
await page.click('#start');
await settled();
// While it lasts, the four buttons under the reply are live (back again, after the encounter before this one ended);
// a button that is switched off looks it.
assert.deepEqual(await page.locator('.acts button').evaluateAll(els => els.map(el => [el.getClientRects().length > 0, el.disabled])), Array(4).fill([true, false]));
assert.deepEqual(await page.evaluate(() => { const b = document.getElementById('listen'); b.disabled = true; const { opacity, cursor } = getComputedStyle(b); b.disabled = false; return [opacity, cursor]; }), ['0.4', 'default']);
await page.click('#leave');
await settled();
// Once it's over, all that is left to press is Read the debrief: the reply, Listen again, Speak Standard, Raise
// shields and Break off are gone (they used to stay, switched off but looking exactly as live as before), and the
// notebook no longer says "Say it" beside each phrase.
assert.deepEqual(await page.locator('#sim .reply button').evaluateAll(els => els.filter(el => el.getClientRects().length).map(el => el.textContent.trim())), ['Read the debrief']);
assert.deepEqual(await page.locator('#sim .reply .reply-head, #sim #reply, #sim .acts').evaluateAll(els => els.map(el => el.getClientRects().length)), [0, 0, 0]);
assert.deepEqual(await page.locator('#book .plus').evaluateAll(els => [...new Set(els.map(el => el.textContent))]), ['']);
assert.equal(await page.evaluate(() => document.activeElement.id), 'send', 'the keyboard’s place went with the buttons');
await page.click('#send');
await page.click('#again');
assert.match((await text('#tally')).replace(/\s+/g, ' '), /^2 SPECIES MET 1 CONTACT MADE 1\/1[0-9] BEST NOTEBOOK LOST IN TRANSLATION$/);
assert.deepEqual(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.contact.v1')); return [s.runs.length, s.met, s.contacts, s.best.decoded]; }), [2, 2, 1, 1]);
await page.reload();
await page.waitForFunction(() => window.contact);
assert.equal(await page.locator('#runs li').count(), 2, 'the record was not kept');
for (const when of await page.locator('#runs .when').allInnerTexts()) assert.match(when, /^\d{1,2} [A-Z][a-z]{2}$/, `an encounter is dated “${when}”`);
await page.goto(base);
await bridgeReady();

// First contact happens where the ship is. Holding at Vega, the briefing says the ship has dropped out of warp "here
// at Vega"; the contact made there goes on the record with the star and the stay, and the bridge's log tells it on that
// stay's entry (and not on a later visit to Vega), as tonight's card for Vega does. The debrief offers what might
// live on their world, in the lab. With no save at all the ship is in Earth orbit, where the bridge starts.
{
  const where = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await where.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  assert.equal(await p.locator('#brief-where').innerText(), 'A ship of no known design has dropped out of warp off your bow, in Earth orbit, and she’s hailing you.');
  await p.goto(base);
  await bridgeReady(p);
  await p.click('#intro-go');
  await p.evaluate(() => { engage.jump('Vega'); engage.closeSheets(); });
  const stay = await p.evaluate(() => ({ ...engage.state.log[0], star: engage.state.at }));
  await Promise.all([p.waitForNavigation(), p.click('#open-contact')]);
  await p.waitForFunction(() => window.contact);
  assert.equal(await p.locator('#brief-where').innerText(), `A ship of no known design has dropped out of warp off your bow, here at ${stay.title}, and she’s hailing you.`);
  await p.click('#start');
  await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  // The ship taken home in another tab while the hail is answered doesn't move the encounter: it is where it began.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.v1')); localStorage.setItem('engage.v1', JSON.stringify({ ...s, at: 0 })); });
  for (let n = 0; n < 20 && !(await p.evaluate(() => contact.game.over)); n++) {
    await p.evaluate(() => { contact.pick(contact.hint()); contact.send(); });
    await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  }
  const people = await p.evaluate(() => contact.game.lang.people);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.contact.v1')));
  const run = kept.runs.at(-1);
  assert.deepEqual([run.outcome, run.star, run.place, run.visit], ['contact', stay.star, stay.title, stay.id]);
  assert.match(run.sd, /^\d{4}\.\d{3}$/);
  assert.deepEqual(kept.friends.map(f => [f.people, f.star, f.place, f.visit, f.sd, f.seed]), [[people, stay.star, stay.title, stay.id, run.sd, run.seed]]);
  await p.click('#send');
  assert.equal(await p.locator('#to-lab').isVisible(), true, 'the debrief has no way to the lab');
  assert.match(await p.locator('#to-lab').getAttribute('href'), /^xeno\.html#M-\d{1,4}$/);
  await p.click('#again');
  assert.match(await p.locator('#runs li').first().innerText(), new RegExp(`The ${people} · at ${stay.title} · `));
  const line = `First contact was made here with the ${people}, stardate ${run.sd}.`;
  // The bridge's log, on the entry for that stay.
  await p.goto(base);
  await bridgeReady(p);
  await p.click('#open-log');
  await p.locator('.past summary').nth(0).click();
  assert.equal(await p.locator('.past').nth(0).locator('.contact-made').innerText(), line);
  // Tonight's card for Vega.
  await p.goto(base + 'tonight.html#star=Vega');
  await p.waitForFunction(() => window.tonight);
  await p.waitForFunction(() => !document.getElementById('card').hidden);
  assert.ok((await p.locator('#card-been').innerText()).endsWith(line), 'tonight’s card for Vega does not say first contact was made there');
  // Away and back to Vega: the new stay's entry says nothing of it, the old one still does, and the card still does.
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => { for (const name of ['Altair', 'Vega']) { engage.jump(name); engage.closeSheets(); } });
  await p.click('#open-log');
  await p.locator('.past summary').nth(0).click();
  await p.locator('.past summary').nth(2).click();
  assert.deepEqual(await p.locator('.past').evaluateAll(els => els.map(el => el.querySelectorAll('.contact-made').length)), [0, 0, 1]);
  await where.close();
}

// Second contact: a people you made contact with hails again from the briefing, in the same language, with the
// notebook from the first time open, and six new moments to answer. It goes on the record as an encounter, not a
// species met, and the friend doesn't hail again. A reload part-way keeps the carried notebook. Shared, it plays
// back for a friend, who can then answer the same people's first hail.
{
  const twice = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await twice.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const settle = () => p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  assert.equal(await p.locator('#friend').isHidden(), true, 'a friend hails before any contact is made');
  await p.evaluate(() => contact.start(5));
  await settle();
  await p.evaluate(() => contact.tag('meet', 'meet'));
  while (!(await p.evaluate(() => contact.game.over))) { await p.evaluate(() => { contact.say(); contact.send(); }); await settle(); }
  const people = await p.evaluate(() => contact.game.lang.people);
  await p.click('#send');
  await p.click('#again');
  assert.equal(await p.locator('#friend-title').innerText(), `The ${people} are hailing again`);
  assert.equal(await p.locator('#friend-text').innerText(), 'You made first contact with them in Earth orbit, stardate ' + (await p.evaluate(() => JSON.parse(localStorage.getItem('engage.contact.v1')).friends[0].sd)) + ', and your notebook from that day is open. This time something is wrong with their ship.');
  await p.click('#friend-start');
  await settle();
  assert.deepEqual(await p.evaluate(() => [contact.game.second, contact.game.seed]), [true, 5]);
  assert.equal(await p.locator('#who-tag').innerText(), `THE ${people.toUpperCase()}`);
  // The notebook is open at once: every phrase from the first time, with its guess.
  const carried = await p.evaluate(() => contact.game.carried.filter(id => id !== 'story').length);
  assert.ok(await p.locator('#book li').count() >= carried, 'the notebook from the first time is not open');
  assert.equal(await p.locator('#book li[data-id="meet"] select').inputValue(), 'meet', 'the guesses from the first time were not carried in');
  assert.ok((await p.locator('#book .ph-n').allInnerTexts()).includes('from before'));
  // Asked to put it another way, they do; then the first moment is answered.
  await p.evaluate(() => { contact.act('listen'); });
  await settle();
  await p.evaluate(() => { contact.say(); contact.send(); });
  await settle();
  // Reloaded part-way: the same encounter, the notebook from before still in it.
  await p.reload();
  await p.waitForFunction(() => window.contact);
  assert.equal(await p.locator('#friend').isHidden(), true, 'the friend hails again while their hail is left to resume');
  await p.click('#resume');
  assert.deepEqual(await p.evaluate(() => [contact.game.second, contact.game.beat]), [true, 1]);
  assert.equal(await p.locator('#book li[data-id="meet"] select').inputValue(), 'meet');
  while (!(await p.evaluate(() => contact.game.over))) { await p.evaluate(() => { contact.say(); contact.send(); }); await settle(); }
  assert.equal(await p.evaluate(() => contact.game.over), 'friends');
  // Friends made: their captain stays on the viewscreen, as after a first contact, and the channel isn't closed.
  assert.match(await p.locator('#screen').getAttribute('aria-label'), /^Viewscreen: their captain/, 'second contact made shows the channel closed');
  await p.click('#send');
  assert.equal(await p.locator('#eval-title').innerText(), 'Second contact');
  assert.equal(await p.locator('#eval-eyebrow').innerText(), 'SECOND CONTACT · DEBRIEF');
  assert.equal(await p.locator('#eval-firsts').textContent(), 'Second contact made: 1');
  assert.equal(await p.locator('#eval-archive').isHidden(), true, 'a second contact was set against the archive of first contacts');
  assert.equal(await p.locator('#to-lab').isVisible(), true);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.contact.v1')));
  assert.deepEqual([kept.met, kept.contacts, kept.runs.length, kept.runs[1].second, kept.runs[1].title, kept.friends[0].again.outcome], [1, 1, 2, true, 'Second contact', 'friends']);
  // Shared: "2." and what was carried in, played back for a friend, who is offered the same people's first hail.
  await p.evaluate(() => { delete Navigator.prototype.share; });
  await twice.grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('#share-run');
  const [line, url] = (await p.evaluate(() => navigator.clipboard.readText())).split('\n');
  assert.match(line, /^Second contact: Second contact, \d+ of \d+ phrases decoded$/);
  assert.match(url, /^https:\/\/engage\.junkdrawer\.works\/contact\.html#run=2\.5\.[a-m]+\.[a-z~-]+\.[a-m]*$/);
  await p.click('#again');
  assert.equal(await p.locator('#friend').isHidden(), true, 'a friend hailed again after second contact');
  assert.match(await p.locator('#runs li').first().innerText(), /^Second contact/);
  assert.match((await p.locator('#tally').innerText()).replace(/\s+/g, ' '), /^1 SPECIES MET 1 CONTACT MADE/);
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const r = await other.newPage();
  r.on('pageerror', e => problems.push(e.message));
  await r.goto(url.replace('https://engage.junkdrawer.works/', base));
  await r.waitForFunction(() => window.contact?.watching);
  assert.equal(await r.evaluate(() => contact.game.second), true);
  await r.click('#skip');
  await r.waitForFunction(() => !document.getElementById('eval').hidden, null, { timeout: 20000 });
  assert.equal(await r.locator('#eval-title').innerText(), 'Second contact');
  assert.equal(await r.locator('#again').innerText(), 'ANSWER THEIR FIRST HAIL YOURSELF');
  await r.click('#again');
  assert.deepEqual(await r.evaluate(() => [contact.game.seed, !!contact.game.second, contact.game.turn]), [5, false, 0]);
  await other.close();
  // The record keeps where the second contact was made: in Earth orbit, with no save from the bridge.
  assert.equal(kept.friends[0].again.star, 0);
  await twice.close();
}

// Today's hail: the same ship for every officer that day, once. Afterwards the briefing keeps the line to send, and
// Share sends it with a link that plays the encounter back, notebook and all, so two officers can compare notebooks.
{
  const day = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await day.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const settle = () => p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  const { dailySeed } = await import('../js/contact-sim.js');
  const date = await p.evaluate(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; });
  assert.equal(await p.locator('#daily-note').innerText(), 'The same ship and the same language for every officer today.');
  await p.click('#daily-start');
  await settle();
  assert.equal(await p.evaluate(() => contact.game.seed), dailySeed(date));
  await p.evaluate(() => contact.tag('meet', 'meet'));
  // A reload part-way keeps it today's.
  await p.evaluate(() => { contact.pick(contact.hint()); contact.send(); });
  await settle();
  await p.reload();
  await p.waitForFunction(() => window.contact);
  assert.equal(await p.locator('#daily-note').innerText(), 'Today’s hail is the one left to resume.');
  assert.equal(await p.locator('#daily-start').isHidden(), true);
  await p.click('#resume');
  while (!(await p.evaluate(() => contact.game.over))) { await p.evaluate(() => { contact.pick(contact.hint()); contact.send(); }); await settle(); }
  await p.click('#send');
  assert.equal(await p.locator('#eval-eyebrow').innerText(), 'TODAY’S HAIL · DEBRIEF');
  await p.click('#again');
  const people = await p.evaluate(() => contact.game.lang.people);
  assert.equal(await p.locator('#daily-start').isHidden(), true, 'today’s hail can be answered twice');
  assert.match((await p.locator('#daily-note').innerText()).replace(/\s+/g, ' '), new RegExp(`^TODAY’S HAIL The ${people}\\. First contact, \\d+ of \\d+ phrases decoded$`));
  await p.evaluate(() => { delete Navigator.prototype.share; });
  await day.grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('#daily-share');
  const [line, url] = (await p.evaluate(() => navigator.clipboard.readText())).split('\n');
  assert.match(line, new RegExp(`^First contact, \\d{1,2} [A-Z][a-z]{2}: the ${people}\\. First contact, \\d+ of \\d+ phrases decoded$`));
  assert.match(url, /^https:\/\/engage\.junkdrawer\.works\/contact\.html#run=1\.[0-9a-z]+\.[a-z~-]+\.aa$/);
  // Another officer opens it: played back with the notebook, then the same hail, still today's.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const q = await other.newPage();
  q.on('pageerror', e => problems.push(e.message));
  await q.goto(url.replace('https://engage.junkdrawer.works/', base));
  await q.waitForFunction(() => window.contact?.watching);
  await q.click('#skip');
  await q.waitForFunction(() => !document.getElementById('eval').hidden, null, { timeout: 20000 });
  await q.click('#again');
  await q.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await q.evaluate(() => contact.act('leave'));
  await q.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  assert.equal(await q.evaluate(() => JSON.parse(localStorage.getItem('engage.contact.v1')).daily.date), date, 'the shared hail was not today’s for the friend');
  await other.close();
  await day.close();
}

// The linguist's challenges: five named hails on the briefing, each marked done once contact is made, with its best
// notebook, and each with a link to send (contact.html#hail=…) that opens on that hail for whoever has it.
{
  const hard = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await hard.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const settle = () => p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  const { CHALLENGES, makeLanguage } = await import('../js/contact-sim.js');
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  const peoples = CHALLENGES.map(seed => makeLanguage(seed).people);
  assert.deepEqual(await p.locator('#challenges li b').allInnerTexts(), peoples.map(n => `The ${n}`));
  assert.deepEqual([...new Set(await p.locator('#challenges .state').allInnerTexts())], ['Not answered yet']);
  // Tried and broken off: tried, with the notebook. Then made: done, with the best notebook kept.
  await p.locator('#challenges [data-challenge]').nth(1).click();
  await settle();
  assert.equal(await p.evaluate(() => contact.game.seed), CHALLENGES[1]);
  await p.evaluate(() => contact.act('leave'));
  await settle();
  await p.click('#send');
  await p.click('#again');
  assert.equal(await p.locator('#challenges .state').nth(1).innerText(), 'Tried · best notebook 0/2');
  await p.locator('#challenges [data-challenge]').nth(1).click();
  await settle();
  await p.evaluate(() => { contact.tag('meet', 'meet'); contact.tag('we', 'we'); });
  while (!(await p.evaluate(() => contact.game.over))) { await p.evaluate(() => { contact.pick(contact.hint()); contact.send(); }); await settle(); }
  await p.click('#send');
  await p.click('#again');
  assert.match(await p.locator('#challenges .state').nth(1).innerText(), /^Contact made · best notebook 2\/1\d, Lost in translation$/);
  assert.equal(await p.locator('#challenges li').nth(1).getAttribute('class'), 'done');
  // Answered and made again: the same people are still one friend, who hails again once, not twice.
  await p.locator('#challenges [data-challenge]').nth(1).click();
  await settle();
  while (!(await p.evaluate(() => contact.game.over))) { await p.evaluate(() => { contact.pick(contact.hint()); contact.send(); }); await settle(); }
  await p.click('#send');
  await p.click('#again');
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.contact.v1')).friends.map(f => f.seed)), [CHALLENGES[1]], 'a challenge made twice was kept as two friends');
  // Answered three times, contact made twice: on the record that is one species met and one contact made, though
  // every attempt is in the list of encounters.
  assert.match((await p.locator('#tally').innerText()).replace(/\s+/g, ' '), /^1 SPECIES MET 1 CONTACT MADE /);
  assert.equal(await p.locator('#runs li').count(), 3);
  assert.equal(await p.locator('#friend-more').isHidden(), true);
  // Send: the hail as a link.
  await p.evaluate(() => { delete Navigator.prototype.share; });
  await hard.grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.locator('#challenges [data-send]').nth(3).click();
  const url = await p.evaluate(() => navigator.clipboard.readText());
  assert.equal(url, `https://engage.junkdrawer.works/contact.html#hail=${CHALLENGES[3].toString(36)}`);
  // Opened by a friend: the briefing says what was sent, and Answer the hail answers it.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const q = await other.newPage();
  q.on('pageerror', e => problems.push(e.message));
  await q.goto(url.replace('https://engage.junkdrawer.works/', base));
  await q.waitForFunction(() => window.contact);
  assert.equal(await q.locator('#hail-note').innerText(), `A linguist’s challenge, sent to you: the ${peoples[3]}, one of the five hardest languages on file.`);
  assert.equal(await q.locator('#start').innerText(), `ANSWER THE ${peoples[3].toUpperCase()}`);
  await q.click('#start');
  await q.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  assert.deepEqual(await q.evaluate(() => [contact.game.seed, location.hash]), [CHALLENGES[3], '']);
  await q.evaluate(() => contact.act('leave'));
  await q.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await q.click('#send');
  await q.click('#again');
  assert.equal(await q.locator('#hail-note').isHidden(), true);
  assert.equal(await q.locator('#start').innerText(), 'ANSWER THE HAIL');
  assert.equal(await q.locator('#challenges .state').nth(3).innerText(), 'Tried · best notebook 0/2');
  // A link that isn't a hail is no hail.
  await q.goto(base + 'contact.html#hail=!!');
  await q.waitForFunction(() => window.contact);
  assert.equal(await q.locator('#hail-note').isHidden(), true);
  await other.close();
  await hard.close();
}

// The warp scale: reached from under the warp slider with the helm's warp factor, a race to the galactic core run to
// the end, another place picked from the ladder, and a link back to the bridge with a course set. (With a star chosen
// at the helm the link races there instead: see "Doors between rooms" below.)
await page.evaluate(() => { engage.target(''); const w = document.getElementById('warp'); w.value = 7.5; w.dispatchEvent(new Event('input')); });
await Promise.all([page.waitForNavigation(), page.click('#open-scale')]);
await page.waitForFunction(() => window.warpScale);
assert.equal(await page.inputValue('#custom-warp'), '7.5', 'the bridge’s warp factor did not come along');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the warp scale scrolls sideways on a phone');
assert.equal(await page.evaluate(() => warpScale.place), 'core');
assert.match(await text('#place'), /3 years 11 months/, 'warp 9.975 to the galactic core is not about four years');
await page.click('#go');
assert.equal(await text('#go'), 'SKIP AHEAD');
await page.waitForFunction(() => document.querySelectorAll('#times tr.there').length >= 1, null, { timeout: 10000 });
const raceLit = await page.evaluate(() => {
  const c = document.getElementById('race'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set(); for (let i = 0; i < d.length; i += 40) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
  return seen.size;
});
assert.ok(raceLit > 30, 'the race is not drawn');
await page.waitForFunction(() => warpScale.done, null, { timeout: 20000 });
assert.equal(await page.locator('#times tr.there').count(), 5, 'not every ship got there');
assert.match(await text('#race-note'), /Voyager 1 would take/);
await page.locator('.rung[data-id="vulcan"]').click();
assert.equal(await page.evaluate(() => [warpScale.place, warpScale.running, warpScale.done].join()), 'vulcan,false,false');
assert.match(page.url(), /#vulcan$/);
await page.click('#go');
await page.click('#go'); // skip ahead
assert.equal(await page.evaluate(() => warpScale.done), true, 'skip ahead did not finish the race');
// The bottom lane's real ship can be another: Parker Solar Probe at her fastest, with her honest line on the card and
// her name in the race, the address and the race's ending. Kirk's scale is on the card beside the race.
assert.equal(await page.inputValue('#real-ship'), 'voyager');
assert.match(await text('#place .kirk'), /^Kirk’s warp 7\.5 was slower\. In the original series the warp factor cubed gave the speed \(The Making of Star Trek, 1968; never said on screen\): 422 × light, not 826, so here in 14 days\.$/);
await page.selectOption('#real-ship', 'parker');
assert.equal(await page.evaluate(() => warpScale.trip.lanes.at(-1).label), 'Parker Solar Probe');
assert.match(await text('#place .real-line'), /^The fastest anything has ever gone: 192 km\/s, only at her closest to the Sun on 24 December 2024/);
assert.match(await text('#times'), /Parker Solar Probe/);
assert.match(page.url(), /\?warp=7\.5&ship=parker#vulcan$/);
await page.click('#go');
await page.click('#go');
assert.match(await text('#race-note'), /Parker Solar Probe would take 25,000 years\.$/);
await page.reload();
await page.waitForFunction(() => window.warpScale);
assert.equal(await page.evaluate(() => warpScale.place), 'vulcan', 'the place was not remembered');
assert.equal(await page.inputValue('#real-ship'), 'parker', 'the real ship was not remembered');
// A link with no ship in it keeps the one picked here, as one with no warp factor keeps yours; one with ship=nh races
// New Horizons.
await page.goto(base + 'warp.html?warp=9#proxima');
await page.waitForFunction(() => window.warpScale);
assert.equal(await page.inputValue('#real-ship'), 'parker', 'a link without a ship changed the one picked');
await page.goto(base + 'warp.html?warp=9&ship=nh#proxima');
await page.waitForFunction(() => window.warpScale);
assert.deepEqual(await page.evaluate(() => [document.getElementById('real-ship').value, warpScale.trip.lanes.at(-1).label]), ['nh', 'New Horizons']);
await page.selectOption('#real-ship', 'voyager');
assert.match(page.url(), /\?warp=9#proxima$/);
await page.evaluate(() => { warpScale.setCustom(7.5); warpScale.select('vulcan'); });
await Promise.all([page.waitForNavigation(), page.click('#place .to-file')]);
await bridgeReady();
assert.equal(await text('#target-name'), '40 Eridani', 'Set course from the warp scale did not choose Vulcan’s sun');

// With reduced motion, warp doesn't flash the screen white and the log doesn't animate in.
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.evaluate(() => {
  const el = document.getElementById('flash'), animate = el.animate.bind(el);
  window.flashes = 0;
  el.animate = (...a) => { window.flashes++; return animate(...a); };
  engage.speed(8); engage.target('Vega');
});
await page.click('#engage');
await page.waitForFunction(() => !document.getElementById('arrival').hidden, null, { timeout: 20000 });
assert.equal(await page.evaluate(() => window.flashes), 0, 'warp flashed the screen with reduced motion on');
assert.equal(await page.locator('#arrival-entry [style*="animation"]').count(), 0, 'the log animated in with reduced motion on');
await page.emulateMedia({ reducedMotion: null });

// On a small phone the orders and the notebook are below the viewscreen. Giving an order or sending a reply from down
// there brings the display back on screen, so the turn isn't played where nobody can see it.
{
  const small = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await small.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const box = sel => p.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  await p.click('#start');
  await p.locator('.order[data-id="enter"]').click();
  await p.waitForFunction(() => !maru.busy, null, { timeout: 20000 });
  await p.locator('.order[data-id="surrender"]').scrollIntoViewIfNeeded();
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  assert.ok((await box('#plot')).bottom < 100, 'the test needs the tactical display scrolled off a small phone to mean anything');
  await p.locator('.order[data-id="evade"]').tap();
  await p.waitForFunction(() => { const r = document.getElementById('plot').getBoundingClientRect(); return r.top >= -4 && r.top < 60; }, null, { timeout: 5000 })
    .catch(() => assert.fail('an order given from below the tactical display left the turn playing off screen'));
  assert.ok((await box('#plot')).bottom > 100);
  await p.waitForFunction(() => !maru.busy, null, { timeout: 20000 });
  // With the display already in view, an order leaves the page where it is.
  const before = await p.evaluate(() => scrollY);
  await p.evaluate(() => scrollBy(0, 30));
  const gap = await p.evaluate(() => scrollY) - before; // a short page may not scroll that far
  if ((await box('#plot')).bottom <= 667 && gap >= 0) {
    const y = await p.evaluate(() => scrollY);
    await p.evaluate(() => document.querySelector('.order[data-id="evade"]').click());
    await p.waitForTimeout(500);
    assert.ok(Math.abs(await p.evaluate(() => scrollY) - y) <= 30 + 4, 'an order moved the page though the display was in view');
  }

  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  await p.click('#start');
  await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await p.locator('#book .ph-add').nth(1).tap();
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  assert.ok((await box('.screen-wrap')).bottom < 100, 'the test needs the viewscreen scrolled off a small phone to mean anything');
  await p.evaluate(() => contact.send());
  await p.waitForFunction(() => { const r = document.querySelector('.screen-wrap').getBoundingClientRect(); return r.top >= -4 && r.top < 60; }, null, { timeout: 5000 })
    .catch(() => assert.fail('a reply sent from the notebook left their answer playing off screen'));
  await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await p.evaluate(() => contact.act('listen'));
  await p.waitForFunction(() => document.querySelector('.screen-wrap').getBoundingClientRect().top >= -4, null, { timeout: 5000 })
    .catch(() => assert.fail('Listen again from down the page left their answer playing off screen'));
  await small.close();
}

// The bridge open twice. Each tab used to save the whole ship from what it read when it opened, so the first touch
// in an older tab (one press on the warp slider) wrote over every flight made in the other since.
{
  const two = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await two.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  const a = await two.newPage(), b = await two.newPage();
  for (const p of [a, b]) { p.on('pageerror', e => problems.push(e.message)); await p.goto(base); await bridgeReady(p); }
  const kept = p => p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).log.map(e => e.title));
  await a.evaluate(() => window.engage.jump('Vega'));
  assert.deepEqual(await kept(a), ['Vega']);
  // The other tab has the flight at once: it is at Vega too, and its log has the entry.
  await b.waitForFunction(() => window.engage.state.log.length === 1);
  assert.equal(await b.locator('#where').innerText(), 'Vega', 'the second tab did not follow the ship');
  await b.focus('#warp');
  await b.keyboard.press('ArrowLeft');
  assert.equal(await b.evaluate(() => window.engage.state.warp), 8.9);
  assert.deepEqual(await kept(b), ['Vega'], 'a press on the warp slider in a second tab wiped the log');
  await a.waitForFunction(() => window.engage.state.warp === 8.9);
  // A flight in one tab while the other one flies somewhere else: both arrivals are in the log.
  await b.evaluate(() => { window.engage.speed(6); window.engage.target('Sirius'); });
  await b.click('#engage');
  await b.waitForFunction(() => window.engage.trip?.phase === 'cruise');
  await a.evaluate(() => window.engage.jump('Altair'));
  assert.equal(await b.evaluate(() => window.engage.state.log.length), 1, 'a tab in flight took the other tab’s save before it arrived');
  await b.waitForFunction(() => !window.engage.trip, null, { timeout: 30000 });
  assert.deepEqual(await kept(b), ['Sirius', 'Altair', 'Vega'], 'an arrival wrote over the flight another tab made meanwhile');
  await a.waitForFunction(() => window.engage.state.log.length === 3);
  assert.equal(await a.locator('#where').innerText(), 'Sirius');
  // With the log open in one tab, a flight in the other shows up in it. Each entry has its own moment of arrival.
  await a.evaluate(() => window.engage.closeSheets());
  await a.click('#open-log');
  await b.evaluate(() => window.engage.jump('Procyon'));
  await a.waitForFunction(() => document.querySelectorAll('#entries .past').length === 4);
  const ids = await a.evaluate(() => window.engage.state.log.map(e => e.id));
  assert.ok(ids.every(Number.isInteger) && new Set(ids).size === 4 && ids.every((x, i) => !i || x < ids[i - 1]), `log entries are not named by their time of arrival: ${ids}`);
  // Two tabs don't answer each other for ever: once it's quiet, nothing more is written.
  await a.waitForTimeout(300);
  const writes = await a.evaluate(async () => { let n = 0; addEventListener('storage', () => n++); await new Promise(r => setTimeout(r, 500)); return n; });
  assert.equal(writes, 0, 'the two tabs went on saving at each other');
  await two.close();
}

// The lab open twice: a creature kept in each tab, and both jars are on the shelf. The second tab used to save the
// shelf as it was when that tab opened, with its own jar added, and the first tab's were gone.
{
  const two = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const a = await two.newPage(), b = await two.newPage();
  for (const p of [a, b]) { p.on('pageerror', e => problems.push(e.message)); await p.goto(base + 'xeno.html'); await p.waitForFunction(() => window.xeno?.current); }
  const shelf = p => p.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1') || '{}').jars?.map(j => `${j.id}-${j.seed}`) || []);
  await a.evaluate(() => window.xeno.show('M', 11, false));
  await a.click('#keep');
  await a.evaluate(() => window.xeno.show('H', 12, false));
  await a.click('#keep');
  await b.waitForFunction(() => window.xeno.jars.length === 2);
  assert.equal(await b.locator('#jars-n').textContent(), '2 of 40', 'the second tab did not show the jars kept in the first');
  await b.evaluate(() => window.xeno.show('K', 7, false));
  await b.click('#keep');
  assert.deepEqual(await shelf(b), ['K-7', 'H-12', 'M-11'], 'a creature kept in a second tab wrote over the first tab’s jars');
  await a.waitForFunction(() => window.xeno.jars.length === 3);
  // One let go in the first tab stays gone when the other tab keeps another, and can still be taken back.
  await a.click('#jars [data-drop="2"]');
  await b.waitForFunction(() => window.xeno.jars.length === 2);
  await b.evaluate(() => window.xeno.show('P', 3, false));
  await b.click('#keep');
  await a.waitForFunction(() => window.xeno.jars.length === 3);
  assert.deepEqual(await shelf(a), ['P-3', 'K-7', 'H-12']);
  assert.equal(await a.locator('#jar-undo').evaluate(el => el.hidden), false, 'the Undo for a jar let go went away when another tab saved');
  await a.click('#jar-undo-go');
  assert.deepEqual((await shelf(a)).sort(), ['H-12', 'K-7', 'M-11', 'P-3']);
  await two.close();
}

// The other rooms' records the same way: a Kobayashi Maru run finished in each of two tabs is two runs on the record,
// and a hail sent from one tab is still on its way after another is sent from the second.
{
  const two = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  const a = await two.newPage(), b = await two.newPage();
  for (const p of [a, b]) { p.on('pageerror', e => problems.push(e.message)); await p.goto(base + 'maru.html'); await p.waitForFunction(() => window.maru); }
  const run = async p => {
    await p.click('#start');
    await p.click('.order[data-id="leave"]');
    await p.waitForSelector('#read-eval');
  };
  await run(a);
  await b.waitForFunction(() => document.querySelectorAll('#runs li').length === 1);
  assert.equal(await b.locator('#taken').textContent(), '1 run taken', 'the briefing in a second tab did not show the run finished in the first');
  await run(b);
  assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem('engage.maru.v1')).runs.length), 2, 'a run finished in a second tab wrote over the first tab’s');
  assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem('engage.maru.v1')).taken), 2);
  // The first tab, still on its evaluation, has both when it goes back to the briefing.
  await a.click('#read-eval');
  await a.click('#again');
  assert.equal(await a.locator('#taken').textContent(), '2 runs taken');
  for (const p of [a, b]) { await p.goto(base + 'missions.html'); await p.waitForFunction(() => window.missions); }
  await a.click('#hail');
  await b.waitForFunction(() => Object.keys(window.missions.hails).length === 1);
  assert.equal(await b.locator('#hail').textContent(), 'Hail on its way', 'a hail sent from one tab is not on its way in the other');
  await b.evaluate(() => window.missions.choose('v2'));
  await b.click('#hail');
  assert.deepEqual(await b.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('engage.missions.v1')).hails).sort()), ['v1', 'v2'], 'a hail from a second tab wrote over the first tab’s');
  await two.close();
}

// Tonight's sky and the warp scale keep only where you left them, and that is kept whole too: a city picked in one
// tab isn't put back to a guess by night vision switched on in another, and neither room goes on saving at itself.
{
  const two = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  const a = await two.newPage(), b = await two.newPage();
  for (const p of [a, b]) { p.on('pageerror', e => problems.push(e.message)); await p.goto(base + 'tonight.html'); await p.waitForFunction(() => window.tonight); }
  await a.click('#open-place');
  await a.click('#cities button:has-text("Tokyo")');
  await b.waitForFunction(() => window.tonight.state.place.name === 'Tokyo');
  assert.match(await b.locator('#open-place').textContent(), /Tokyo/, 'the second tab did not show the city picked in the first');
  await b.click('#night');
  const kept = await b.evaluate(() => JSON.parse(localStorage.getItem('engage.tonight.v1')));
  assert.deepEqual([kept.place.name, kept.night], ['Tokyo', true], 'night vision in a second tab wrote over the city picked in the first');
  await a.waitForFunction(() => document.body.classList.contains('red'));
  for (const p of [a, b]) { await p.goto(base + 'warp.html'); await p.waitForFunction(() => window.warpScale); }
  await a.evaluate(() => window.warpScale.select('vulcan'));
  await b.waitForFunction(() => window.warpScale.place === 'vulcan');
  await b.evaluate(() => window.warpScale.setCustom(7.5));
  await a.waitForFunction(() => document.getElementById('custom-out').textContent === '7.5');
  // The real ship picked in one tab is the one the other races too.
  await b.selectOption('#real-ship', 'nh');
  await a.waitForFunction(() => document.getElementById('real-ship').value === 'nh' && window.warpScale.trip.lanes.at(-1).label === 'New Horizons');
  assert.equal(await a.evaluate(() => localStorage.getItem('engage.warp.v1')), JSON.stringify({ place: 'vulcan', warp: 7.5, real: 'nh' }));
  const writes = await a.evaluate(async () => { let n = 0; addEventListener('storage', () => n++); await new Promise(r => setTimeout(r, 500)); return n; });
  assert.equal(writes, 0, 'two tabs of the warp scale went on saving at each other');
  await two.close();
}

// When the browser won't keep a room's record (its storage is full, or switched off), the room says so where the
// record is listed. Each used to carry on as if it had: the jar, the run, the encounter, the hail or the streak was
// on screen and gone on the next visit. Once the browser takes saves again, the line goes and the record is kept.
{
  const full = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  // The page's own storage, refusing every save the way a full one does, until window.room is set.
  await full.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...a) {
      if (window.room) return set.apply(this, a);
      throw new DOMException(window.blocked ? 'The operation is insecure.' : 'The quota has been exceeded.', window.blocked ? 'SecurityError' : 'QuotaExceededError');
    };
  });
  const p = await full.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const line = id => p.locator(`#${id}`).evaluate(el => (el.hidden ? '' : el.textContent));
  const stored = key => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);

  await p.goto(base + 'xeno.html#M-21');
  await p.waitForFunction(() => window.xeno?.current);
  assert.equal(await line('keep-unsaved'), '', 'the lab says a save failed before anything was saved');
  await p.tap('#keep');
  assert.equal(await line('keep-unsaved'), 'This browser’s storage is full: changes to your jars won’t be kept.');
  assert.equal(await line('jars-unsaved'), 'This browser’s storage is full: changes to your jars won’t be kept.');
  assert.equal(await stored('engage.xeno.v1'), null);
  await p.evaluate(() => { window.room = true; });
  await p.tap('#again');
  await p.tap('#keep');
  assert.equal(await line('keep-unsaved'), '', 'the lab went on saying its jars won’t be kept after a save that worked');
  assert.equal((await stored('engage.xeno.v1')).jars.length, 2, 'the jar the browser refused was not kept once there was room');

  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  await p.evaluate(() => { window.blocked = true; });
  await p.tap('#start');
  await p.tap('.order[data-id="leave"]');
  await p.waitForSelector('#read-eval');
  await p.tap('#read-eval');
  assert.equal(await line('eval-unsaved'), 'This browser isn’t letting the simulator save: this run won’t be kept.');
  await p.tap('#again');
  assert.equal(await line('record-unsaved'), 'This browser isn’t letting the simulator save: your latest run won’t be kept.');
  assert.equal(await p.locator('#runs li').count(), 1);
  // Back on the briefing with room made, it is kept after all.
  await p.evaluate(() => { window.room = true; });
  await p.tap('#start');
  await p.tap('.order[data-id="leave"]');
  await p.waitForSelector('#read-eval');
  await p.tap('#read-eval');
  assert.equal(await line('eval-unsaved'), '');
  assert.equal((await stored('engage.maru.v1')).runs.length, 2);

  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  await p.tap('#start');
  await p.waitForFunction(() => !window.contact.busy);
  await p.tap('#leave');
  await p.waitForFunction(() => window.contact.game.over && !window.contact.busy);
  await p.tap('#send');
  assert.equal(await line('eval-unsaved'), 'This browser’s storage is full: this encounter won’t be kept.');
  await p.tap('#again');
  assert.equal(await line('record-unsaved'), 'This browser’s storage is full: your latest encounter won’t be kept.');
  await p.evaluate(() => { window.room = true; });
  await p.tap('#start');
  await p.waitForFunction(() => !window.contact.busy);
  await p.tap('#leave');
  await p.waitForFunction(() => window.contact.game.over && !window.contact.busy);
  await p.tap('#send');
  assert.equal(await line('eval-unsaved'), '');
  assert.equal((await stored('engage.contact.v1')).runs.length, 2);

  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions);
  await p.tap('#hail');
  assert.equal(await line('hail-unsaved'), 'This browser’s storage is full: your hails won’t be kept.');
  await p.evaluate(() => { window.room = true; window.missions.choose('v2'); });
  await p.tap('#hail');
  assert.equal(await line('hail-unsaved'), '');
  assert.deepEqual(Object.keys((await stored('engage.missions.v1')).hails).sort(), ['v1', 'v2']);

  await p.goto(base + 'survey.html');
  await p.waitForFunction(() => window.survey);
  await p.tap('[data-mode="drill"]');
  await p.tap('#choices .choice >> nth=0');
  assert.equal(await line('score-unsaved'), 'This browser’s storage is full: your streak won’t be kept.');
  await p.evaluate(() => { window.room = true; });
  await p.tap('#drill-next');
  await p.tap('#choices .choice >> nth=0');
  assert.equal(await line('score-unsaved'), '');
  assert.equal((await stored('engage.survey.v1')).seen, 2);
  await full.close();
}

// A course link is read the way Set course reads a name, not only as the catalogue spells it; one that names no star
// opens Set course with the name in the search field, and not a bridge where nothing happened.
{
  const links = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await links.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  const p = await links.newPage();
  p.on('pageerror', e => problems.push(e.message));
  for (const [link, name] of [['Vega', 'Vega'], ['vega', 'Vega'], ['The%20Pleiades', 'The Pleiades'], ['vulcan', '40 Eridani']]) {
    await p.goto(`${base}?course=${link}`);
    await bridgeReady(p);
    assert.equal(await p.locator('#target-name').innerText(), name, `?course=${link} did not set course for ${name}`);
    assert.equal(await p.evaluate(() => location.search), '');
    assert.equal(await p.locator('#picker').evaluate(el => el.hidden), true);
    await p.evaluate(() => window.engage.target('no star')); // the next link starts from no course
  }
  await p.goto(`${base}?course=Narnia`);
  await bridgeReady(p);
  assert.equal(await p.locator('#picker').evaluate(el => el.hidden), false, 'a link naming no star did not open Set course');
  assert.equal(await p.inputValue('#search'), 'Narnia');
  assert.equal(await p.locator('#list .empty').innerText(), 'No star by that name in the catalogue.');
  // Part of a name isn't a course either, but the list shows what it might have meant.
  await p.goto(`${base}?course=centauri`);
  await bridgeReady(p);
  assert.equal(await p.inputValue('#search'), 'centauri');
  assert.match(await p.locator('#list .row').first().innerText(), /Centauri/);
  assert.equal(await p.locator('#target-name').innerText(), 'Choose a star');
  await links.close();
}

// The offline copy keeps one of each page, however many links to it are opened: ?course=Vega and ?course=Sirius are
// the same page. It used to keep one whole page for every different link.
{
  const linked = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await linked.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await p.evaluate(() => navigator.serviceWorker.ready);
  for (const link of ['?course=Vega', '?course=Sirius', '?course=Altair', '?course=Deneb', '?course=Polaris', '?utm_source=x&fbclid=abc123', 'warp.html?warp=7.25', 'warp.html?warp=3']) {
    await p.goto(base + link);
    await p.waitForFunction(() => typeof window.engage?.jump === 'function' || window.warpScale);
  }
  await p.waitForTimeout(300);
  const copies = await p.evaluate(async () => {
    const names = (await caches.keys()).filter(k => /^engage-v\d+$/.test(k));
    const keys = (await (await caches.open(names[0])).keys()).map(r => new URL(r.url));
    return { caches: names.length, pages: keys.filter(u => /\/(index\.html|warp\.html)?$/.test(u.pathname)).map(u => u.pathname.split('/').pop() + u.search).sort(), searched: keys.filter(u => u.search).length };
  });
  assert.deepEqual(copies, { caches: 1, pages: ['', 'index.html', 'warp.html'], searched: 0 }, 'the offline copy kept a page for each link opened');
  // And a page opened by a link still opens offline from that one copy.
  await linked.setOffline(true);
  await p.goto(base + '?course=Procyon').catch(() => {});
  assert.equal(await p.locator('#target-name').innerText().catch(() => ''), 'Procyon', 'a course link did not open from the offline copy');
  await linked.setOffline(false);
  await linked.close();
}

// A hail stamped in the future (the clock has been set back since, or the save came from another device) used to
// read "-300% of the way there", and one past the end of time "sent Invalid Date". Both now count as never sent.
// The survey's streak and best were shown as saved, whatever was saved: "Streak -4 · Best abc".
{
  const odd = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await odd.addInitScript(() => {
    if (localStorage.getItem('engage.missions.v1')) return;
    localStorage.setItem('engage.missions.v1', JSON.stringify({ hails: { v1: Date.now() + 3 * 864e5, v2: 8.64e15 + 1, nh: Date.now() - 3600e3 } }));
    localStorage.setItem('engage.survey.v1', JSON.stringify({ best: 'abc', streak: -4, seen: 3 }));
  });
  const p = await odd.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions);
  assert.deepEqual(await p.evaluate(() => Object.keys(window.missions.hails)), ['nh'], 'a hail from the future was kept');
  for (const id of ['v1', 'v2']) {
    await p.evaluate(ship => window.missions.choose(ship), id);
    assert.match(await p.locator('#hail-note').innerText(), /^A hail sent now reaches her /, `${id}’s hail from the future is still on its file`);
    assert.equal(await p.locator('#hail').textContent(), 'Hail her');
  }
  await p.evaluate(() => window.missions.choose('nh'));
  assert.match(await p.locator('#hail-note').innerText(), /^Your hail, sent (today|\d+ [A-Z][a-z]+) at .* is \d+% of the way there\./);
  // A clock set back while the page is open: the hail isn't a minus number of the way there.
  await p.evaluate(() => { window.missions.hails.v1 = Date.now() + 864e5; window.missions.choose('v1'); });
  assert.doesNotMatch(await p.locator('#hail-note').innerText(), /-\d|Invalid/);
  await p.goto(base + 'survey.html');
  await p.waitForFunction(() => window.survey);
  await p.tap('[data-mode="drill"]');
  assert.equal(await p.locator('#score').textContent(), 'Streak 0 · Best 0');
  await odd.close();
}

// First contact by keyboard, start to finish. The notebook used to be built again at every guess and every turn, so
// one press of the down arrow on a meaning menu chose "Hello, meeting" and dropped the keyboard's place to the page:
// the second meaning couldn't be reached. Say it and Send dropped it too. The channel was rewritten at each line, so
// a screen reader read the conversation from the top every time, and never heard their patience, which is drawn.
{
  const keys = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const p = await keys.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  const settled = () => p.waitForFunction(() => !window.contact.busy);
  const at = () => p.evaluate(() => {
    const a = document.activeElement;
    return !a || a === document.body ? 'the page' : a.id || `${a.closest('li')?.dataset.id || ''} ${a.className || a.tagName.toLowerCase()}`.trim();
  });
  await p.focus('#start');
  await p.keyboard.press('Enter');
  await settled();
  assert.equal(await at(), 'listen', 'answering the hail left the keyboard nowhere');
  // The picture parts say what they show.
  assert.equal(await p.getByRole('img', { name: 'Their patience: 5 of 5' }).count(), 1, 'their patience has no name a screen reader can read');
  assert.equal(await p.getByRole('img', { name: /^Viewscreen: their captain, calm\.$/ }).count(), 1, 'the viewscreen doesn’t say what it shows');
  // From here on, count what is added to the channel and what is taken out of it.
  await p.evaluate(() => {
    window.channel = { added: 0, removed: 0 };
    new MutationObserver(all => { for (const m of all) if (m.target.id === 'comms') { window.channel.added += m.addedNodes.length; window.channel.removed += m.removedNodes.length; } })
      .observe(document.getElementById('comms'), { childList: true });
  });
  const lines = await p.locator('#comms > p').count();
  const first = await p.evaluate(() => document.querySelector('#book li').dataset.id);
  await p.locator('#book select').first().focus();
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.locator('#book select').first().inputValue(), 'meet');
  assert.equal(await at(), `${first} select`.replace('select', 'tagged'), 'one press of the down arrow threw the keyboard out of the notebook');
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.locator('#book select').first().inputValue(), 'we', 'the second meaning on the menu can’t be reached with the arrow keys');
  assert.equal(await at(), `${first} tagged`);
  assert.equal(await p.locator(`#comms .ph[data-id="${first}"] small`).first().innerText(), 'We, us?', 'the guess does not show on the channel');
  assert.equal(await p.locator('#book-n').innerText(), '1 of 2 guessed');
  assert.deepEqual(await p.evaluate(() => window.channel), { added: 0, removed: 0 }, 'a guess in the notebook rewrote the channel');
  // The menu's first line fits the menu: "What does it mean?" was cut off at this width.
  const fits = await p.evaluate(() => {
    const s = document.querySelectorAll('#book select')[1], g = document.createElement('canvas').getContext('2d');
    g.font = getComputedStyle(s).font;
    return [s.options[0].text, g.measureText(s.options[0].text).width < s.clientWidth - 40];
  });
  assert.deepEqual(fits, ['Meaning?', true]);
  // Say it keeps the keyboard on the phrase, which is marked as used and can't be said twice.
  await p.locator('#book .ph-add').nth(1).focus();
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#reply li').count(), 1);
  assert.match(await at(), / ph-add$/, 'Say it dropped the keyboard’s place');
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-disabled')), 'true');
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#reply li').count(), 1, 'a phrase already in the reply was added again');
  // Send moves on to Listen again. "We" is no answer to hello: their patience drops, and the channel says so in words.
  await p.focus('#send');
  await p.keyboard.press('Enter');
  assert.equal(await at(), 'listen', 'Send dropped the keyboard’s place');
  await settled();
  assert.equal(await p.getByRole('img', { name: 'Their patience: 4 of 5' }).count(), 1);
  assert.equal(await p.locator('#comms > p.sr').last().textContent(), 'Their patience: 4 of 5.', 'the channel did not say their patience dropped');
  const now = await p.locator('#comms > p').count();
  assert.deepEqual(await p.evaluate(() => window.channel), { added: now - lines, removed: 0 }, 'the channel was rewritten, not added to');
  assert.equal(await p.evaluate(() => document.querySelectorAll('#book li').length), new Set(await p.evaluate(() => [...document.querySelectorAll('#book li')].map(li => li.dataset.id))).size);
  // Taking a phrase out of the reply, and Clear, hand the keyboard on too.
  await p.locator('#book .ph-add').nth(0).focus();
  await p.keyboard.press('Enter');
  await p.locator('#book .ph-add').nth(1).focus();
  await p.keyboard.press('Enter');
  await p.locator('#reply button').first().focus();
  await p.keyboard.press('Enter');
  assert.match(await p.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Take “.*” out$/, 'taking a phrase out dropped the keyboard’s place');
  await p.keyboard.press('Enter');
  assert.match(await at(), / ph-add$/);
  assert.equal(await p.locator('#reply li').count(), 0);
  // The rest of the encounter, with nothing but the keyboard: after every key the keyboard is somewhere.
  for (let n = 0; n < 25 && !(await p.evaluate(() => window.contact.game.over)); n++) {
    const id = await p.evaluate(() => window.contact.hint());
    await p.locator(`#book li[data-id="${id}"] .ph-add`).focus();
    await p.keyboard.press('Enter');
    assert.notEqual(await at(), 'the page');
    await p.focus('#send');
    await p.keyboard.press('Enter');
    assert.notEqual(await at(), 'the page', 'Send dropped the keyboard’s place');
    await settled();
    assert.notEqual(await at(), 'the page', 'the keyboard’s place was lost when their answer came');
  }
  assert.equal(await p.evaluate(() => window.contact.game.over), 'contact');
  assert.equal(await at(), 'send', 'the end of the encounter left the keyboard nowhere');
  assert.equal(await p.evaluate(() => window.channel.removed), 0);
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#eval-title').innerText(), 'First contact');
  await keys.close();
}

// A flight on the bridge, by keyboard and for a screen reader. Nothing used to be read out: Engage switched itself
// off and left the keyboard on the page, and the log entry slid up unannounced. One line that is read as it changes
// now says the course, the arrival, a star tapped and the log cleared, and the keyboard's place moves with them.
{
  const keys = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await keys.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  const p = await keys.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => window.engage.speed(8));
  const at = () => p.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'the page' : a.id || `${a.closest('.sheet')?.id || ''} ${a.tagName.toLowerCase()}`.trim(); });
  const said = () => p.locator('#say').evaluate(el => el.textContent.trim());
  assert.equal(await p.locator('#say').getAttribute('role'), 'status');
  assert.equal(await said(), '');
  await p.focus('#choose');
  await p.keyboard.press('Enter');
  await p.keyboard.type('sirius');
  await p.keyboard.press('Enter');
  assert.equal(await at(), 'choose');
  await p.focus('#engage');
  await p.keyboard.press('Enter');
  assert.equal(await said(), 'Course laid in for Sirius, warp 9. 8.60 light years, about 2 days.');
  assert.equal(await at(), 'where', 'Engage left the keyboard nowhere');
  // The count of light years to go changes every frame: it is not read out.
  assert.equal(await p.evaluate(() => ['readout', 'status', 'where'].some(id => document.getElementById(id).closest('[aria-live], [role="status"], [role="log"], [role="alert"]'))), false, 'the flight’s readout is read out at every frame');
  await p.waitForFunction(() => !window.engage.trip, null, { timeout: 30000 });
  assert.equal(await said(), 'Dropped out of warp at Sirius.');
  assert.equal(await at(), 'arrival h3', 'the log entry did not take the keyboard’s place at its heading');
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Sirius');
  await p.keyboard.press('Escape');
  assert.equal(await at(), 'choose', 'putting the entry away did not hand the keyboard to the destination');
  // A star tapped on the viewscreen is said too, with how far it is.
  await p.evaluate(() => window.engage.lookAtStar('Procyon'));
  await p.waitForTimeout(300);
  const star = await p.evaluate(() => window.engage.project('Procyon'));
  await p.mouse.click(star.x, star.y);
  assert.match(await said(), /^Destination: Procyon, 5\.\d\d light years\.$/);
  // Clearing the log says so, and the keyboard goes back to the button that opened the settings.
  await p.focus('#open-settings');
  await p.keyboard.press('Enter');
  await p.focus('#clear-log');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Enter');
  assert.equal(await said(), 'Log cleared. Back in Earth orbit.');
  assert.equal(await at(), 'open-settings');
  await keys.close();
}

// With reduced motion asked for, a flight has no streaks and no rush toward the star. It used to skip only the white
// flash. Now the sky it leaves dims and goes dark, the ship is at the star when it comes up again, and the view
// cuts where it used to pan; the readout still counts the light years down.
{
  const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await calm.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  const p = await calm.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  // Looking for a star cuts to it: one frame later the view is where it will stay.
  await p.evaluate(() => window.engage.lookAtStar('Sirius'));
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cut = await p.evaluate(() => window.engage.state.yaw);
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => window.engage.state.yaw), cut, 'the view panned across the sky with reduced motion on');
  // Every frame of a flight to Sirius: what the streaks are doing, where the ship is drawn, how lit the sky is.
  await p.evaluate(() => {
    window.engage.speed(3);
    window.engage.target('Sirius');
    window.seen = { streak: 0, warp: 0, places: new Set(), dark: 1, left: new Set(), frames: 0 };
    const look = () => {
      const T = window.engage.trip;
      if (T) {
        window.seen.frames++;
        window.seen.streak = Math.max(window.seen.streak, T.streak);
        window.seen.warp = Math.max(window.seen.warp, T.warp);
        window.seen.places.add(T.cam.map(v => v.toFixed(6)).join());
        window.seen.dark = Math.min(window.seen.dark, Number(document.getElementById('sky').style.opacity || 1));
        if (T.phase === 'cruise') window.seen.left.add(document.getElementById('readout-left').textContent);
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await p.tap('#engage');
  await p.waitForFunction(() => window.engage.trip?.phase === 'cruise');
  assert.deepEqual(await p.evaluate(() => [window.engage.trip.streak, window.engage.trip.warp]), [0, 0], 'the warp streaks still play with reduced motion on');
  await p.waitForFunction(() => !window.engage.trip, null, { timeout: 30000 });
  const seen = await p.evaluate(() => ({ ...window.seen, places: window.seen.places.size, left: window.seen.left.size }));
  assert.ok(seen.frames > 30, `only ${seen.frames} frames of the flight were seen`);
  assert.deepEqual([seen.streak, seen.warp], [0, 0], 'streaks were drawn at some point in a reduced-motion flight');
  assert.equal(seen.places, 2, `the ship was drawn in ${seen.places} places on the way: it should be where it set out, then where it arrives`);
  assert.ok(seen.dark < 0.05, `the sky was never dark for the swap (its dimmest was ${seen.dark})`);
  assert.ok(seen.left > 10, 'the readout did not count the light years down');
  assert.equal(await p.evaluate(() => document.getElementById('sky').style.opacity + document.getElementById('labels').style.opacity), '', 'the sky was left dimmed after the flight');
  assert.equal(await p.locator('#where').innerText(), 'Sirius');
  // Without it, the streaks play as they always have.
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.evaluate(() => { window.engage.closeSheets(); window.engage.speed(6); window.engage.target('Procyon'); });
  await p.tap('#engage');
  await p.waitForFunction(() => window.engage.trip?.phase === 'cruise' && window.engage.trip.streak > 60);
  assert.equal(await p.evaluate(() => document.getElementById('sky').style.opacity), '');
  await p.waitForFunction(() => !window.engage.trip, null, { timeout: 30000 });
  await calm.close();
}

// Night vision lays red light over the page, which keeps only the red in each colour. Starfleet's cyan has little, so
// its tags and its names in the list came out fainter than the plain stars beside them (1.3:1 on the sky). Under the
// light they are white now, and the brightest: read here off the red in what is drawn, which is all that is shown.
{
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const p = await dark.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  await p.evaluate(() => { window.tonight.place(40.7, -74, 'New York', 'America/New_York'); window.tonight.at('2026-10-25T05:30:00Z'); window.tonight.look(110, 35, 80); });
  await p.evaluate(() => document.fonts.ready);
  // The most red in each tag's name (the top line of its box), and how that reads against black under red light.
  const tags = () => p.evaluate(() => {
    const c = document.getElementById('view'), g = c.getContext('2d'), k = c.width / c.clientWidth;
    const lin = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    // (The clusters, nebulae and galaxies are tags too, drawn as the plain stars' are under the red light.)
    const boxes = [...window.tonight.tags(), ...window.tonight.sights().filter(x => x.box).map(x => ({ name: x.name, ...x.box }))];
    return boxes.map(t => {
      const d = g.getImageData(Math.round((t.x + 6) * k), Math.round((t.y + 3) * k), Math.round((t.w - 8) * k), Math.round(15 * k)).data;
      let red = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] > red) { red = d[i]; blue = d[i + 2]; } }
      return { name: t.name, red, blue, contrast: +((0.2126 * lin(red / 255) + 0.05) / 0.05).toFixed(2) };
    });
  });
  await p.waitForTimeout(200);
  // Starfleet's tags are the ones its charts name (by day, the cyan ones; with 28 of them on the sky another tag's
  // amber ring can show through a name, so it is told by the name, not the colour).
  const day = await tags();
  const { CHARTS: charted } = await import('../js/charts.js');
  const trek = new Set(day.filter(t => charted.some(c => c.tag === t.name)).map(t => t.name));
  assert.ok(day.filter(t => trek.has(t.name) && t.blue > t.red).length >= trek.size - 1, `Starfleet's tags are not cyan by day: ${JSON.stringify(day)}`);
  assert.ok(trek.size >= 2 && day.length - trek.size >= 2, `not enough tags on the sky to compare: ${day.map(t => `${t.name} ${t.red}/${t.blue}`)}`);
  await p.tap('#night');
  await p.waitForTimeout(200);
  const night = (await tags()).map(t => ({ ...t, trek: trek.has(t.name) }));
  assert.equal(night.length, day.length);
  const least = list => Math.min(...list.map(t => t.contrast)), most = list => Math.max(...list.map(t => t.red));
  assert.ok(least(night.filter(t => t.trek)) >= 4.5, `a Starfleet tag is too faint under night vision: ${JSON.stringify(night.filter(t => t.trek))}`);
  assert.ok(least(night.filter(t => !t.trek)) >= 4.5, `a tag is too faint under night vision: ${JSON.stringify(night.filter(t => !t.trek))}`);
  assert.ok(Math.min(...night.filter(t => t.trek).map(t => t.red)) > most(night.filter(t => !t.trek)), 'Starfleet’s tags are not the brightest under night vision');
  // In the list, Starfleet's names are the brighter and the heavier ones.
  await p.tap('#open-list');
  const names = await p.evaluate(() => {
    const read = el => { const s = getComputedStyle(el); return { red: Number(s.color.match(/\d+/)[0]), weight: Number(s.fontWeight) }; };
    return { trek: read(document.querySelector('.system.trek .s-name')), plain: read(document.querySelector('.system:not(.trek) .s-name')), sub: read(document.querySelector('.s-sub')), note: read(document.querySelector('.list-note')) };
  });
  assert.ok(names.trek.red === 255 && names.trek.red > names.plain.red && names.trek.weight > names.plain.weight, `Starfleet’s names don’t stand out in the list under night vision: ${JSON.stringify(names)}`);
  assert.ok(Math.min(names.plain.red, names.sub.red, names.note.red) >= 236, `text in the list is too faint to read under night vision: ${JSON.stringify(names)}`);
  await dark.close();
}

// A sheet that is up is a dialog: Tab stays inside it, and what is behind it is out of reach of a keyboard and a
// screen reader. Tab used to walk out of Bridge settings to the round buttons under the scrim, and out of the
// welcome card to the whole bridge behind it. Putting a sheet away (Escape, its close button, the scrim) gives the
// bridge back, and the keyboard's place with it. The arrival's log entry is not a dialog: the bridge stays usable.
{
  const keys = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await keys.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const inside = () => p.evaluate(() => { const a = document.activeElement; return a?.closest('.sheet, .intro')?.id || (a === document.body ? 'the page' : a.id || a.tagName); });
  const shut = () => p.evaluate(() => document.getElementById('bridge').inert);
  const tabs = async (n, key = 'Tab') => { const seen = new Set(); for (let i = 0; i < n; i++) { await p.keyboard.press(key); seen.add(await inside()); } return [...seen]; };
  assert.deepEqual(await p.locator('#intro').evaluate(el => [el.getAttribute('role'), el.getAttribute('aria-modal')]), ['dialog', 'true']);
  assert.equal(await shut(), true, 'the bridge can be reached behind the welcome card');
  assert.deepEqual(await tabs(12), ['intro'], 'Tab walked out of the welcome card');
  await p.focus('#intro-go');
  await p.keyboard.press('Enter');
  assert.equal(await inside(), 'choose', 'Take the helm left the keyboard nowhere');
  assert.equal(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'Take the helm, pressed from the keyboard, left no ring to show where the keyboard is');
  assert.equal(await shut(), false);
  for (const [button, sheet] of [['open-settings', 'settings'], ['open-log', 'log'], ['choose', 'picker']]) {
    await p.focus(`#${button}`);
    await p.keyboard.press('Enter');
    assert.deepEqual(await p.locator(`#${sheet}`).evaluate(el => [el.getAttribute('role'), el.getAttribute('aria-modal')]), ['dialog', 'true']);
    assert.equal(await shut(), true, `the bridge can be reached behind ${sheet}`);
    assert.deepEqual(await tabs(12), [sheet], `Tab walked out of ${sheet}`);
    assert.deepEqual(await tabs(5, 'Shift+Tab'), [sheet], `Shift+Tab walked out of ${sheet}`);
    await p.keyboard.press('Escape');
    assert.deepEqual([await shut(), await inside()], [false, button], `Escape did not give the bridge back from ${sheet}`);
    await p.keyboard.press('Enter');
    await p.locator(`#${sheet} .close`).click();
    assert.deepEqual([await shut(), await inside()], [false, button], `the close button did not give the bridge back from ${sheet}`);
    await p.keyboard.press('Enter');
    await p.mouse.click(640, 30); // the scrim, above the sheet
    assert.deepEqual([await shut(), await inside()], [false, button], `the scrim did not give the bridge back from ${sheet}`);
  }
  // Picking a star from Set course gives the bridge back too, and so does Set course again from the log.
  await p.focus('#choose');
  await p.keyboard.press('Enter');
  await p.keyboard.type('vega');
  await p.keyboard.press('Enter');
  assert.deepEqual([await shut(), await inside()], [false, 'choose']);
  await p.evaluate(() => window.engage.jump('Vega'));
  assert.equal(await shut(), false, 'the bridge is out of reach behind the arrival’s log entry');
  // (Enough presses to pass every link in Vega's entry, which now has astrometrics' and subspace radio's as well.)
  assert.ok((await tabs(14)).some(where => where !== 'arrival'), 'Tab is shut inside the arrival’s log entry');
  await p.evaluate(() => { window.engage.closeSheets(); window.engage.jump('Sirius'); window.engage.closeSheets(); });
  await p.focus('#open-log');
  await p.keyboard.press('Enter');
  await p.locator('#entries summary').nth(1).click();
  await p.locator('#entries [data-again]').click();
  assert.equal(await shut(), false, 'Set course again left the bridge out of reach');
  assert.equal(await p.locator('#target-name').innerText(), 'Vega');
  // Tonight's sky: its list and Where you are are dialogs too; the card for a star is not.
  await p.goto(base + 'tonight.html');
  await p.waitForFunction(() => window.tonight);
  const sky = () => p.evaluate(() => document.getElementById('scope').inert);
  for (const [button, sheet] of [['open-list', 'list'], ['open-place', 'places']]) {
    await p.focus(`#${button}`);
    await p.keyboard.press('Enter');
    assert.deepEqual(await p.locator(`#${sheet}`).evaluate(el => [el.getAttribute('role'), el.getAttribute('aria-modal')]), ['dialog', 'true']);
    assert.equal(await sky(), true, `the sky can be reached behind ${sheet}`);
    assert.deepEqual(await tabs(12), [sheet], `Tab walked out of ${sheet}`);
    await p.keyboard.press('Escape');
    assert.deepEqual([await sky(), await inside()], [false, button]);
  }
  await p.evaluate(() => window.tonight.show({ kind: 'moon' }));
  assert.equal(await sky(), false, 'the sky is out of reach behind a card');
  await keys.close();
}

// The Kobayashi Maru by keyboard. The orders used to be built again every turn, so the keyboard's place fell out of
// the list after each one; nothing took it on Take command or at the end; and the cruisers' strength, which Fire
// phasers depends on, was only in the picture.
{
  const keys = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const p = await keys.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  const at = () => p.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'the page' : a.dataset.id || a.id || a.tagName; });
  const settled = () => p.waitForFunction(() => !window.maru.busy);
  const order = async id => { await p.focus(`.order[data-id="${id}"]`); await p.keyboard.press('Enter'); await settled(); };
  await p.focus('#start');
  await p.keyboard.press('Enter');
  assert.equal(await at(), 'enter', 'Take command left the keyboard nowhere');
  assert.equal(await p.getByRole('group', { name: 'Ship status' }).count(), 1);
  assert.equal(await p.getByRole('img', { name: /^Tactical display\. Your ship is holding in Federation space, at the edge of the Neutral Zone\. The Kobayashi Maru is adrift inside the zone, 381 aboard\.$/ }).count(), 1, 'the tactical display doesn’t say what it shows');
  // An order that has been answered is marked so, stays where it is, and keeps the keyboard.
  await p.evaluate(() => { document.querySelector('.order[data-id="hail-maru"]').kept = true; });
  await order('hail-maru');
  assert.equal(await at(), 'hail-maru', 'the keyboard’s place fell out of the orders');
  assert.deepEqual(await p.evaluate(() => { const b = document.activeElement; return [b.kept, b.getAttribute('aria-disabled'), b.lastChild.textContent]; }), [true, 'true', 'Already answered'], 'the orders were built again');
  const turn = await p.evaluate(() => window.maru.game.turn);
  await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => window.maru.game.turn), turn, 'an order already answered was given again');
  // Crossing the line changes every order: the keyboard goes to the first that can be given.
  await order('enter');
  assert.equal(await at(), 'beam');
  assert.equal(await p.getByRole('img', { name: /alongside the Maru, hull \d+ percent, shields \d+ percent\. The Kobayashi Maru is adrift, \d+ aboard\. Three Klingon cruisers, at 100, 100 and 100 percent\.$/ }).count(), 1);
  await order('phasers');
  assert.equal(await at(), 'phasers');
  assert.doesNotMatch(await p.locator('#plot').getAttribute('aria-label'), /at 100, 100 and 100 percent/, 'the display’s words did not keep up with the turn');
  // To the end with the keyboard alone: after every order the keyboard is somewhere.
  for (let n = 0; n < 40 && !(await p.evaluate(() => window.maru.game.over)); n++) {
    const id = await p.evaluate(() => ['beam', 'evade'].find(x => document.querySelector(`.order[data-id="${x}"]:not([aria-disabled])`)));
    await order(id);
    assert.notEqual(await at(), 'the page', `the keyboard’s place was lost after ${id}`);
  }
  assert.equal(await at(), 'read-eval', 'the end of the simulation left the keyboard nowhere');
  await p.keyboard.press('Enter');
  assert.equal(await at(), 'eval-title');
  await p.focus('#again');
  await p.keyboard.press('Enter');
  assert.equal(await at(), 'start');
  // Long missions: Hail her is answered in words a screen reader reads, once.
  await p.goto(base + 'missions.html');
  await p.waitForFunction(() => window.missions);
  await p.focus('#hail');
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#hail-said').getAttribute('role'), 'status');
  assert.match(await p.locator('#hail-said').textContent(), /^Your hail, sent today at .* is 0\.000% of the way there\./);
  // The numbers tick over ten times a second, and so does a hail's progress: none of it is in a part of the page that
  // is read out as it changes.
  const chatter = await p.evaluate(() => new Promise(done => {
    let changes = 0;
    const watch = new MutationObserver(list => { changes += list.length; });
    for (const el of document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="log"], [role="alert"]')) watch.observe(el, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { watch.disconnect(); done(changes); }, 1500);
  }));
  assert.equal(chatter, 0, 'screen readers would read out the ticking numbers');
  await keys.close();
}

// The viewscreen's keys. The arrow keys used to stop looking around as soon as any button had been clicked or tabbed
// to, and nothing gave the sky the keyboard back; there was no way to zoom without a wheel or two fingers, and the
// list in Set course took a Tab for every star.
{
  const keys = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await keys.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  const p = await keys.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const view = () => p.evaluate(() => { const { yaw, pitch, fov, warp } = window.engage.state; return { yaw, pitch, fov, warp }; });
  const at = () => p.evaluate(() => document.activeElement?.id || document.activeElement?.className || 'the page');
  // With a button holding the keyboard, the arrows still look around.
  await p.click('#open-settings');
  await p.keyboard.press('Escape');
  assert.equal(await at(), 'open-settings');
  let was = await view();
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowUp');
  let now = await view();
  assert.ok(now.yaw > was.yaw && now.pitch > was.pitch, 'the arrow keys stopped looking around once a button had the keyboard');
  // + and - zoom, and where the keys leave the view is kept.
  await p.keyboard.press('+');
  await p.keyboard.press('=');
  assert.ok(Math.abs((await view()).fov / now.fov - 0.64) < 0.001, 'the plus key did not zoom in');
  await p.keyboard.press('-');
  assert.ok(Math.abs((await view()).fov / now.fov - 0.8) < 0.001, 'the minus key did not zoom out');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).fov), (await view()).fov, 'the zoom was not kept');
  // The warp slider keeps the arrows for itself.
  await p.focus('#warp');
  was = await view();
  await p.keyboard.press('ArrowLeft');
  now = await view();
  assert.deepEqual([now.yaw, now.warp], [was.yaw, 8.9], 'an arrow key on the warp slider turned the view');
  // / opens Set course with nothing typed; the arrows walk the list and come back; Enter takes the star.
  await p.focus('#look-home');
  await p.keyboard.press('/');
  assert.equal(await at(), 'search');
  assert.equal(await p.inputValue('#search'), '');
  was = await view();
  await p.keyboard.type('ald+');
  assert.equal((await view()).fov, was.fov, 'a plus typed in the search field zoomed the view');
  await p.keyboard.press('Backspace');
  await p.keyboard.press('ArrowLeft');
  assert.equal((await view()).yaw, was.yaw, 'an arrow key in the search field turned the view');
  await p.keyboard.press('ArrowDown');
  assert.match(await p.evaluate(() => document.activeElement.innerText), /^Aldebaran/, 'the down arrow did not go into the list');
  const second = await p.locator('#list .row').nth(1).innerText();
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.innerText), second);
  assert.equal((await view()).pitch, was.pitch, 'an arrow key in the list turned the view');
  await p.keyboard.press('ArrowUp');
  await p.keyboard.press('ArrowUp');
  assert.equal(await at(), 'search', 'the up arrow did not come back to the search field');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#target-name').innerText(), 'Aldebaran');
  assert.equal(await at(), 'choose');
  // With a sheet up, the keys leave the sky behind it alone.
  await p.focus('#open-settings');
  await p.keyboard.press('Enter');
  was = await view();
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('+');
  now = await view();
  assert.deepEqual([now.yaw, now.fov], [was.yaw, was.fov], 'the keys moved the sky behind Bridge settings');
  await p.keyboard.press('Escape');
  // The viewscreen says so to a screen reader.
  assert.equal(await p.getByRole('img', { name: /^Viewscreen\. .* With a keyboard: the arrow keys look around, plus and minus zoom, and slash opens Set course\.$/ }).count(), 1);
  await keys.close();
}

// A Kobayashi Maru left part-way is there to resume. A reload, or a phone putting the tab away, used to end it with
// nothing kept. What comes back is the same game, dice and all: the next order goes exactly as it would have. It is
// let go when a new one is started or the evaluation is reached, and goes on the record once.
{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const p = await phone.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  const settled = () => p.waitForFunction(() => !window.maru.busy);
  const order = async id => { await p.tap(`.order[data-id="${id}"]`); await settled(); };
  const game = () => p.evaluate(() => JSON.stringify(window.maru.game));
  const kept = () => p.evaluate(() => JSON.parse(localStorage.getItem('engage.maru.v1') || '{}'));
  const offered = () => p.locator('#resume').evaluate(el => !el.hidden);
  assert.equal(await offered(), false, 'Resume is offered with nothing to resume');
  await p.tap('#start');
  assert.equal((await kept()).game, undefined, 'a simulation with no orders given was kept');
  for (const id of ['hail-maru', 'enter', 'beam']) await order(id);
  const left = { game: await game(), log: await p.locator('#comms').innerText(), display: await p.locator('#plot').getAttribute('aria-label'), turn: await p.locator('#turn').textContent() };
  assert.deepEqual((await kept()).game.orders, ['hail-maru', 'enter', 'beam']);
  await p.reload();
  await p.waitForFunction(() => window.maru);
  assert.equal(await offered(), true, 'a simulation left part-way is not offered again after a reload');
  assert.equal(await p.locator('#resume-note').textContent(), 'You left a simulation on turn 4, inside the Neutral Zone. Taking command starts a new one.');
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.brief button:not([hidden])')].map(b => `${b.id} ${b.className}`)), ['resume primary', 'start secondary', 'daily-start secondary'], 'Resume is not above Take command');
  await p.tap('#resume');
  assert.deepEqual({ game: await game(), log: await p.locator('#comms').innerText(), display: await p.locator('#plot').getAttribute('aria-label'), turn: await p.locator('#turn').textContent() }, left, 'the simulation that came back is not the one that was left');
  // The next order, given here and to a copy played from the start with the same orders, comes out the same.
  const twin = await p.evaluate(async () => {
    const sim = await import('./js/maru-sim.js');
    const g = sim.newGame({ seed: window.maru.game.seed });
    for (const id of ['hail-maru', 'enter', 'beam', 'phasers']) sim.act(g, id);
    return JSON.stringify(g);
  });
  await order('phasers');
  assert.equal(await game(), twin, 'the dice were thrown again after resuming');
  // On to the end. The evaluation lets the kept game go, and the record has the one run.
  for (let n = 0; n < 40 && !(await p.evaluate(() => window.maru.game.over)); n++) await order(await p.evaluate(() => ['beam', 'evade'].find(x => document.querySelector(`.order[data-id="${x}"]:not([aria-disabled])`))));
  await p.tap('#read-eval');
  await p.tap('#again');
  assert.deepEqual([await offered(), (await kept()).game, (await kept()).runs.length, (await kept()).taken], [false, undefined, 1, 1], 'a finished simulation can still be resumed, or was recorded twice');
  await p.reload();
  await p.waitForFunction(() => window.maru);
  assert.deepEqual([await offered(), await p.locator('#runs li').count()], [false, 1]);
  // Reloading while the last turn plays out can't take it back: it is finished, and on the record.
  await p.tap('#start');
  await p.evaluate(() => window.maru.give('leave'));
  await p.reload();
  await p.waitForFunction(() => window.maru);
  assert.deepEqual([await offered(), (await kept()).game, (await kept()).taken, await p.locator('#runs li').count()], [false, undefined, 2, 2], 'a reload during the last turn lost the run, or let it be taken back');
  // Taking command anew lets the one that was left go.
  await p.tap('#start');
  await order('scan');
  await p.reload();
  await p.waitForFunction(() => window.maru);
  assert.equal(await p.locator('#resume-note').textContent(), 'You left a simulation on turn 2, at the edge of the Neutral Zone. Taking command starts a new one.');
  await p.tap('#start');
  assert.equal((await kept()).game, undefined, 'Take command kept the simulation that was left');
  // A resumed game, finished, and then fifty more from the same page: each starts clean, with nothing carried over
  // from the one before (hull, shields, torpedoes, cruisers, the people aboard, the log, the orders), and each is one run.
  await order('enter');
  await p.reload();
  await p.waitForFunction(() => window.maru);
  await p.tap('#resume');
  await order('warp');
  await p.tap('#read-eval');
  await p.tap('#again');
  let taken = (await kept()).taken;
  assert.equal(taken, 3);
  const PLANS = [['leave'], ['enter', 'warp'], ['hail-maru', 'scan', 'enter', 'beam', 'beam', 'warp'], ['enter', 'phasers', 'torpedoes', 'phasers', 'evade'], ['starfleet', 'enter', 'hail', 'surrender', 'beam']];
  for (let run = 0; run < 50; run++) {
    await p.evaluate(() => window.maru.start());
    const clean = await p.evaluate(() => {
      const g = window.maru.game;
      return { turn: g.turn, hull: g.hull, shields: g.shields, torpedoes: g.torpedoes, cruisers: g.klingons.length, aboard: g.maru.aboard, rescued: g.aboard, where: g.where, over: g.over,
        log: document.querySelectorAll('#comms .line').length, orders: [...document.querySelectorAll('#orders .order')].map(b => b.dataset.id + (b.getAttribute('aria-disabled') ? ' off' : '')).join(),
        turnLine: document.getElementById('turn').textContent, alert: !document.getElementById('alert').hidden, gauges: ['hull', 'shields', 'maru-left', 'rescued'].map(id => document.getElementById(id).textContent).join() };
    });
    assert.deepEqual(clean, { turn: 0, hull: 100, shields: 100, torpedoes: 6, cruisers: 0, aboard: 381, rescued: 0, where: 'outside', over: null,
      log: 1, orders: 'enter,hail-maru,starfleet,scan,leave', turnLine: 'Turn 1 · Federation space', alert: false, gauges: '100%,100%,381,0' }, `run ${run + 1} of 50 did not start clean`);
    for (const id of PLANS[run % PLANS.length]) {
      if (await p.evaluate(() => !!window.maru.game.over)) break;
      await p.evaluate(x => window.maru.give(x), id);
      await settled();
    }
    while (!(await p.evaluate(() => !!window.maru.game.over))) { await p.evaluate(() => window.maru.give(window.maru.game.flags.warpDown ? 'evade' : 'warp')); await settled(); }
    const after = await kept();
    assert.deepEqual([after.taken, after.game, after.runs.length], [++taken, undefined, Math.min(30, taken)], `run ${run + 1} of 50 was not recorded once`);
  }
  await p.tap('#read-eval');
  await p.tap('#again');
  assert.equal(await p.locator('#taken').textContent(), '53 runs taken');
  assert.equal(await offered(), false);
  await phone.close();
}

// First contact the same: the captain, the conversation word for word, the notebook's guesses and the reply half put
// together all come back, their patience as it was, and a misunderstanding can't be taken back with a reload.
{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const p = await phone.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  const settled = () => p.waitForFunction(() => !window.contact.busy);
  const kept = () => p.evaluate(() => JSON.parse(localStorage.getItem('engage.contact.v1') || '{}'));
  const offered = () => p.locator('#resume').evaluate(el => !el.hidden);
  const state = () => p.evaluate(() => ({
    game: JSON.stringify(window.contact.game), channel: [...document.querySelectorAll('#comms .line')].map(l => l.textContent).join('|'),
    book: [...document.querySelectorAll('#book li')].map(li => `${li.dataset.id}=${li.querySelector('select').value} ${li.querySelector('.ph-n').textContent}`).join(),
    reply: [...document.querySelectorAll('#reply .t')].map(t => t.textContent).join(), patience: document.getElementById('patience').getAttribute('aria-label'),
    screen: document.getElementById('screen').getAttribute('aria-label'), said: document.querySelector('#subtitle .said')?.textContent || '',
  }));
  assert.equal(await offered(), false);
  await p.tap('#start');
  await settled();
  await p.locator('#book select').first().selectOption('meet');
  await p.locator('#book .ph-add').nth(1).tap(); // "we" is no answer to hello: a misunderstanding
  await p.tap('#send');
  await settled();
  await p.locator('#book .ph-add').first().tap(); // and the start of a better reply, not yet sent
  const left = await state();
  assert.equal(left.patience, 'Their patience: 4 of 5');
  assert.equal(left.reply.length > 0, true);
  await p.reload();
  await p.waitForFunction(() => window.contact);
  assert.equal(await offered(), true, 'an encounter left part-way is not offered again after a reload');
  assert.match(await p.locator('#resume-note').textContent(), /^You left an encounter with the channel open: \d+ phrases heard, their patience at 4 of 5\. Answering the hail meets a new ship\.$/);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.brief button:not([hidden])')].map(b => `${b.id} ${b.className}`)), ['resume primary', 'start secondary', 'daily-start secondary']);
  await p.tap('#resume');
  await settled();
  assert.deepEqual(await state(), left, 'the encounter that came back is not the one that was left');
  // Sent, the reply does what it would have: hello is answered and they move on. Then on to first contact.
  await p.tap('#send');
  await settled();
  assert.equal(await p.evaluate(() => window.contact.game.beat), 1);
  for (let n = 0; n < 25 && !(await p.evaluate(() => window.contact.game.over)); n++) {
    await p.locator(`#book li[data-id="${await p.evaluate(() => window.contact.hint())}"] .ph-add`).tap();
    await p.tap('#send');
    await settled();
  }
  assert.equal(await p.evaluate(() => window.contact.game.over), 'contact');
  await p.tap('#send');
  assert.match(await p.locator('#eval-score').innerText(), /^1\/1[0-9]/, 'the guess made before the reload was not counted');
  await p.tap('#again');
  assert.deepEqual([await offered(), (await kept()).game, (await kept()).runs.length, (await kept()).met], [false, undefined, 1, 1], 'a finished encounter can still be resumed, or was recorded twice');
  // Reloading while their last answer plays out can't take the last move back.
  await p.tap('#start');
  await settled();
  await p.evaluate(() => window.contact.act('leave'));
  await p.reload();
  await p.waitForFunction(() => window.contact);
  assert.deepEqual([await offered(), (await kept()).game, (await kept()).met, await p.locator('#runs li').count()], [false, undefined, 2, 2], 'a reload during the last exchange lost the encounter, or let it be taken back');
  // Answering a new hail lets the one that was left go.
  await p.tap('#start');
  await settled();
  await p.tap('#listen');
  await settled();
  await p.reload();
  await p.waitForFunction(() => window.contact);
  assert.equal(await offered(), true);
  await p.tap('#start');
  await settled();
  assert.equal((await kept()).game, undefined, 'Answer the hail kept the encounter that was left');
  await phone.close();
}

// The sky from here. Only the 32 stars with notes had anything to say beyond the star, home and the trip, and Set
// course offered the same 32 wherever the ship was. Every arrival now names the brightest star in its sky and the
// nearest one, offers a course for the nearest, and Set course opens with the five stars nearest the ship.
// Far from home the viewscreen empties, because the catalogue holds little out there: the log and the settings say so,
// and Set course no longer heads stars 1,400 light years away "Next door".
{
  const near = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await near.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await near.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const groups = () => p.locator('#list .group').allInnerTexts();
  // At home Set course is as it was (under the voyages): there is nothing nearer the ship than what Next door lists.
  await p.tap('#choose');
  assert.deepEqual(await groups(), ['VOYAGES', 'HOME', 'NEXT DOOR', 'WORTH THE TRIP', 'LONG HAULS', 'NEBULAE AND CLUSTERS']);
  await p.evaluate(() => engage.closeSheets());
  // Denebola has no notes. Its entry says where a planet would be temperate and the star's life, then what is around
  // it, between the star and the look home.
  await p.evaluate(() => engage.jump('Denebola'));
  assert.deepEqual(await p.locator('#arrival-entry dt').allInnerTexts(), ['THE STAR', 'A TEMPERATE ORBIT', 'ITS LIFE', 'THE SKY FROM HERE', 'LOOKING HOME', 'THE TRIP']);
  assert.equal(await p.locator('#arrival-entry dt:text-is("The sky from here") + dd').innerText(), 'The brightest star in this sky is Arcturus, magnitude −1.2. The nearest is Gliese 452.1, 3.6 light years away.');
  assert.deepEqual(await p.locator('#arrival-entry .entry-actions > *').allInnerTexts(), ['SET COURSE FOR GLIESE 452.1', 'IN YOUR SKY TONIGHT', 'SHARE THIS COURSE']);
  // Next destination opens on the stars nearest the ship, nearest first, each as far as the helm will say.
  // The headings were written from Earth: away from it, the first group of destinations is the Sun's neighbours,
  // not "Next door".
  await p.tap('#arrival-next');
  assert.deepEqual(await groups(), ['VOYAGES', 'NEAREST TO THE SHIP', 'HOME', 'THE SUN’S NEIGHBOURS', 'WORTH THE TRIP', 'LONG HAULS', 'NEBULAE AND CLUSTERS']);
  const rows = await p.locator('#list .group').nth(1).locator('xpath=following-sibling::*').evaluateAll(els => {
    const out = [];
    for (const el of els) { if (!el.matches('.row')) break; out.push([el.querySelector('.name').firstChild.textContent, el.querySelector('.dist').textContent]); }
    return out;
  });
  assert.deepEqual(rows.map(r => r[0]), ['Gliese 452.1', 'Noquisi', 'Zavijava', 'Gliese 3667', 'Gliese 410']);
  assert.equal(rows[0][1], '3.57 ly');
  await p.evaluate(() => engage.closeSheets());
  // The entry's own button sets that course, and the helm agrees about the distance.
  await p.evaluate(() => engage.jump('Denebola')); // (the sheet again: a second arrival at the same star, which sets no record)
  assert.deepEqual(await p.locator('#arrival-entry .firsts span').allInnerTexts(), ['Second visit']);
  await p.tap('#arrival-entry [data-course]');
  assert.equal(await p.locator('#target-name').innerText(), 'Gliese 452.1');
  assert.match(await p.locator('#trip').innerText(), /^3\.57 ly away/);
  assert.equal(await p.locator('#arrival').evaluate(el => el.hidden), true, 'the entry stayed up over the helm');
  // Kept in the log, the entry still offers it; once the ship is there, it doesn't.
  await p.tap('#open-log');
  await p.locator('.past summary').first().tap();
  assert.deepEqual(await p.locator('.past').first().locator('.entry-actions > *').allInnerTexts(), ['SET COURSE FOR GLIESE 452.1', 'IN YOUR SKY TONIGHT', 'SHARE THIS COURSE']);
  await p.evaluate(() => { engage.closeSheets(); engage.jump('Gliese 452.1'); engage.closeSheets(); });
  await p.tap('#open-log');
  await p.locator('.past summary').nth(1).tap();
  assert.deepEqual(await p.locator('.past').nth(1).locator('.entry-actions > *').allInnerTexts(), ['SET COURSE AGAIN', 'IN YOUR SKY TONIGHT', 'SHARE THIS COURSE']);
  await p.evaluate(() => engage.closeSheets());
  // A star listed at the same place is a companion, in the entry and in the list: Sirius B, 21 AU from Sirius.
  await p.evaluate(() => engage.jump('Sirius'));
  assert.match(await p.locator('#arrival-entry dt:text-is("The sky from here") + dd').innerText(), /^Apart from its companion Gliese 244B, the brightest star in this sky is Procyon, magnitude −1\.3\. The nearest is Gliese 280B, 5\.2 light years away\.$/);
  await p.tap('#arrival-next');
  assert.match((await p.locator('#list .row:not(.voyage)').first().innerText()).replace(/\s+/g, ' '), /^Gliese 244B ?companion \d+ AU White dwarf$/);
  assert.equal(await p.locator('#list .row .badge', { hasText: 'companion' }).count(), 1);
  await p.evaluate(() => engage.closeSheets());
  // Far out, the viewscreen has few stars on it and the log says why: HIP 3 is 1,443 light years from home, and
  // the nearest star the charts have is 182 light years from it. Bridge settings says the same of the whole sky.
  await p.evaluate(() => engage.jump('HIP 3'));
  assert.equal(await p.locator('#arrival-entry dt:text-is("The sky from here") + dd').innerText(),
    'On the charts, the brightest star in this sky is Deneb, magnitude 0.3, and the nearest is HIP 116626, 182 light years away. The charts are thin this far out. They hold only the stars bright enough to see from Earth, so the real sky here has far more than the viewscreen shows.');
  await p.tap('#arrival-next');
  assert.deepEqual((await groups()).slice(0, 4), ['VOYAGES', 'NEAREST TO THE SHIP', 'HOME', 'THE SUN’S NEIGHBOURS']);
  assert.match((await p.locator('#list .row:not(.voyage)').first().innerText()).replace(/\s+/g, ' '), /^HIP 116626 182 ly /);
  await p.evaluate(() => engage.closeSheets());
  // At a star nobody has measured the distance to, nothing is said to be nearest: the ship's place there is only
  // nominal, and the heading used to stand over five rows that each read "distance not measured".
  await p.evaluate(() => engage.jump('ρ Cassiopeiae'));
  assert.equal(await p.locator('#arrival-entry dt:text-is("The sky from here")').count(), 0);
  await p.tap('#arrival-next');
  assert.deepEqual((await groups()).slice(0, 3), ['VOYAGES', 'HOME', 'THE SUN’S NEIGHBOURS'], 'Set course named the stars nearest a ship whose own place is not known');
  assert.equal(await p.locator('#list .row:not(.voyage) .dist').first().innerText(), 'distance not measured');
  // The voyages too: how far they add up to from a place nobody has measured is a guess, and so is the time.
  assert.deepEqual([...new Set(await p.locator('#list .row.voyage .dist').allInnerTexts())], ['distance not measured']);
  assert.doesNotMatch(await p.locator('#list .row.voyage').first().innerText(), /at warp/);
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-settings');
  assert.match(await p.locator('#settings .about').innerText(), /beyond 80 light years the charts hold only the stars bright enough to see from Earth/);
  await near.close();
}

// Looking home names a moment for the very year, links to the ship whose year it is, and a year typed in Set course
// finds the stars its light is reaching. The log used to name a moment for 23 years, two years either side of each
// (Wolf 359 saw 2019, "around when the James Webb Space Telescope launched": Christmas Day 2021), and "1987" found
// only two stars with those digits in their catalogue numbers.
{
  const years = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await years.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await years.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'));
  await p.goto(base);
  await bridgeReady(p);
  const home = () => p.locator('#arrival-entry dd.home').innerText();
  // Sirius is 8.6 light years out: on 18 November 2026 it sees early 2018, the year Voyager 2 left the Sun's bubble
  // by her own file in long missions. The log links to that file.
  await p.evaluate(() => engage.jump('Sirius'));
  assert.match(await home(), /Earth as it was in 2018, the year Voyager 2 left the Sun’s bubble for interstellar space\./);
  const link = p.locator('#arrival-entry dd.home + dd.files a');
  assert.deepEqual([await link.innerText(), await link.getAttribute('href')], ['Where Voyager 2 is now', 'missions.html#v2']);
  await Promise.all([p.waitForNavigation(), link.tap()]);
  await p.waitForFunction(() => window.missions);
  assert.equal(await p.evaluate(() => missions.sel), 'v2', 'the log’s link did not open Voyager 2’s file');
  assert.match(await p.locator('#ship-log, .ship-log, main').first().innerText(), /2018[\s\S]*heliopause/, 'her file does not have the moment the log named');
  await Promise.all([p.waitForNavigation(), p.locator('a.back').tap()]);
  await bridgeReady(p);
  await p.evaluate(() => engage.closeSheets());
  // Wolf 359, 7.8 light years: early 2019, New Horizons at Arrokoth. Not Webb, two years on.
  await p.evaluate(() => engage.jump('Wolf 359'));
  assert.match(await home(), /in 2019, the year New Horizons flew past Arrokoth, the farthest world ever visited\./);
  assert.equal(await p.locator('#arrival-entry dd.home + dd.files a').getAttribute('href'), 'missions.html#nh');
  // Vega's 2001 is nobody's on a long mission: a moment, and no link.
  await p.evaluate(() => engage.jump('Vega'));
  assert.match(await home(), /in 2001, the year NEAR Shoemaker made the first landing on an asteroid, Eros\./);
  assert.equal(await p.locator('#arrival-entry dd.files a[href^="missions.html"]').count(), 0);
  // The link is kept with the entry in the log.
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-log');
  await p.locator('.past summary').nth(1).tap();
  assert.equal(await p.locator('.past').nth(1).locator('dd.home + dd.files a').innerText(), 'Where New Horizons is now');
  await p.evaluate(() => engage.closeSheets());

  // A year in Set course: the stars with that number in their names, as before, and then the three brightest stars
  // that year's light is reaching now.
  await p.tap('#choose');
  await p.fill('#search', '1987');
  const list = () => p.locator('#list > *').evaluateAll(els => els.map(el => (el.matches('.row') ? el.querySelector('.name').firstChild.textContent : `[${el.textContent}]`)));
  assert.deepEqual(await list(), ['HIP 19878', 'HIP 91987', '[Light that left Earth in 1987 is arriving about now at]', 'λ Serpentis', 'ζ Trianguli Australis', 'ζ² Reticuli', '[Subspace radio: the stars hearing 1987’s broadcasts ›]']);
  // The heading is long: it wraps inside the sheet and doesn't push it wider.
  assert.ok(await p.locator('#list .group').evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth), 'the heading runs off the sheet');
  // Take one, fly there, and the log names the year that was asked for.
  await p.locator('#list .row', { hasText: 'λ Serpentis' }).tap();
  assert.equal(await p.locator('#target-name').innerText(), 'λ Serpentis');
  await p.evaluate(() => engage.jump('λ Serpentis'));
  assert.match(await home(), /Earth as it was in 1987, the year Star Trek: The Next Generation premiered\./);
  await p.evaluate(() => engage.closeSheets());
  // Light from 2024 hasn't got as far as Proxima yet, and a number that is no year is only a number.
  await p.tap('#choose');
  await p.fill('#search', '2024');
  assert.equal((await list()).at(-1), '[Light that left Earth in 2024 hasn’t reached another star yet.]');
  await p.fill('#search', '1899');
  assert.ok(!(await list()).some(t => /Light that left/.test(t)));
  await p.fill('#search', '2099'); // a year that hasn't come, but four digits of HIP 20997
  assert.deepEqual(await list(), ['HIP 20997']);
  await p.fill('#search', 'qqqq');
  assert.deepEqual(await list(), ['[No star by that name in the catalogue.]']);
  await years.close();
}

// Back to the bridge returns you. Every room's Back is a plain link, so the bridge loads afresh, and three things
// used to be lost on the way: the zoom (a wheel or a pinch was never saved: 29 degrees came back as 60), the log
// entry whose link you had followed (you were back on the bare viewscreen), and for a moment the ship's place (the
// header said "Earth orbit" over a black screen until the stars had loaded, wherever the ship was).
{
  const back = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await back.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await back.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const view = () => p.evaluate(() => { const { yaw, pitch, fov } = engage.state; return { yaw, pitch, fov }; });
  const kept = () => p.evaluate(() => { const { yaw, pitch, fov } = JSON.parse(localStorage.getItem('engage.v1')); return { yaw, pitch, fov }; });
  const go = async (click, hook) => { await Promise.all([p.waitForNavigation(), click()]); await p.waitForFunction(hook); };
  const home = async () => { await Promise.all([p.waitForNavigation(), p.click('a.back')]); await bridgeReady(p); };
  const up = sheet => p.locator(sheet).evaluate(el => !el.hidden);

  // The zoom. A wheel is kept once it has been still for a moment, and comes back from a room as it was left.
  await p.mouse.move(640, 300);
  await p.mouse.wheel(0, -600);
  const zoomed = (await view()).fov;
  assert.ok(zoomed < 0.55, `the wheel did not zoom in: ${zoomed}`);
  await p.waitForTimeout(700);
  assert.equal((await kept()).fov, zoomed, 'a zoom with the wheel was not kept');
  await go(() => p.click('#open-survey'), () => window.survey);
  await home();
  assert.equal((await view()).fov, zoomed, 'the zoom was lost on the way back from the survey');
  // Left before that moment is up, it is kept on the way out.
  await go(() => p.evaluate(() => {
    document.getElementById('labels').dispatchEvent(new WheelEvent('wheel', { deltaY: 250, bubbles: true, cancelable: true }));
    document.getElementById('open-xeno').click();
  }), () => window.xeno?.current);
  await home();
  const out = (await view()).fov;
  assert.ok(Math.abs(out / zoomed - Math.exp(0.3)) < 1e-6, `a zoom made just before leaving was lost: ${out} after ${zoomed}`);
  // A turn still under way as the page is left ends up where it was going: Look for the Sun, then a room at once.
  await p.evaluate(() => { engage.jump('Sirius'); engage.closeSheets(); });
  await go(() => p.evaluate(() => { engage.lookHome(); document.getElementById('open-survey').click(); }), () => window.survey);
  await home();
  const facing = await view();
  await p.evaluate(() => engage.lookHome());
  await p.waitForTimeout(1900);
  const sunward = await view();
  assert.ok(Math.abs(Math.sin((facing.yaw - sunward.yaw) / 2)) < 1e-6 && Math.abs(facing.pitch - sunward.pitch) < 1e-6, 'a turn under way when the page was left was saved half done');
  // This tab never writes over a save it hasn't seen. Another tab's save that it wasn't told about (it slept through
  // it) stands, though this one zooms and leaves.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('engage.v1'));
    s.log.unshift({ ...s.log[0], id: s.log[0].id + 1, title: 'Elsewhere' });
    localStorage.setItem('engage.v1', JSON.stringify(s));
  });
  await go(() => p.evaluate(() => {
    document.getElementById('labels').dispatchEvent(new WheelEvent('wheel', { deltaY: -250, bubbles: true, cancelable: true }));
    document.getElementById('open-xeno').click();
  }), () => window.xeno?.current);
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).log.map(e => e.title)), ['Elsewhere', 'Sirius'], 'a tab on its way out wrote over a save it had not seen');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.v1')); s.log.shift(); localStorage.setItem('engage.v1', JSON.stringify(s)); });
  await home();

  // The entry. On arrival at Proxima, scroll the entry down to its planets, follow the survey's link, and come back:
  // the entry is up again, where it was, and its lines don't file in a second time.
  await p.evaluate(() => { engage.closeSheets(); engage.jump('Vega'); engage.jump('Proxima Centauri'); });
  const entry = p.locator('#arrival-entry');
  await entry.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished))); // its lines have filed in
  await entry.evaluate(el => { const a = el.querySelector('.files a'); el.scrollTop = a.getBoundingClientRect().top - el.getBoundingClientRect().top - 30; });
  const scrolled = await entry.evaluate(el => el.scrollTop);
  assert.ok(scrolled > 50, 'the entry is too short to scroll here: the test checks nothing');
  await go(() => p.locator('#arrival-entry .files a', { hasText: 'Proxima b: ' }).click(), () => window.survey);
  await home();
  assert.ok(await up('#arrival'), 'back from the survey, the arrival’s entry was gone');
  assert.equal(await p.locator('#arrival-entry h3').innerText(), 'Proxima Centauri');
  assert.deepEqual(await p.locator('#arrival-entry .firsts span').allInnerTexts(), ['First visit', 'Destination 4 of 35 charted'], 'the entry came back without its line about the records');
  assert.equal(await entry.evaluate(el => el.scrollTop), scrolled, 'the entry came back scrolled somewhere else');
  assert.equal(await p.locator('#arrival-entry [style*="animation"]').count(), 0, 'the entry’s lines filed in again on the way back');
  assert.equal(await p.locator('#scrim').evaluate(el => el.hidden), true);
  // Once: a reload afterwards opens the bridge plain.
  await p.reload();
  await bridgeReady(p);
  assert.equal(await up('#arrival'), false, 'the entry came back a second time');
  // From the captain's log: the second entry down (Vega), its link to tonight's sky, and back. The log is up with
  // that entry open and the keyboard on it.
  await p.click('#open-log');
  await p.locator('.past summary').nth(1).click();
  await go(() => p.locator('.past').nth(1).getByRole('link', { name: 'In your sky tonight' }).click(), () => window.tonight);
  await home();
  assert.ok(await up('#log'), 'back from tonight’s sky, the captain’s log was closed');
  assert.deepEqual(await p.locator('.past').evaluateAll(els => els.map(el => el.open)), [false, true, false]);
  assert.equal(await p.evaluate(() => document.activeElement?.closest('.past')?.querySelector('b').textContent), 'Vega');
  // The ship's own link in Looking home is one of an entry's links too.
  await p.locator('.past summary').nth(1).click();
  await p.locator('.past summary').nth(0).click();
  await go(() => p.locator('.past').nth(0).locator('a[href^="missions.html#"]').click(), () => window.missions);
  await home();
  assert.deepEqual(await p.locator('.past').evaluateAll(els => els.map(el => el.open)), [true, false, false]);
  // A room's own Set course link is there for the helm: the log stays shut, and the mark is spent.
  await go(() => p.locator('.past').nth(0).getByRole('link', { name: 'In your sky tonight' }).click(), () => window.tonight);
  await p.goto(base + '?course=Vega');
  await bridgeReady(p);
  assert.deepEqual([await up('#log'), await up('#arrival'), await p.locator('#target-name').innerText()], [false, false, 'Vega']);
  await p.reload();
  await bridgeReady(p);
  assert.deepEqual([await up('#log'), await up('#arrival')], [false, false]);
  // Half an hour on, the bridge opens plain: a mark that old is somebody else's errand.
  for (const [minutes, open] of [[31, false], [29, true]]) {
    await p.evaluate(m => { const e = engage.state.log[0]; sessionStorage.setItem('engage.return', JSON.stringify({ sheet: 'log', id: e.id, stardate: e.stardate, star: e.star, scroll: 0, at: Date.now() - m * 60000 })); }, minutes);
    await p.reload();
    await bridgeReady(p);
    assert.equal(await up('#log'), open, `a mark ${minutes} minutes old`);
    assert.equal(await p.evaluate(() => sessionStorage.getItem('engage.return')), null);
  }
  // A link opened in a new tab leaves no mark: this page hasn't gone anywhere. (The log is up, at the newest entry.)
  await p.locator('.past').nth(0).getByRole('link', { name: 'In your sky tonight' }).click({ modifiers: ['Control'] });
  await p.reload();
  await bridgeReady(p);
  assert.equal(await up('#log'), false, 'a link opened in a new tab left a mark to come back to');
  for (const other of back.pages()) if (other !== p) await other.close();

  await back.close();

  // The header, before the stars are in: where the ship was left, not "Earth orbit". (No service worker here, so
  // that the catalogue can be held back on its way from the server.)
  const slow = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await slow.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const r = await slow.newPage();
  r.on('pageerror', e => problems.push(e.message));
  await r.goto(base);
  await bridgeReady(r);
  await r.evaluate(() => engage.jump('Proxima Centauri'));
  let release;
  const held = new Promise(done => { release = done; });
  await r.route('**/data/stars.bin', async route => { await held; await route.continue(); });
  await r.reload();
  await r.waitForFunction(() => document.getElementById('where').textContent !== '');
  assert.deepEqual(await r.evaluate(() => [document.getElementById('status').textContent, document.getElementById('where').textContent, !!document.getElementById('loading')]), ['Holding', 'Proxima Centauri', true]);
  release();
  await bridgeReady(r);
  assert.equal(await r.locator('#where').innerText(), 'Proxima Centauri');
  await slow.close();

  // A pinch on a phone is kept as the fingers lift.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await phone.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const q = await phone.newPage();
  q.on('pageerror', e => problems.push(e.message));
  // A ship that has never flown reads Earth orbit from the first moment.
  let let2;
  const held2 = new Promise(r => { let2 = r; });
  await q.route('**/data/stars.bin', async route => { await held2; await route.continue(); });
  await q.goto(base);
  await q.waitForFunction(() => document.getElementById('where').textContent !== '');
  assert.equal(await q.evaluate(() => document.getElementById('where').textContent), 'Earth orbit');
  let2();
  await bridgeReady(q);
  const touch = await phone.newCDPSession(q);
  const fingers = d => [{ x: 195 - d, y: 300, id: 0 }, { x: 195 + d, y: 300, id: 1 }];
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fingers(40)[0]] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(40) });
  for (let d = 50; d <= 120; d += 10) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(d) });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const pinched = await q.evaluate(() => engage.state.fov);
  assert.ok(pinched < 0.5, `the pinch did not zoom in: ${pinched}`);
  assert.equal(await q.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).fov), pinched, 'a pinch was not kept');
  await Promise.all([q.waitForNavigation(), q.tap('#open-xeno')]);
  await q.waitForFunction(() => window.xeno?.current);
  await Promise.all([q.waitForNavigation(), q.tap('a.back')]);
  await bridgeReady(q);
  assert.equal(await q.evaluate(() => engage.state.fov), pinched, 'the pinch was lost on the way back from the lab');
  await phone.close();

  // And the pages fade into each other where the browser can do it, but not with reduced motion asked for. Every
  // page asks for it in its own head: asked for from the shared stylesheet, the fade failed with an error about
  // half the time once the service worker was handing the stylesheet over.
  for (const f of ['index.html', 'survey.html', 'maru.html', 'missions.html', 'tonight.html', 'xeno.html', 'contact.html', 'warp.html', 'system.html', 'away.html', 'radio.html', 'astrometrics.html', 'distress.html', 'temporal.html', 'longway.html', 'engineering.html', 'directive.html', 'shipyard.html']) {
    assert.match(await readFile(join(root, f), 'utf8'), /<style>@media \(prefers-reduced-motion: no-preference\) \{ @view-transition \{ navigation: auto; \}/, f);
  }
  for (const [reducedMotion, fades] of [['no-preference', true], ['reduce', false]]) {
    const fade = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion });
    await fade.addInitScript(() => {
      if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } }));
      addEventListener('pagereveal', e => { sessionStorage.setItem('fades', (sessionStorage.getItem('fades') || '') + (e.viewTransition ? 'y' : 'n')); });
    });
    const f = await fade.newPage();
    f.on('pageerror', e => problems.push(e.message));
    await f.goto(base);
    await bridgeReady(f);
    await f.waitForFunction(() => navigator.serviceWorker?.controller); // the copy for offline is in charge, as on any visit but the first
    for (const [link, hook] of [['#open-survey', () => window.survey], ['a.back', () => typeof window.engage?.jump === 'function'], ['#open-missions', () => window.missions], ['a.back', () => typeof window.engage?.jump === 'function']]) {
      await Promise.all([f.waitForNavigation(), f.tap(link)]);
      await f.waitForFunction(hook);
      await f.waitForTimeout(300);
    }
    if (await f.evaluate(() => 'onpagereveal' in window)) assert.equal(await f.evaluate(() => sessionStorage.getItem('fades')), fades ? 'nyyyy' : 'nnnnn', `with reduced motion ${reducedMotion}`);
    await fade.close();
  }
}

// The log's records say what kinds of star the ship has been to: the seven classes, lit as each is visited, and the
// rare kinds once one is seen. After 200 flights the records named one star and two distances, and nothing of the
// 122 stars visited. It is worked out from the entries and the catalogue: nothing more is saved.
{
  const kinds = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await kinds.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await kinds.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const row = () => p.locator('#records .kinds').evaluate(el => ({
    text: el.innerText.replace(/\s+/g, ' '), lit: [...el.querySelectorAll('.letters b.on')].map(b => b.textContent).join(''), all: el.querySelector('.letters').textContent,
    said: el.querySelector('.letters').getAttribute('aria-label'),
    wide: el.getBoundingClientRect().width > 0.9 * el.parentElement.getBoundingClientRect().width - 30,
  }));
  // Nothing logged, no records at all.
  await p.tap('#open-log');
  assert.equal(await p.locator('#records').count(), 0);
  await p.evaluate(() => engage.closeSheets());
  // Vega is a white star, class A.
  await p.evaluate(() => { engage.jump('Vega'); engage.closeSheets(); });
  await p.tap('#open-log');
  assert.deepEqual(await row(), { text: 'KINDS OF STAR 1 of 7 OBAFGKM', lit: 'A', all: 'OBAFGKM', said: 'Visited: A. Not yet: O, B, F, G, K, M.', wide: true });
  await p.evaluate(() => engage.closeSheets());
  // Betelgeuse is class M, and a red supergiant: the second line appears with the first rare kind.
  await p.evaluate(() => { engage.jump('Betelgeuse'); engage.closeSheets(); });
  await p.tap('#open-log');
  assert.deepEqual(await row(), { text: 'KINDS OF STAR 2 of 7 OBAFGKM Rare kinds: red supergiant', lit: 'AM', all: 'OBAFGKM', said: 'Visited: A, M. Not yet: O, B, F, G, K.', wide: true });
  // The lit letters are told from the rest by more than hue: brighter, and heavier.
  const [on, off] = await p.evaluate(() => ['.letters b.on', '.letters b:not(.on)'].map(sel => { const c = getComputedStyle(document.querySelector(sel)); return [c.color, c.fontWeight]; }));
  assert.ok(on[0] !== off[0] && Number(on[1]) > Number(off[1]), `${on} / ${off}`);
  await p.evaluate(() => engage.closeSheets());
  // Sirius B is a white dwarf, which has no letter of the seven; home is class G.
  await p.evaluate(() => { for (const name of ['Gliese 244B', 'Sol']) { engage.jump(name); engage.closeSheets(); } });
  await p.tap('#open-log');
  assert.deepEqual([(await row()).text, (await row()).lit], ['KINDS OF STAR 3 of 7 OBAFGKM Rare kinds: red supergiant, white dwarf', 'AGM']);
  assert.ok(!/kinds|rare/i.test(await p.evaluate(() => localStorage.getItem('engage.v1'))), 'the kinds of star were saved with the log');
  await kinds.close();
}

// Night vision follows you to the bridge. It was only in tonight's sky, and every card there ends in Set course:
// someone outside with red light on tapped it and got the bridge at full brightness, amber Engage and all. The
// bridge now wears the same red light when tonight's sky has it on, can switch it from Bridge settings (it is
// tonight's sky's setting, kept under its key: no new one), and draws its big buttons as outlines under it.
{
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await dark.addInitScript(() => {
    if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } }));
    if (!localStorage.getItem('engage.tonight.v1')) localStorage.setItem('engage.tonight.v1', JSON.stringify({ night: true, sky: 'dark', trim: 3, place: { name: 'Tokyo', lat: 35.68, lon: 139.69, how: 'city', tz: 'Asia/Tokyo' } }));
  });
  const p = await dark.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const red = (page = p) => page.evaluate(() => [document.body.classList.contains('red'), document.querySelector('meta[name="theme-color"]').content]);
  const kept = () => p.evaluate(() => JSON.parse(localStorage.getItem('engage.tonight.v1')));
  await p.goto(base);
  // Red before the stars are in: there is no bright moment on the way from the sky to the bridge.
  await p.waitForFunction(() => document.getElementById('where').textContent !== '');
  assert.deepEqual(await red(), [true, '#0a0000'], 'the bridge opened at full brightness with night vision on');
  await bridgeReady(p);
  assert.deepEqual(await red(), [true, '#0a0000']);
  assert.equal(await p.locator('body').evaluate(el => getComputedStyle(el, '::after').mixBlendMode), 'multiply', 'the red light is not over the bridge');
  // Nothing large and bright is left: Engage, and Next destination on the arrival's sheet, are outlines.
  await p.evaluate(() => engage.target('Vega'));
  const outline = sel => p.locator(sel).evaluate(el => { const c = getComputedStyle(el); return [c.backgroundImage, c.backgroundColor, c.borderTopStyle, parseFloat(c.borderTopWidth) >= 1]; });
  assert.deepEqual(await outline('#engage'), ['none', 'rgba(0, 0, 0, 0)', 'solid', true], 'Engage is still a bright slab under night vision');
  await p.evaluate(() => engage.jump('Vega'));
  assert.deepEqual(await outline('#arrival-next'), ['none', 'rgba(0, 0, 0, 0)', 'solid', true]);
  // The log's words keep enough red to read: white, where they were a grey-blue with less.
  assert.equal(await p.locator('#arrival-entry dd').first().evaluate(el => getComputedStyle(el).color), 'rgb(255, 240, 236)');
  await p.evaluate(() => engage.closeSheets());
  // Bridge settings has the switch, ticked. Unticking it turns the light off here and in tonight's sky, and leaves
  // the place and the kind of sky kept there alone.
  await p.tap('#open-settings');
  assert.equal(await p.locator('#opt-night').isChecked(), true);
  await p.locator('#opt-night').uncheck();
  assert.deepEqual(await red(), [false, '#05070d']);
  assert.deepEqual(await kept(), { night: false, sky: 'dark', trim: 3, place: { name: 'Tokyo', lat: 35.68, lon: 139.69, how: 'city', tz: 'Asia/Tokyo' } });
  assert.deepEqual(await outline('#arrival-next').then(o => o[0] !== 'none'), true, 'the buttons stayed outlines with the light off');
  await p.evaluate(() => engage.closeSheets());
  await Promise.all([p.waitForNavigation(), p.tap('#open-sky')]);
  await p.waitForFunction(() => window.tonight);
  assert.deepEqual([...(await red()), await p.locator('#night').getAttribute('aria-pressed')], [false, '#05070d', 'false'], 'night vision switched off on the bridge was still on in tonight’s sky');
  // Switched on in tonight's sky, it is on when Back reaches the bridge, and the tick in settings shows it.
  await p.tap('#night');
  assert.deepEqual(await red(), [true, '#0a0000']);
  // Tonight's own big button is an outline too.
  assert.deepEqual(await outline('#sensors'), ['none', 'rgba(0, 0, 0, 0)', 'solid', true], 'Point your phone is still a bright slab under night vision');
  await Promise.all([p.waitForNavigation(), p.tap('a.back')]);
  await bridgeReady(p);
  assert.deepEqual(await red(), [true, '#0a0000']);
  await p.tap('#open-settings');
  assert.equal(await p.locator('#opt-night').isChecked(), true);
  // The sheet's heading and its close button stay put while the settings under them scroll.
  // (Measured once the sheet has finished sliding up: on a busy machine the first reading used to catch it 8 px low.)
  const head = () => p.locator('#settings .close').evaluate(el => Math.round(el.getBoundingClientRect().top));
  await p.locator('#settings').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
  const before = await head();
  await p.locator('#settings .sheet-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.equal(await head(), before, 'the settings’ close button scrolled away');
  await p.evaluate(() => engage.closeSheets());
  // Two tabs: ticking it on the bridge in one turns the other's sky red, and unticking it turns it back.
  const q = await dark.newPage();
  q.on('pageerror', e => problems.push(e.message));
  await q.goto(base + 'tonight.html');
  await q.waitForFunction(() => window.tonight);
  assert.equal((await red(q))[0], true);
  await p.tap('#open-settings');
  await p.locator('#opt-night').uncheck();
  await q.waitForFunction(() => !document.body.classList.contains('red'));
  await p.locator('#opt-night').check();
  await q.waitForFunction(() => document.body.classList.contains('red'));
  assert.equal((await kept()).place.name, 'Tokyo');
  // And the other way: switched off in the sky, the bridge in the other tab goes back to its own colours.
  await q.tap('#night');
  await p.waitForFunction(() => !document.body.classList.contains('red'));
  assert.equal(await p.locator('#opt-night').isChecked(), false);
  // With nothing of tonight's sky kept, the bridge's tick starts a record there that the sky reads as its own.
  await p.evaluate(() => localStorage.removeItem('engage.tonight.v1'));
  await p.locator('#opt-night').check();
  assert.deepEqual(await kept(), { night: true });
  await q.reload();
  await q.waitForFunction(() => window.tonight);
  assert.equal((await red(q))[0], true);
  await dark.close();
}

// A tab that was asleep while another saved (a phone does that to tabs, and doesn't always tell them afterwards)
// looks for itself when it comes back into view. Stood in for here by a save the tab is not told about, and then
// the browser's "you're in view again".
{
  const two = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await two.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true })); });
  const p = await two.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => window.engage.jump('Vega'));
  const wake = () => p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  // Nothing saved meanwhile: coming back into view changes nothing.
  await p.evaluate(() => { window.engage.state.warp = 3.3; });
  await wake();
  assert.equal(await p.evaluate(() => window.engage.state.warp), 3.3, 'a tab that came back into view re-read a save that had not changed');
  // Something saved meanwhile: it is taken up.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('engage.v1'));
    s.log.unshift({ ...s.log[0], id: s.log[0].id + 1, title: 'Sirius' });
    s.warp = 6.5;
    localStorage.setItem('engage.v1', JSON.stringify(s));
  });
  assert.equal(await p.evaluate(() => window.engage.state.log.length), 1);
  await wake();
  assert.deepEqual(await p.evaluate(() => [window.engage.state.log.map(e => e.title).join(), window.engage.state.warp, document.getElementById('warp-out').textContent]), ['Sirius,Vega', 6.5, '6.5'], 'a tab that came back into view did not take up what was saved while it slept');
  // And so its next save keeps it.
  await p.focus('#warp');
  await p.keyboard.press('ArrowRight');
  assert.deepEqual(await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.v1')); return [s.log.length, s.warp]; }), [2, 6.6]);
  // The lab the same.
  await p.goto(base + 'xeno.html#M-5');
  await p.waitForFunction(() => window.xeno?.current);
  await p.evaluate(() => localStorage.setItem('engage.xeno.v1', JSON.stringify({ jars: [{ id: 'K', seed: 9 }, { id: 'H', seed: 4 }] })));
  await wake();
  assert.equal(await p.locator('#jars .jar').count(), 2, 'the lab did not take up jars kept while it slept');
  await p.tap('#keep');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.length), 3);
  await two.close();
}

// Every room whose address brings something back can send it. A text link under its buttons hands the share sheet
// (stood in for here) a link to the live site, and that link opens the same thing; only the bridge and the lab had
// one, and an installed app has no address bar to copy from. And the tab is named after what is on screen, so the
// history, a bookmark and the browser's own share sheet say which ship, file, star or creature it is.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.addInitScript(() => { navigator.share = async data => { window.shared = data; }; });
  const LIVE = 'https://engage.junkdrawer.works/';
  const sharedFrom = async sel => {
    await p.evaluate(() => { window.shared = null; });
    const b = p.locator(sel);
    await b.scrollIntoViewIfNeeded();
    assert.ok((await b.boundingBox()).height >= 44, `${sel} is under 44 px tall`);
    await b.tap();
    return p.evaluate(() => window.shared);
  };

  // The warp scale: the place, and the warp factor now on the slider. The address used to repeat the "?warp=" the
  // page was opened with, however far the slider had moved since.
  await p.goto(base + 'warp.html?warp=5#vega');
  await p.waitForFunction(() => window.warpScale?.trip);
  assert.equal(await p.title(), 'Vega · Warp scale · Engage');
  await p.evaluate(() => warpScale.setCustom(9.9));
  assert.match(p.url(), /warp\.html\?warp=9\.9#vega$/, 'the address still gives the warp factor the page was opened with');
  let sent = await sharedFrom('#place [data-share]');
  assert.equal(sent.url, LIVE + 'warp.html?warp=9.9#vega');
  assert.match(sent.text, /^Earth to Vega: \d+ days at warp 9\.9, 25 years for light\.$/);
  await p.evaluate(() => warpScale.select('delta'));
  assert.equal(await p.title(), 'Where Voyager was stranded · Warp scale · Engage');
  assert.match((await sharedFrom('#place [data-share]')).text, /^Earth to where Voyager was stranded: /);
  await p.goto(base + 'survey.html');
  await p.goto(sent.url.replace(LIVE, base));
  await p.waitForFunction(() => window.warpScale?.trip);
  assert.deepEqual(await p.evaluate(() => [warpScale.place, document.getElementById('custom-warp').value]), ['vega', '9.9'], 'the shared race opened somewhere else, or at another warp factor');

  // Long missions: the ship, with how far she is and how long a signal takes at this moment.
  await p.goto(base + 'missions.html#v2');
  await p.waitForFunction(() => window.missions && document.getElementById('signal').textContent);
  assert.equal(await p.title(), 'Voyager 2 · Long missions · Engage');
  sent = await sharedFrom('#share-ship');
  assert.equal(sent.url, LIVE + 'missions.html#v2');
  assert.match(sent.text, /^Voyager 2 is [\d,]{14,} km from Earth right now, and a signal takes \d\d h \d\d m \d\d s to reach her, one way\.$/);
  await p.evaluate(() => missions.choose('nh'));
  assert.equal(await p.title(), 'New Horizons · Long missions · Engage');
  assert.equal((await sharedFrom('#share-ship')).url, LIVE + 'missions.html#nh');

  // The planetary survey: the file on screen.
  await p.goto(base + 'survey.html#Y');
  await p.waitForFunction(() => window.survey && document.querySelector('#file h2'));
  assert.equal(await p.title(), 'Class Y · Planetary survey · Engage');
  sent = await sharedFrom('#file [data-share]');
  assert.deepEqual([sent.url, sent.text], [LIVE + 'survey.html#Y', 'Class Y, Demon class: toxic and deadly. A survey file from Engage.']);
  await p.evaluate(() => survey.open('ice-giant'));
  assert.equal(await p.title(), 'Ice giant · Planetary survey · Engage');
  assert.equal((await sharedFrom('#file [data-share]')).url, LIVE + 'survey.html#ice-giant');
  await p.evaluate(() => survey.mode('drill'));
  assert.equal(await p.title(), 'Cover your tracks · Planetary survey · Engage');

  // Tonight's sky: a star's card. The planets and the Moon have no link that opens them, so no share either.
  await p.goto(base + 'tonight.html#star=Vega');
  await p.waitForFunction(() => window.tonight && !document.getElementById('card').hidden);
  const star = await p.locator('#card-title').innerText();
  assert.equal(await p.title(), `${star} · Tonight’s sky · Engage`);
  sent = await sharedFrom('#card-share');
  assert.equal(sent.url, LIVE + 'tonight.html#star=Vega');
  assert.ok(sent.text.startsWith(`${star} (`) && sent.text.endsWith('find it in your sky tonight.'), `the message does not name the star: ${sent.text}`);
  await p.evaluate(() => tonight.show({ kind: 'planet', name: 'mars' }));
  assert.equal(await p.title(), 'Mars · Tonight’s sky · Engage');
  assert.equal(await p.locator('#card-share').isHidden(), true, 'a planet’s card offers a link, though no link opens it');
  await p.locator('#card [data-close]').tap();
  assert.equal(await p.title(), 'Tonight’s sky · Engage');

  // The lab and the bridge had a share button already; their tabs are named too.
  await p.goto(base + 'xeno.html#M-5');
  await p.waitForFunction(() => window.xeno?.current);
  assert.equal(await p.title(), `${await p.evaluate(() => xeno.current.name.common)} · Xenobiology lab · Engage`);
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.title(), 'Engage');
  await p.evaluate(() => engage.jump('Vega'));
  assert.equal(await p.title(), 'Vega · Engage');
  await p.evaluate(() => engage.jump('Sol'));
  assert.equal(await p.title(), 'Engage');
  await c.close();
}

// Doors between rooms. The rooms share subjects (Voyager 1 is a ship on file and a rung on the warp scale; Mars is in
// tonight's sky, on the warp scale and the example on a survey file), and each used to lead only back to the bridge.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(e.message));
  // Follows the link with these words inside `within`, and says where it led.
  const door = (within, words) => p.locator(`${within} a`, { hasText: words });
  const through = async (within, words) => {
    const a = door(within, words);
    await a.scrollIntoViewIfNeeded();
    assert.ok((await a.boundingBox()).height >= 44, `“${words}” is under 44 px tall`);
    const to = (await a.evaluate(el => el.href)).slice(base.length); // where it says it goes (a room may tidy its own address once open)
    await Promise.all([p.waitForNavigation(), a.tap()]);
    assert.ok(p.url().startsWith(base + to.split(/[?#]/)[0]), `“${words}” led to ${p.url()}`);
    return to;
  };
  const scale = () => p.waitForFunction(() => window.warpScale?.trip);
  const card = async what => {
    await p.waitForFunction(() => window.tonight);
    if (what) await p.evaluate(s => tonight.show(s), what);
    await p.waitForFunction(() => !document.getElementById('card').hidden);
    return p.locator('#card-title').innerText();
  };

  // The helm's Warp scale link races to the star chosen there. It used to open at the galactic core whatever was chosen.
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#intro-go');
  await p.evaluate(() => { engage.target('Sirius'); const w = document.getElementById('warp'); w.value = 7; w.dispatchEvent(new Event('input')); });
  assert.match(await p.getAttribute('#open-scale', 'href'), /^warp\.html\?warp=7&to=Sirius&ly=8\.\d+$/);
  await Promise.all([p.waitForNavigation(), p.tap('#open-scale')]);
  await scale();
  assert.deepEqual(await p.evaluate(() => [warpScale.place, document.querySelector('#place .eyebrow').textContent, document.querySelector('#place h2').textContent, document.getElementById('custom-warp').value]),
    ['course', 'Your course', 'Sirius', '7'], 'the helm’s course is not the race the warp scale opened on');
  assert.deepEqual(await p.evaluate(() => { const g = document.querySelector('#ladder .rung-group'), r = g.nextElementSibling; return [g.textContent, r.dataset.id, r.getAttribute('aria-current'), r.querySelector('b').textContent, r.querySelector('.rung-name span').textContent]; }),
    ['Your course', 'course', 'true', 'Sirius', '8.60 light years'], 'the ladder does not start with the helm’s course');
  assert.match(p.url(), /warp\.html\?warp=7&to=Sirius&ly=8\.\d+#course$/);
  // Another rung, and back to the course; a reload keeps it, since the address carries it.
  await p.locator('.rung[data-id="moon"]').tap();
  await p.locator('.rung[data-id="course"]').tap();
  await p.reload();
  await scale();
  assert.equal(await p.evaluate(() => warpScale.place), 'course');
  // Its two doors: back to the bridge with the course set, and tonight's sky.
  assert.equal(await through('#place .doors', 'In your sky tonight'), 'tonight.html#star=Sirius');
  assert.equal(await card(), 'Sirius');
  // The course is not a place to come back to: the next visit opens on the last rung picked.
  await p.goto(base + 'warp.html');
  await scale();
  assert.deepEqual(await p.evaluate(() => [warpScale.place, document.querySelectorAll('.rung[data-id="course"]').length]), ['moon', 0]);
  // A star that is on the ladder already is that rung; a star with no measured distance is left out of the link.
  await p.goto(base);
  await bridgeReady(p);
  const unmeasured = await p.evaluate(() => { const cat = engage.cat(); return cat.names[cat.unmeasured.findIndex((u, i) => u && cat.byName.get(cat.names[i]) === i)]; });
  await p.evaluate(name => engage.target(name), unmeasured);
  assert.equal(await p.getAttribute('#open-scale', 'href'), 'warp.html?warp=7', `${unmeasured} has no measured distance, and the warp scale was sent one`);
  await p.evaluate(() => engage.target('Keid'));
  await Promise.all([p.waitForNavigation(), p.tap('#open-scale')]);
  await scale();
  assert.deepEqual(await p.evaluate(() => [warpScale.place, document.querySelectorAll('.rung[data-id="course"]').length]), ['vulcan', 0]);

  // The place card's doors: Voyager 1's file, New Horizons' from Pluto, and a star in tonight's sky.
  await p.goto(base + 'warp.html#voyager');
  await scale();
  assert.equal(await through('#place .doors', 'Her file in long missions'), 'missions.html#v1');
  await p.waitForFunction(() => window.missions?.sel === 'v1');
  // And back: her file's "at warp 9 you'd catch her" leads to the race, at warp 9. No other ship has a rung.
  assert.equal(await through('#file', 'Race to her on the warp scale'), 'warp.html?warp=9#voyager');
  await scale();
  assert.deepEqual(await p.evaluate(() => [warpScale.place, document.getElementById('custom-warp').value]), ['voyager', '9']);
  await p.evaluate(() => warpScale.select('pluto'));
  assert.equal(await through('#place .doors', 'New Horizons in long missions'), 'missions.html#nh');
  await p.waitForFunction(() => window.missions?.sel === 'nh');
  assert.equal(await p.locator('#ship-race').isHidden(), true, 'New Horizons is offered a race the warp scale does not have');
  await p.goto(base + 'warp.html#betelgeuse');
  await scale();
  assert.equal(await through('#place .doors', 'In your sky tonight'), 'tonight.html#star=Betelgeuse');
  assert.equal(await card(), 'Betelgeuse');

  // Tonight's cards. A star that is a rung on the warp scale leads to its race; the Moon, Mars and Jupiter to theirs
  // at warp 9; and each world to the survey file it is the Solar System's example of.
  assert.equal(await through('#card-doors', 'Race there on the warp scale'), 'warp.html#betelgeuse');
  await scale();
  assert.equal(await p.evaluate(() => warpScale.place), 'betelgeuse');
  await p.goto(base + 'tonight.html');
  const doors = async what => { await card(what); return p.locator('#card-doors a').evaluateAll(as => as.map(a => `${a.textContent} > ${a.getAttribute('href')}`)); };
  assert.deepEqual(await doors({ kind: 'moon' }), ['How long at warp 9 > ./warp.html?warp=9#moon', 'Class D survey file > ./survey.html#D']);
  assert.deepEqual(await doors({ kind: 'planet', name: 'venus' }), ['Class N survey file > ./survey.html#N']);
  assert.deepEqual(await doors({ kind: 'planet', name: 'jupiter' }), ['How long at warp 9 > ./warp.html?warp=9#jupiter', 'Class J survey file > ./survey.html#J']);
  assert.deepEqual(await doors({ kind: 'planet', name: 'saturn' }), ['Class J survey file > ./survey.html#J']);
  assert.deepEqual(await doors({ kind: 'sun' }), []);
  assert.equal(await p.locator('#card-share-row').isHidden(), true, 'the Sun’s card has an empty row under it');
  assert.deepEqual(await doors({ kind: 'planet', name: 'mars' }), ['How long at warp 9 > ./warp.html?warp=9#mars', 'Class K survey file > ./survey.html#K']);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the card’s links push the page sideways on a phone');
  assert.equal(await through('#card-doors', 'How long at warp 9'), 'warp.html?warp=9#mars');
  await scale();
  assert.equal(await p.evaluate(() => warpScale.place), 'mars');
  await p.goBack();
  await card({ kind: 'planet', name: 'mars' });
  assert.equal(await through('#card-doors', 'Class K survey file'), 'survey.html#K');
  await p.waitForFunction(() => document.querySelector('#file h2')?.textContent.startsWith('Class K'));

  // The survey: a real planet with a star in the catalogue has tonight's sky beside Set course.
  await p.evaluate(() => survey.open('M'));
  assert.equal(await p.locator('#file .worlds li').first().locator('a').evaluateAll(as => as.map(a => a.textContent.replace(/\s*→\s*$/, '')).join(' | ')), 'Set course | In your sky tonight | System view | Beam down | Grow a creature for Proxima b');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'a planet’s links push the survey sideways on a phone');
  assert.equal(await through('#file .worlds li:first-child', 'In your sky tonight'), 'tonight.html#star=Proxima%20Centauri');
  assert.equal(await card(), 'Proxima Centauri');

  // The Kobayashi Maru's briefing names the real star the film's position is called after, with the two links a log
  // entry has. It had no door but Bridge.
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  assert.match(await p.locator('#where').innerText(), /Gamma Hydra, Section 10\. Gamma Hydrae is a real star, a yellow giant about 134 light years from Earth\./);
  assert.equal(decodeURIComponent(await through('#where', 'In your sky tonight')), 'tonight.html#star=γ Hydrae');
  // It is on Starfleet's charts now, so its card is headed with Gamma Hydra IV, the star's own name under it.
  assert.equal(await card(), 'Gamma Hydra IV');
  assert.match(await p.locator('#card-sub').innerText(), /^γ Hydrae · 134 ly away · in Hydra$/);
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  assert.equal(decodeURIComponent(await through('#where', 'Set course')), '?course=γ Hydrae');
  await bridgeReady(p);
  assert.equal(await p.locator('#target-name').innerText(), 'γ Hydrae');
  await c.close();
}

// A record says so when it is made. Four rooms keep records, and none mentioned one at the moment it was earned:
// a first-ever ending showed no "new ending", and you found out from the briefing's record card, or never.
// And the two briefings know a returning player: one line above the briefing, from the standing record.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const said = sel => p.locator(sel).evaluate(el => (el.hidden ? null : el.textContent));
  // Turns are played with motion reduced (150 ms each), and the evaluation read with it back on.
  const run = async (orders, { rewritten = false } = {}) => {
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.tap(rewritten ? '#rewrite' : '#start');
    for (const id of orders) { await p.evaluate(o => maru.give(o), id); await p.waitForFunction(() => !maru.busy, null, { timeout: 20000 }); }
    await p.emulateMedia({ reducedMotion: null });
    await p.tap('#read-eval');
    return p.locator('.grade').evaluateAll(els => els.map(el => [el.querySelector('.n').firstChild.textContent, el.querySelector('.l').textContent, !!el.querySelector('.best-yet'), el.style.animationName, el.style.animationDelay]));
  };

  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  assert.equal(await said('#brief-line'), null, 'a first attempt’s briefing has a line for a returning cadet');
  // A first run: its ending is new, and there is no record yet for a grade to beat.
  const first = await run(['leave']);
  assert.equal(await p.locator('#eval-title').innerText(), 'By the book');
  assert.equal(await said('#eval-firsts'), 'New ending · 1 of 9 seen');
  assert.deepEqual(first.map(g => g[2]), [false, false, false, false]);
  // The four grades arrive one after another.
  assert.deepEqual(first.map(g => g[3]), ['rise', 'rise', 'rise', 'rise']);
  assert.deepEqual(first.map(g => g[4]), ['0.15s', '0.29s', '0.43s', '0.57s']);
  assert.match(await said('#eval-moral'), /has no winning answer/);
  await p.tap('#again');
  assert.equal(await said('#brief-line'), 'Second attempt, cadet. The scenario has not changed.');
  // A second ending, and "best yet" on exactly the grades that beat the first run's.
  const second = await run(['hail-maru', 'enter', 'beam', 'beam', 'warp']);
  assert.equal(await p.locator('#eval-title').innerText(), 'The lifeboat');
  assert.equal(await said('#eval-firsts'), 'New ending · 2 of 9 seen');
  assert.deepEqual(second.map(g => g[2]), second.map((g, k) => g[1] < first[k][1]), 'the grades marked best yet are not the ones that beat the record');
  assert.ok(second.some(g => g[2]) && !second.every(g => g[2]), 'the test needs a run that beats some grades and not others');
  const mark = await p.locator('.grade .best-yet').first().boundingBox(), tile = await p.locator('.grade:has(.best-yet)').first().boundingBox();
  assert.ok(mark.x + mark.width <= tile.x + tile.width, 'the best yet mark runs out of its tile on a phone');
  await p.tap('#again');
  assert.equal(await said('#brief-line'), 'Third attempt. The board notes your persistence.');
  // The same ending again is not news, and with motion reduced the grades are simply there.
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.tap('#start');
  await p.evaluate(() => maru.give('leave'));
  await p.waitForFunction(() => !maru.busy);
  await p.tap('#read-eval');
  assert.equal(await said('#eval-firsts'), null);
  assert.deepEqual(await p.locator('.grade').evaluateAll(els => els.map(el => el.style.animationName + el.querySelectorAll('.best-yet').length)), ['0', '0', '0', '0']);
  await p.tap('#again');
  // The reprogrammed win closes on a line that fits it. It used to read "has no winning answer" straight under
  // "You are the only cadet to beat the Kobayashi Maru".
  await run(['enter', 'beam', 'beam', 'beam', 'beam', 'beam', 'beam', 'warp'], { rewritten: true });
  assert.equal(await p.locator('#eval-title').innerText(), 'Changed the rules');
  assert.equal(await said('#eval-firsts'), 'New ending · 3 of 9 seen');
  assert.match(await p.locator('#eval-note').innerText(), /You are the only cadet to beat the Kobayashi Maru/);
  assert.equal(await said('#eval-moral'), 'The Kobayashi Maru had no winning answer until you wrote one in. The examiners still haven’t seen how you face losing.');
  await p.tap('#again');
  assert.equal(await said('#brief-line'), 'The simulator’s code has been restored. The board would like a word afterwards.');
  // The endings not seen yet stay unnamed, on the briefing as on the evaluation.
  const unseen = await p.evaluate(async () => (await import('./js/maru-sim.js')).ENDINGS.filter(t => !JSON.parse(localStorage.getItem('engage.maru.v1')).seen.includes(t)));
  assert.equal(unseen.length, 6);
  for (const t of unseen) assert.ok(!(await p.locator('#brief').innerText()).toLowerCase().includes(t.toLowerCase()), `the briefing names “${t}”, which hasn’t been seen`);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  // First contact the same. A first hail's briefing is as it always was; a contact made is said on the debrief.
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(base + 'contact.html');
  await p.waitForFunction(() => window.contact);
  assert.equal(await said('#brief-line'), null, 'a first hail’s briefing has a line for a returning officer');
  const meet = async (seed, notebook) => {
    await p.evaluate(s => contact.start(s), seed);
    for (let n = 0; n < 30 && !(await p.evaluate(() => contact.game.over)); n++) {
      await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
      await p.evaluate(all => { const h = contact.hint(); if (all) for (const id of contact.game.heard) if (id !== 'story') contact.tag(id, id); if (h) { contact.pick(h); contact.send(); } else contact.act('listen'); }, notebook);
    }
    await p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
    if (notebook) await p.evaluate(() => { for (const id of contact.game.heard) if (id !== 'story') contact.tag(id, id); });
    await p.tap('#send'); // Read the debrief
    return p.evaluate(() => contact.game.lang.people);
  };
  const people = await meet(6, false);
  assert.equal(await p.locator('#eval-title').innerText(), 'First contact');
  assert.equal(await said('#eval-firsts'), 'First contact made: 1');
  await p.tap('#again');
  assert.equal(await said('#brief-line'), `Your second unknown ship. The last were the ${people}; these are not.`);
  // The second, with every phrase worked out: the best notebook yet, and a second contact. With motion back on, the
  // score arrives a moment after the verdict.
  await p.emulateMedia({ reducedMotion: null });
  await meet(9, true);
  assert.equal(await said('#eval-firsts'), 'Your best notebook yet · First contacts made: 2');
  assert.match(await p.locator('#eval-score').evaluate(el => el.style.animation), /rise/);
  await p.tap('#again');
  // After a ship that gave up on being understood, the briefing says that instead.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.contact.v1')); s.runs.push({ title: 'The channel closes', outcome: 'silence', people: 'Orru', decoded: 0, of: 5, at: new Date().toISOString(), id: 'x' }); s.met++; localStorage.setItem('engage.contact.v1', JSON.stringify(s)); });
  await p.reload();
  await p.waitForFunction(() => window.contact);
  assert.equal(await said('#brief-line'), 'Your fourth unknown ship. The last ship left without being understood.');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  // Cover your tracks: beating your best streak is said in the verdict, not left to the small score line.
  await p.goto(base + 'survey.html#drill');
  await p.waitForFunction(() => window.survey?.world);
  await p.evaluate(() => localStorage.setItem('engage.survey.v1', JSON.stringify({ best: 3, streak: 2, seen: 9 })));
  await p.reload();
  await p.waitForFunction(() => window.survey?.world);
  const answer = async right => {
    await p.evaluate(ok => { const w = survey.world; survey.answer(ok ? w.cls.id : w.choices.find(x => x.id !== w.cls.id).id); }, right);
    const line = await said('#verdict-record');
    await p.tap('#drill-next');
    return line;
  };
  assert.equal(await answer(true), null, 'equalling the best streak was called a record');
  assert.equal(await answer(true), 'Best streak yet: 4');
  assert.equal(await answer(true), 'Best streak yet: 5');
  // When the best was made is kept, for the captain's log, and answers that make no new best leave it.
  const bestAt = () => p.evaluate(() => JSON.parse(localStorage.getItem('engage.survey.v1')).bestAt);
  const made = await bestAt();
  assert.ok(made > Date.now() - 60000 && made <= Date.now());
  assert.equal(await answer(false), null);
  assert.equal(await answer(true), null);
  assert.equal(await bestAt(), made);
  // From nothing: the first right answer anyone gives beats no record; the second is the first best streak.
  await p.evaluate(() => localStorage.removeItem('engage.survey.v1'));
  await p.reload();
  await p.waitForFunction(() => window.survey?.world);
  assert.deepEqual([await answer(true), await answer(true)], [null, 'Best streak yet: 2']);
  await c.close();
}

// The lab says how rare a specimen is among its class's 9,999, and keeps a shelf of the record-holders among all
// 169,983 creatures it can grow. Nobody would find Class H's one flyer by tapping Grow another: the chance is 1 in
// 9,999 a go. (The counts are a table in js/xeno-gen.js; test/xeno.test.mjs grows every creature and holds it to them.)
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const rarity = () => p.locator('#specimen .rarity').evaluateAll(els => els.map(el => [el.textContent, el.previousElementSibling.className]));
  await p.goto(base + 'xeno.html#H-1218');
  await p.waitForFunction(() => window.xeno?.current?.seed === 1218);
  assert.deepEqual(await rarity(), [['One of a kind: the only Class H specimen that flies.', 'odds']], 'the lone desert flyer’s card does not say so under its odds');
  // The first Class M specimen that flies, and the first that doesn't.
  const [flies, walks] = await p.evaluate(async () => {
    const { grow } = await import('./js/xeno-gen.js');
    const first = ok => { for (let s = 1; s <= 9999; s++) if (ok(grow('M', s))) return s; };
    return [first(x => x.body.plan === 'flyer'), first(x => x.body.plan === 'walker')];
  });
  await p.evaluate(s => xeno.show('M', s, false), flies);
  assert.deepEqual(await rarity(), [['Uncommon: 171 of Class M’s 9,999 specimens fly.', 'odds']]);
  await p.evaluate(s => xeno.show('M', s, false), walks);
  assert.deepEqual(await rarity(), [], 'a common body plan was given a rarity line');
  // A creature grown for a real planet is outside the census, even with a record-holder's number.
  await p.evaluate(() => xeno.showWorld('Proxima b', 1218, false));
  assert.deepEqual(await rarity(), []);

  // The shelf: six records, each a link that grows its holder in the tank, whose card then says the record.
  assert.equal(await p.locator('#records-sub').innerText(), 'The lab can grow 169,983 creatures: 9,999 for each of its 17 kinds of world. These hold the records among them.');
  assert.deepEqual(await p.locator('#records li b').allTextContents(), ['Largest', 'Smallest', 'Strongest gravity', 'Tallest walker', 'Widest wings', 'One of a kind']);
  assert.deepEqual(await p.locator('#records .rec-what').allTextContents(), ['Class J · 1 km across', 'Class D · 0.5 mm long', 'Class T · lives at 25 g', 'Class K · 4.9 m tall, at 0.56 g', 'Class Y · 6.6 m from tip to tip', 'Class H · the only Class H specimen that flies']);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the records shelf pushes the lab sideways on a phone');
  for (const [k, id, said] of [[0, 'J-9258', /^Lab record: the largest of everything/], [1, 'D-8022', /^Lab record: the smallest of everything/], [2, 'T-578', /stronger gravity/],
    [3, 'K-8371', /^Lab record: the tallest of everything the lab can grow that walks/], [4, 'Y-9622', /widest wings/], [5, 'H-1218', /^One of a kind/]]) {
    const link = p.locator('#records li a').nth(k);
    await link.scrollIntoViewIfNeeded();
    assert.ok((await link.boundingBox()).height >= 44, `the ${id} record is under 44 px tall`);
    const name = await link.locator('.rec-name').innerText();
    await link.tap();
    await p.waitForFunction(want => `${xeno.current.classId}-${xeno.current.seed}` === want, id);
    assert.equal(await p.locator('#specimen h2').innerText(), name, `the shelf and the tank disagree about ${id}`);
    assert.match((await rarity()).map(r => r[0]).join(' '), said);
    assert.ok(p.url().endsWith(`#${id}`));
    // The tank is brought back on screen: the shelf is a long way down the page.
    await p.waitForFunction(() => { const r = document.getElementById('tank').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 5000 })
      .catch(() => assert.fail(`${id} was grown out of sight`));
  }
  await c.close();
}

// Red alert is the Maru's own: a red glow behind the page, with every gauge still in its colour. It shared a class
// name with night vision, so once the red light moved into the stylesheet every room loads, a red alert laid night
// vision's filter over the whole simulation: the amber hull, the cyan shields and the green count of the rescued all
// turned one red, and RED ALERT itself was red on red.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'maru.html');
  await p.waitForFunction(() => window.maru);
  await p.tap('#start');
  await p.evaluate(() => maru.give('enter'));
  await p.waitForFunction(() => !maru.busy);
  assert.equal(await p.locator('#alert').isVisible(), true, 'the test needs a red alert to mean anything');
  const look = () => p.evaluate(() => ({ filter: getComputedStyle(document.body, '::after').mixBlendMode, glow: getComputedStyle(document.body).backgroundImage.includes('74, 16, 22'), cyan: getComputedStyle(document.body).getPropertyValue('--cyan').trim() }));
  assert.deepEqual(await look(), { filter: 'normal', glow: true, cyan: '#86d8ff' }, 'a red alert put night vision’s red light over the simulation');
  // Night vision switched on in tonight's sky is not worn here, alert or no alert.
  await p.evaluate(() => localStorage.setItem('engage.tonight.v1', JSON.stringify({ night: true })));
  await p.reload();
  await p.waitForFunction(() => window.maru);
  assert.equal((await look()).filter, 'normal');
  await c.close();
}

// A long captain's log comes a day at a time, under a heading for each day ("Wednesday 18 November · 6 arrivals"),
// with the time of each arrival beside its stardate, and the newest 50 arrivals first. At 500 entries it was one
// flat list of closed cards, and every entry from the same day carried the same stardate.
{
  const long = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await long.addInitScript(() => {
    if (localStorage.getItem('engage.v1')) return;
    // 120 arrivals, one every twenty minutes, the newest an hour ago: newest first, as the bridge keeps them.
    const now = Date.now(), log = [];
    for (let n = 0; n < 120; n++) {
      const id = now - 3600000 - n * 20 * 60000;
      log.push({ id, star: 1 + (n % 40), title: `Star ${120 - n}`, stardate: '2026.880', intro: `Arrival ${120 - n}.`, sections: [['Star', 'A star.']], ly: 1 });
    }
    localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false }, log, at: 1 }));
  });
  const p = await long.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-log');
  const { dayHeading, clockTime } = await import('../js/logbook.js');
  const heads = await p.locator('#entries .day').allInnerTexts();
  const days = await p.evaluate(() => { const by = new Map(); for (const e of engage.state.log) { const d = new Date(e.id).toDateString(); by.set(d, (by.get(d) || 0) + 1); } return [...by]; });
  assert.ok(days.length >= 2, 'the log spans two days');
  // Each day of the newest 50 is headed, with the whole day's count of arrivals.
  assert.ok(heads.length >= 1 && heads.length <= days.length);
  const first = await p.evaluate(() => engage.state.log[0].id);
  assert.equal(heads[0], (await p.evaluate(([t, n]) => {
    const d = new Date(t);
    return `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')} · ${n} ${n === 1 ? 'arrival' : 'arrivals'}`;
  }, [first, days[0][1]])).toUpperCase());
  assert.equal(typeof dayHeading, 'function');
  assert.equal(await p.locator('#entries .past').count(), 50, 'the log opens on its newest 50 arrivals');
  // The newest arrival has the time it was made beside its stardate.
  assert.equal(await p.locator('#entries .past .sd').first().innerText(), `${clockTime(first)}\n2026.880`);
  // Show earlier adds 50 more, says how many are left, and goes away when there are none.
  assert.equal(await p.locator('[data-more]').innerText(), 'Show earlier · 50 more of 70');
  await p.tap('[data-more]');
  assert.equal(await p.locator('#entries .past').count(), 100);
  assert.equal(await p.evaluate(() => document.activeElement.closest('.past')?.dataset.k), '50', 'the keyboard’s place goes to the first entry it brought');
  assert.equal(await p.locator('[data-more]').innerText(), 'Show earlier · 20 more of 20');
  await p.tap('[data-more]');
  assert.equal(await p.locator('#entries .past').count(), 120);
  assert.equal(await p.locator('[data-more]').count(), 0);
  // Every arrival is under the heading of its own day.
  const placed = await p.evaluate(() => [...document.querySelectorAll('#entries .past')].map(d => {
    let h = d.previousElementSibling;
    while (h && !h.matches('.day')) h = h.previousElementSibling;
    return [new Date(engage.state.log[Number(d.dataset.k)].id).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }), h.textContent];
  }));
  assert.ok(placed.every(([d, h]) => h.includes(d)), 'an arrival under another day’s heading');
  // Closed and opened again, the log is back to its newest 50.
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-log');
  assert.equal(await p.locator('#entries .past').count(), 50);
  // Coming back from a room to an entry further back than the first 50: it is shown, open, and in view.
  const mark = await p.evaluate(() => { const e = engage.state.log[73]; return { sheet: 'log', id: e.id, stardate: e.stardate, star: e.star, scroll: 0, at: Date.now() }; });
  await p.evaluate(m => sessionStorage.setItem('engage.return', JSON.stringify(m)), mark);
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.locator('#entries .past').count(), 100);
  assert.equal(await p.locator('.past[data-k="73"]').evaluate(d => d.open), true);
  assert.equal(await p.locator('.past[open]').count(), 1);
  assert.ok(await p.locator('.past[data-k="73"] summary').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'the entry come back to is out of sight');
  await long.close();
}

// Past 30 entries the log can be searched, and shown by star: one row for each star with how many visits and when,
// opening on the newest entry for it. A star visited 60 times used to appear 60 times.
{
  const stars = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await stars.addInitScript(() => {
    if (localStorage.getItem('engage.v1')) return;
    const now = Date.now(), log = [];
    for (let n = 0; n < 31; n++) {
      const star = n % 3 === 0 ? 2 : 3 + n; // every third arrival at the same star
      log.push({ id: now - 3600000 - n * 6 * 3600000, star, title: star === 2 ? 'Often' : `Star ${n}`, stardate: '2026.880', intro: `Arrival ${n}.`, sections: [['Star', n === 7 ? 'A blue straggler.' : 'A star.']], ly: 1 });
    }
    localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false }, log: log.slice(1), at: 1 }));
    sessionStorage.setItem('whole', JSON.stringify(log[0]));
  });
  const p = await stars.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  // Thirty entries: no search and no By star yet (the chart is there for any log).
  await p.tap('#open-log');
  assert.deepEqual([await p.locator('#log-search').isHidden(), await p.locator('#log-by-star').isHidden(), await p.locator('#log-chart').isVisible()], [true, true, true]);
  await p.evaluate(() => { engage.closeSheets(); engage.state.log.unshift(JSON.parse(sessionStorage.getItem('whole'))); });
  await p.tap('#open-log');
  assert.equal(await p.locator('#log-tools').isVisible(), true);
  assert.equal(await p.locator('#log-by-day').getAttribute('aria-pressed'), 'true');
  // By star: eleven visits to one star make one row, first, since it was visited last.
  await p.tap('#log-by-star');
  assert.equal(await p.locator('#log-by-star').getAttribute('aria-pressed'), 'true');
  const rows = await p.locator('#entries .past').evaluateAll(els => els.map(d => [d.querySelector('b').textContent, d.querySelector('.sd').textContent]));
  assert.equal(rows.length, 21);
  assert.deepEqual(rows[0], ['Often', '11 visits']);
  assert.deepEqual(rows[1], ['Star 1', '1 visit']);
  assert.match(await p.locator('#entries .past summary > span:last-child').first().innerText(), /^Last \d{1,2} \w{3} · first \d{1,2} \w{3}$/);
  assert.equal(await p.locator('#records').count(), 1, 'the records stay at the head of the log');
  // A row opens on the newest entry for its star, which can be acted on as any entry can.
  await p.locator('#entries .past summary').first().tap();
  assert.equal(await p.locator('#entries .past').first().locator('.intro-line').innerText(), 'Arrival 0.');
  assert.equal(await p.locator('#entries .past').first().getByRole('button', { name: 'Set course again' }).count(), 1);
  // A search: the stars whose entries mention it.
  await p.locator('#log-search').fill('straggler');
  assert.deepEqual(await p.locator('#entries .past b').allInnerTexts(), ['Star 7']);
  assert.equal(await p.locator('#records').count(), 0, 'a search shows only what it found');
  // By day, the same search: the one arrival, under its day with no count.
  await p.tap('#log-by-day');
  assert.deepEqual(await p.locator('#entries .past b').allInnerTexts(), ['Star 7']);
  assert.doesNotMatch(await p.locator('#entries .day').innerText(), /arrival/i);
  await p.locator('#log-search').fill('nowhere at all');
  assert.equal(await p.locator('#entries .empty').innerText(), 'Nothing in the log mentions “nowhere at all”.');
  await p.locator('#log-search').fill('');
  assert.equal(await p.locator('#entries .past').count(), 31);
  // The log opens by day, with nothing searched for, whatever it was left on.
  await p.locator('#log-search').fill('often');
  await p.tap('#log-by-star');
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-log');
  assert.deepEqual([await p.locator('#log-search').inputValue(), await p.locator('#log-by-day').getAttribute('aria-pressed')], ['', 'true']);
  await stars.close();
}

// Stellar cartography: the log's Chart shows every star visited from above the galaxy, home in the middle. A tap on a
// star names it with Set course again, which closes the log on the helm with that star chosen. A star with no
// measured distance is left off and the chart says so. Save chart hands the phone's share sheet a picture.
{
  const chart = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await chart.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await chart.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const unmeasured = await p.evaluate(() => { const c = engage.cat(); const i = c.unmeasured.findIndex((u, k) => u && /^HIP /.test(c.names[k])); return c.names[i]; });
  await p.evaluate(names => { for (const name of names) { engage.jump(name); engage.closeSheets(); } }, ['Vega', 'Deneb', unmeasured, 'Sirius']);
  await p.tap('#open-log');
  // A short log: By day and Chart, no By star yet.
  assert.deepEqual(await p.locator('#log-view button:visible').allInnerTexts(), ['By day', 'Chart'].map(t => t.toUpperCase()));
  await p.tap('#log-chart');
  assert.equal(await p.locator('#log-chart').getAttribute('aria-pressed'), 'true');
  assert.equal(await p.locator('#log-search').isHidden(), true);
  assert.equal(await p.locator('#chart-line').innerText(), '3 stars charted, the farthest Deneb, 1,412 light years out. One star with no measured distance is left off: nobody knows where to draw it.');
  assert.match(await p.locator('#chart-map').getAttribute('aria-label'), /^A chart of the stars in the log, seen from above the galaxy\. 3 stars charted/);
  const box = await p.locator('#chart-map').boundingBox();
  assert.ok(box.width >= 300 && Math.abs(box.width - box.height) < 1, `the chart is ${box.width} × ${box.height}`);
  assert.equal(await p.evaluate(() => document.querySelector('#entries').scrollWidth <= document.querySelector('#entries').clientWidth), true, 'the chart is wider than the log');
  const dots = await p.evaluate(() => engage.chartDots());
  assert.deepEqual(dots.map(d => d.name).sort(), ['Deneb', 'Sirius', 'Vega']);
  // Deneb, in Cygnus, is off to the left of home; the galactic centre is up.
  const deneb = dots.find(d => d.name === 'Deneb');
  assert.ok(deneb.x < box.width / 2, 'Deneb is not on the Cygnus side');
  const vega = dots.find(d => d.name === 'Vega');
  await p.touchscreen.tap(box.x + vega.x + 3, box.y + vega.y + 2);
  assert.match(await p.locator('#chart-pick').innerText(), /^Vega · 25 light years from Sol · 1 visit/);
  // The ship is at Sirius: no course to set for where it is.
  const sirius = dots.find(d => d.name === 'Sirius');
  await p.touchscreen.tap(box.x + sirius.x, box.y + sirius.y);
  assert.match(await p.locator('#chart-pick').innerText(), /the ship is here$/);
  await p.touchscreen.tap(box.x + 4, box.y + box.height - 4);
  assert.equal(await p.locator('#chart-pick').innerText(), 'Tap a star to set course for it again.');
  // Save chart: a PNG, to the share sheet.
  await p.evaluate(() => { navigator.canShare = () => true; navigator.share = async d => { window.sharedChart = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, title: d.title }; }; });
  await p.tap('#chart-save');
  await p.waitForFunction(() => window.sharedChart);
  const saved = await p.evaluate(() => window.sharedChart);
  assert.deepEqual([saved.name, saved.type, saved.title], ['captains-log-chart.png', 'image/png', 'Captain’s log: stellar cartography']);
  assert.ok(saved.size > 20000, `the chart's picture is only ${saved.size} bytes`);
  // Set course again from the chart.
  await p.locator('#chart-map').scrollIntoViewIfNeeded();
  const now = await p.locator('#chart-map').boundingBox();
  await p.touchscreen.tap(now.x + vega.x, now.y + vega.y);
  await p.locator('#chart-pick [data-again]').tap();
  assert.equal(await p.locator('#log').isHidden(), true);
  assert.equal(await p.evaluate(() => engage.cat().names[engage.state.target]), 'Vega');
  // The log opens by day again.
  await p.tap('#open-log');
  assert.equal(await p.locator('#log-by-day').getAttribute('aria-pressed'), 'true');
  await chart.close();
}

// Print the log lays the whole log out as a booklet, oldest first, black on white, one entry to a block: on a phone,
// the same is how to save it as a PDF. The viewscreen and the sheets are not printed.
{
  const booklet = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await booklet.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await booklet.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  // Nothing logged: nothing to print.
  await p.tap('#open-log');
  assert.equal(await p.locator('#log-tools').isHidden(), true);
  await p.evaluate(() => engage.closeSheets());
  await p.evaluate(() => { for (const name of ['Vega', 'Altair', 'Sol']) { engage.jump(name); engage.closeSheets(); } });
  await p.tap('#open-log');
  // A short log has Print the log and the chart, and no search yet.
  assert.deepEqual(await p.locator('#log-tools > *').evaluateAll(els => els.map(el => [el.id, !el.hidden])), [['log-search', false], ['log-view', true], ['log-print', true]]);
  await p.evaluate(() => { window.printed = 0; window.print = () => { window.printed++; }; });
  await p.tap('#log-print');
  assert.equal(await p.evaluate(() => window.printed), 1);
  const book = await p.locator('#print-log').evaluate(el => ({
    title: el.querySelector('h1').textContent, sub: el.querySelector('.print-sub').textContent, days: [...el.querySelectorAll('h2')].map(h => h.textContent),
    stars: [...el.querySelectorAll('article h3')].map(h => h.textContent), sections: el.querySelectorAll('article dt').length,
  }));
  assert.equal(book.title, 'Captain’s log');
  assert.match(book.sub, /^3 stars visited · .* travelled · printed \d{1,2} \w+ \d{4}$/);
  assert.deepEqual(book.stars, ['Vega', 'Altair', 'Sol'], 'the booklet reads oldest first');
  assert.match(book.days[0], /^\w+day \d{1,2} \w+ · 3 arrivals$/);
  assert.ok(book.sections >= 9, 'the entries are printed whole');
  // Printed, only the booklet shows, in black on white, and the log sheet, the helm and the viewscreen don't.
  await p.emulateMedia({ media: 'print' });
  const printedLook = await p.evaluate(() => ({
    book: getComputedStyle(document.getElementById('print-log')).display,
    hidden: ['bridge', 'log', 'say'].map(id => getComputedStyle(document.getElementById(id)).display),
    ink: getComputedStyle(document.querySelector('#print-log article')).color, paper: getComputedStyle(document.body).backgroundColor,
  }));
  assert.deepEqual(printedLook, { book: 'block', hidden: ['none', 'none', 'none'], ink: 'rgb(0, 0, 0)', paper: 'rgb(255, 255, 255)' });
  await p.emulateMedia({ media: 'screen' });
  assert.equal(await p.locator('#print-log').isHidden(), true, 'the booklet shows on screen');
  // Afterwards it is let go.
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  assert.equal(await p.locator('#print-log').innerHTML(), '');
  // The browser's own Print lays it out too.
  await p.evaluate(() => dispatchEvent(new Event('beforeprint')));
  assert.equal(await p.locator('#print-log article').count(), 3);
  await booklet.close();
}

// Every room adds a line to the captain's log when something in it finishes, among the arrivals by when it happened:
// "Supplemental: sat the Kobayashi Maru. The lifeboat, 150 home, C B B B." Each room kept its own record, and the log
// never mentioned any of it. The lines are read from the rooms' own records each time the log is drawn: nothing
// more is saved.
{
  const story = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await story.addInitScript(() => {
    if (localStorage.getItem('engage.v1')) return;
    const now = Date.now(), ago = m => now - m * 60000; // minutes
    const entry = (h, star, title) => ({ id: ago(h), star, title, stardate: '2026.880', intro: `At ${title}.`, sections: [['Star', 'A star.']], ly: 4 });
    localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false }, at: 1, log: [entry(20, 1, 'Newer'), entry(50, 2, 'Older')] }));
    localStorage.setItem('engage.maru.v1', JSON.stringify({ runs: [{ title: 'The lifeboat', outcome: 'escaped', line: 'Kobayashi Maru: The lifeboat, 150 home, C B B B', grades: [], at: new Date(ago(35)).toISOString(), id: 'a' }], taken: 1, seen: ['The lifeboat'] }));
    localStorage.setItem('engage.contact.v1', JSON.stringify({ runs: [{ title: 'First contact', outcome: 'contact', people: 'Qaethuk', decoded: 9, of: 11, at: new Date(ago(10)).toISOString(), id: 'b', seed: 5 }], met: 1, contacts: 1 }));
  });
  const p = await story.newPage();
  p.on('pageerror', e => problems.push(e.message));
  // A creature kept in the lab goes into the log too.
  await p.goto(base + 'xeno.html#M-42');
  await p.waitForFunction(() => window.xeno);
  await p.click('#keep');
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-log');
  const items = () => p.locator('#entries > .past, #entries > .supp').evaluateAll(els => els.map(el => (el.matches('.supp') ? el.textContent.trim() : el.querySelector('b').textContent)));
  assert.deepEqual(await items(), [
    'Supplemental: kept a creature from a Class M world in a jar.',
    'Supplemental: answered a hail from the Qaethuk. First contact, 9 of 11 phrases decoded.',
    'Newer',
    'Supplemental: sat the Kobayashi Maru. The lifeboat, 150 home, C B B B.',
    'Older',
  ]);
  // The days' headings count the arrivals only, and each line leads to what it is about.
  const counted = (await p.locator('#entries .day').allInnerTexts()).join(' ');
  assert.equal([...counted.matchAll(/(\d+) ARRIVALS?/g)].reduce((n, m) => n + Number(m[1]), 0), 2);
  assert.doesNotMatch(counted, /SUPPLEMENTAL/);
  assert.deepEqual(await p.locator('#entries .supp a').evaluateAll(as => as.map(a => a.getAttribute('href'))), ['xeno.html#M-42', 'contact.html', 'maru.html']);
  // A search finds them, and the booklet prints them.
  if (await p.locator('#log-search').isVisible()) throw new Error('a two-entry log has a search');
  await p.evaluate(() => dispatchEvent(new Event('beforeprint')));
  assert.equal(await p.locator('#print-log .supp').count(), 3);
  assert.equal(await p.locator('#print-log .supp').first().innerText(), 'Supplemental: sat the Kobayashi Maru. The lifeboat, 150 home, C B B B.', 'the booklet reads oldest first');
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  // Nothing about them was saved with the bridge's log.
  assert.ok(!/Supplemental/.test(await p.evaluate(() => localStorage.getItem('engage.v1'))));
  // Followed, a line goes to its room.
  await Promise.all([p.waitForNavigation(), p.locator('#entries .supp a').nth(2).tap()]);
  assert.match(p.url(), /maru\.html$/);
  await story.close();
}

// One sentence at the head of the captain's log sums the voyage up, from every room's record: "First day out: two
// stars, one new species, one failed exam."
{
  const told = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await told.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await told.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-log');
  assert.equal(await p.locator('#story').count(), 0, 'nothing done, and a sentence about it');
  await p.evaluate(() => engage.closeSheets());
  await p.evaluate(() => { for (const name of ['Vega', 'Altair', 'Vega']) { engage.jump(name); engage.closeSheets(); } });
  await p.tap('#open-log');
  assert.equal(await p.locator('#story').innerText(), 'First day out: two stars.');
  await p.evaluate(() => engage.closeSheets());
  // A Kobayashi Maru run and a first contact, from those rooms' own records.
  await p.evaluate(() => {
    localStorage.setItem('engage.maru.v1', JSON.stringify({ runs: [{ title: 'The lifeboat', outcome: 'escaped', grades: [], at: new Date().toISOString(), id: 'a' }], taken: 1 }));
    localStorage.setItem('engage.contact.v1', JSON.stringify({ runs: [{ title: 'First contact', outcome: 'contact', people: 'Qaethuk', decoded: 9, of: 11, at: new Date().toISOString(), id: 'b', seed: 5 }], met: 1, contacts: 1 }));
  });
  await p.tap('#open-log');
  assert.equal(await p.locator('#story').innerText(), 'First day out: two stars, one new species, one failed exam.');
  // It heads the log, under Today on the bridge and above the records.
  const heads = await p.locator('#entries > *').evaluateAll(els => els.map(el => el.id));
  assert.ok(heads[0] === 'today' && heads[1] === 'story' && heads.indexOf('records') > 1, heads.join());
  await told.close();
}

// The service record, at the head of the captain's log: a row for each room that keeps a record, read from it, each
// leading to its room. Each room kept its own record and none knew the others; nothing gave a reason to open a
// second room. It reads the other rooms and saves nothing of its own: what has been earned (see Today on the bridge,
// below) goes in the bridge's save.
{
  const career = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await career.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await career.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-log');
  assert.equal(await p.locator('#service').count(), 0, 'a service record with nothing on it');
  await p.evaluate(() => engage.closeSheets());
  const rows = () => p.locator('#service li a').evaluateAll(as => as.map(a => [a.querySelector('b').textContent, a.querySelector('span').textContent, a.getAttribute('href')]));
  // One arrival: the card is there, and says what the other rooms are waiting for.
  await p.evaluate(() => { engage.jump('Vega'); engage.closeSheets(); });
  await p.tap('#open-log');
  assert.deepEqual(await rows(), [
    ['Kobayashi Maru', 'Not sat yet', 'maru.html'], ['First contact', 'No one met yet', 'contact.html'], ['Cover your tracks', 'Not played yet', 'survey.html#drill'],
    ['Xenobiology lab', 'No creatures kept yet', 'xeno.html'], ['Long missions', 'No ships hailed yet', 'missions.html'],
    ['Hails to stars', 'No stars hailed yet', 'radio.html#hail'], ['Distress calls', 'No calls answered yet', 'distress.html'],
    ['The long way home', 'Not home yet', 'longway.html'], ['Main engineering', 'No shifts stood yet', 'engineering.html'],
    ['The Prime Directive', 'No hearings yet', 'directive.html'], ['The shipyard', 'No ships designed yet', 'shipyard.html'],
  ]);
  await p.evaluate(() => engage.closeSheets());
  const before = await p.evaluate(() => Object.keys(localStorage).sort());
  await p.evaluate(() => {
    localStorage.setItem('engage.maru.v1', JSON.stringify({ runs: [{ title: 'The lifeboat', outcome: 'escaped', grades: [], at: new Date().toISOString(), id: 'a' }], taken: 1, seen: ['The lifeboat'], best: { Compassion: 'C', Judgment: 'B', Restraint: 'B', Nerve: 'A' } }));
    localStorage.setItem('engage.survey.v1', JSON.stringify({ best: 4, streak: 1, seen: 9 }));
    localStorage.setItem('engage.missions.v1', JSON.stringify({ hails: { v1: Date.now() - 60000, nh: Date.now() - 120000 } }));
    localStorage.setItem('engage.distress.v1', JSON.stringify({ answered: 1, rescued: 1, calls: [{ day: null, star: 'Procyon', found: true, air: 42, open: 3, wrong: 0, at: new Date(Date.now() - 30000).toISOString() }] }));
    localStorage.setItem('engage.longway.v1', JSON.stringify({ trip: null, best: 58.25, homes: 1, arrivals: [{ at: new Date(Date.now() - 20000).toISOString(), years: 58.25, nebula: 3, world: 2 }] }));
  });
  await p.tap('#open-log');
  assert.deepEqual((await rows()).map(r => r[1]), ['1 of 9 endings · best C B B A', 'No one met yet', 'Best streak 4', 'No creatures kept yet', 'Two ships hailed', 'No stars hailed yet', 'Rescued 1 of 1 call', 'Home once · best 58 years 3 months', 'No shifts stood yet', 'No hearings yet', 'No ships designed yet']);
  // A rescue and a trip home each have their line in the log, leading to their room.
  assert.deepEqual(await p.locator('#entries .supp a').evaluateAll(as => as.filter(a => /^(longway|distress)/.test(a.getAttribute('href'))).map(a => [a.textContent, a.getAttribute('href')])), [
    ['Supplemental: home from the Delta Quadrant in 58 years 3 months.', 'longway.html'],
    ['Supplemental: answered a distress call. Found at Procyon with 42% of their air left.', 'distress.html'],
  ]);
  // It sits under the voyage's sentence and over the log's own records, and every row is a 44 px tap.
  assert.deepEqual(await p.locator('#entries > *').evaluateAll(els => els.slice(0, 4).map(el => el.id)), ['today', 'story', 'service', 'records']);
  assert.ok((await p.locator('#service li a').evaluateAll(as => as.map(a => a.getBoundingClientRect().height))).every(h => h >= 44));
  assert.deepEqual(await p.evaluate(() => Object.keys(localStorage).sort()), [...before, 'engage.maru.v1', 'engage.missions.v1', 'engage.survey.v1', 'engage.distress.v1', 'engage.longway.v1'].sort(), 'the service record saved something of its own');
  await Promise.all([p.waitForNavigation(), p.locator('#service a[data-room="survey"]').tap()]);
  assert.match(p.url(), /survey\.html#drill$/);
  await career.close();
}

// The five-year mission clock, a setting that starts off: each arrival adds the trip's ship time, the helm shows
// "Year 2, day 114 of 5" where the stardate was, and the arrival that reaches five years closes the mission with a
// summary in the log; the next trip starts the next. A slow warp factor costs months of it. Nothing is deleted, and
// the clock is worked out from the log: only the warp factor of each trip is kept with it.
{
  const five = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await five.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await five.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  const when = () => p.locator('#when span').first().innerText();
  assert.match(await when(), /^Stardate \d{4}\.\d{3}$/, 'the clock is on before anyone asked for it');
  await p.tap('#open-settings');
  assert.equal(await p.locator('#opt-clock').isChecked(), false);
  await p.locator('#opt-clock').check();
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).opts.clock), true);
  await p.evaluate(() => engage.closeSheets());
  assert.equal(await when(), 'Year 1, day 1 of 5');
  // From Earth, Betelgeuse at warp 6 costs fifteen months of the mission; at warp 9.9, about two months.
  await p.evaluate(() => engage.target('Betelgeuse'));
  await p.locator('#warp').fill('6');
  assert.match(await p.locator('#trip').innerText(), / · 15 months at this warp · arriving year 2, day 99 · light takes/);
  await p.locator('#warp').fill('9.9');
  assert.match(await p.locator('#trip').innerText(), / · arriving year 1, day \d+ · /);
  // At light speed: Proxima Centauri takes 4 years and 3 months, and Barnard's Star from there is past five.
  await p.evaluate(() => { engage.jump('Proxima Centauri', 1); engage.closeSheets(); });
  assert.match(await when(), /^Year 5, day \d+ of 5$/);
  assert.equal(await p.evaluate(() => engage.state.log[0].warp), 1, 'the trip’s warp factor was not kept');
  await p.locator('#warp').fill('1');
  await p.evaluate(() => engage.target("Barnard's Star"));
  assert.match(await p.locator('#trip').innerText(), / · ends the five-year mission · /);
  await p.evaluate(() => engage.jump("Barnard's Star", 1));
  assert.ok((await p.locator('#arrival .firsts').innerText()).includes('Five-year mission complete'));
  await p.evaluate(() => engage.closeSheets());
  assert.equal(await when(), 'Year 1, day 1 of 5');
  // The log: the mission's sentence, the clock heading the service record, and the closed mission's summary over the
  // arrival that closed it.
  await p.tap('#open-log');
  assert.equal(await p.locator('#story').innerText(), 'Year 1, day 1: mission two begins with the next trip.');
  assert.equal(await p.locator('#service-clock').innerText(), 'Mission 2 · Year 1, day 1 of 5 · one complete');
  const order = await p.locator('#entries > .past, #entries > .mission-end').evaluateAll(els => els.map(el => el.querySelector('b').textContent));
  assert.deepEqual(order, ['Mission 1 complete', 'Barnard’s Star', 'Proxima Centauri']);
  assert.equal(await p.locator('.mission-end summary span').innerText(), 'Two stars · 10.8 ly');
  await p.locator('.mission-end summary').tap();
  const rows = await p.locator('.mission-end dl > div').evaluateAll(ds => ds.map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
  assert.deepEqual(rows.map(r => r[0]), ['Ship time', 'Logged', 'Arrivals', 'Farthest from Sol', 'Longest trip']);
  assert.equal(rows[0][1], '10 years, 9 months');
  assert.equal(rows[2][1], '2');
  await p.evaluate(() => engage.closeSheets());
  // The next trip counts toward mission two.
  await p.evaluate(() => { engage.jump('Sol', 9); engage.closeSheets(); });
  assert.match(await when(), /^Year 1, day \d+ of 5$/);
  // Off again, the stardate is back and the log has no missions in it; the log itself is just as it was.
  await p.tap('#open-settings');
  await p.locator('#opt-clock').uncheck();
  await p.evaluate(() => engage.closeSheets());
  assert.match(await when(), /^Stardate /);
  await p.tap('#open-log');
  assert.equal(await p.locator('.mission-end, #service-clock').count(), 0);
  assert.equal(await p.locator('#entries .past').count(), 3);
  await five.close();
}

// Your ship can have a name and a registry, in Bridge settings, and the rooms that speak of her use them: the Kobayashi
// Maru's briefing ("You command the USS Calypso"), first contact ("off the Calypso's bow"), the captain's log and your
// lane on the warp scale. She had no name anywhere. Unnamed, every room says what it always said.
{
  const yard = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await yard.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await yard.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const rooms = async () => {
    await p.goto(base + 'maru.html');
    await p.waitForFunction(() => window.maru);
    const maru = await p.locator('#your-ship').innerText();
    await p.goto(base + 'contact.html');
    await p.waitForFunction(() => window.contact);
    const contact = await p.locator('#brief-where').innerText();
    await p.goto(base + 'warp.html');
    await p.waitForFunction(() => window.warpScale?.trip);
    const lane = await p.evaluate(() => warpScale.trip.lanes.find(l => l.id === 'custom').label);
    return { maru, contact, lane };
  };
  assert.deepEqual(await rooms(), { maru: 'a starship', contact: 'A ship of no known design has dropped out of warp off your bow, in Earth orbit, and she’s hailing you.', lane: 'Warp 9' });
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-settings');
  assert.match(await p.locator('#ship-said').innerText(), /^Name her, and/);
  await p.locator('#ship-name').fill('Calypso ');
  await p.locator('#ship-registry').fill('ncc-74210');
  assert.equal(await p.locator('#ship-said').innerText(), 'The rooms speak of her as the USS Calypso, NCC-74210.');
  await p.locator('#ship-registry').blur();
  assert.equal(await p.locator('#ship-registry').inputValue(), 'NCC-74210');
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).ship), { name: 'Calypso', registry: 'NCC-74210' });
  await p.evaluate(() => engage.closeSheets());
  await p.evaluate(() => engage.jump('Vega'));
  assert.match(await p.locator('#arrival-date').innerText(), /^Captain’s log, USS Calypso · Stardate \d{4}\.\d{3}$/i);
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-log');
  assert.equal(await p.locator('#service-head').innerText(), 'SERVICE RECORD · USS CALYPSO, NCC-74210');
  // A new log is the same ship.
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-settings');
  await p.tap('#clear-log');
  await p.tap('#clear-log');
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).ship), { name: 'Calypso', registry: 'NCC-74210' });
  assert.deepEqual(await rooms(), { maru: 'the USS Calypso', contact: 'A ship of no known design has dropped out of warp off the Calypso’s bow, in Earth orbit, and she’s hailing you.', lane: 'Warp 9 · USS Calypso' });
  // Her name taken away, the rooms speak as before.
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-settings');
  await p.locator('#ship-name').fill('');
  assert.equal(await p.evaluate(() => 'ship' in JSON.parse(localStorage.getItem('engage.v1'))), false);
  assert.equal((await rooms()).maru, 'a starship');
  await yard.close();
}

// Ship's records: Save a copy downloads one dated file of everything Engage keeps; Restore from a copy reads it back,
// says what is in it, and offers Add to what's here or Replace, each asked twice. Everything lived in one browser on
// one device: a lost phone, a cleared browser, or the move to the installed copy on an iPhone, and it was gone.
{
  const old = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  await old.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await old.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => {
    for (const name of ['Vega', 'Altair']) { engage.jump(name); engage.closeSheets(); }
    localStorage.setItem('engage.xeno.v1', JSON.stringify({ jars: [{ id: 'M', seed: 42, at: new Date().toISOString() }] }));
    localStorage.setItem('engage.maru.v1', JSON.stringify({ runs: [{ id: 'a', title: 'The lifeboat', outcome: 'escaped', grades: [], at: new Date().toISOString() }], taken: 3, seen: ['The lifeboat'] }));
    localStorage.setItem('engage.oneswitch', 'on');
    localStorage.setItem('another-tool.v1', 'not ours');
  });
  await p.tap('#open-settings');
  const [download] = await Promise.all([p.waitForEvent('download'), p.tap('#records-save')]);
  const { fileName } = await import('../js/records.js');
  assert.equal(download.suggestedFilename(), fileName());
  const file = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual([file.format, file.version, Object.keys(file.keys).sort()], ['Engage ship’s records', 1, ['engage.maru.v1', 'engage.oneswitch', 'engage.v1', 'engage.xeno.v1']]);
  assert.equal(file.keys['engage.v1'].log.length, 2);
  assert.equal(await p.locator('#records-said').innerText(), `Saved 2 log entries, 1 creature in a jar, 3 simulations, as ${fileName()}.`);
  const copy = { name: download.suggestedFilename(), mimeType: 'application/json', buffer: await readFile(await download.path()) }; // the download goes with its context
  await old.close();

  // A new phone: one arrival of its own, then the copy added to it.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await fresh.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const q = await fresh.newPage();
  q.on('pageerror', e => problems.push(e.message));
  await q.goto(base);
  await bridgeReady(q);
  await q.evaluate(() => { engage.jump('Sirius'); engage.closeSheets(); localStorage.setItem('engage.survey.v1', JSON.stringify({ best: 4, streak: 0, seen: 7 })); });
  await q.tap('#open-settings');
  // Not a copy: said so, and nothing offered.
  await q.locator('#records-file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await q.waitForFunction(() => document.getElementById('records-said').textContent);
  assert.equal(await q.locator('#records-said').innerText(), 'That file isn’t a copy of Engage’s records.');
  assert.equal(await q.locator('#records-found').isHidden(), true);
  await q.locator('#records-file').setInputFiles(copy);
  await q.waitForFunction(() => !document.getElementById('records-found').hidden);
  assert.match(await q.locator('#records-what').innerText(), /^This copy, saved \d{1,2} \w+ \d{4}, holds 2 log entries, 1 creature in a jar, 3 simulations\.$/);
  // One tap only arms it.
  await q.tap('#records-add');
  assert.equal(await q.locator('#records-add').innerText(), 'TAP AGAIN TO ADD IT');
  assert.equal(await q.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).log.length), 1);
  await Promise.all([q.waitForNavigation(), q.tap('#records-add')]);
  await bridgeReady(q);
  // Back with both logs, newest first, the survey's streak still here, and settings saying what came back.
  assert.deepEqual(await q.evaluate(() => engage.state.log.map(e => e.title)), ['Sirius', 'Altair', 'Vega']);
  assert.equal(await q.evaluate(() => JSON.parse(localStorage.getItem('engage.survey.v1')).best), 4);
  assert.equal(await q.evaluate(() => localStorage.getItem('engage.oneswitch')), 'on');
  assert.equal(await q.locator('#settings').isVisible(), true);
  assert.equal(await q.locator('#records-said').innerText(), 'Added from your copy: 2 log entries, 1 creature in a jar, 3 simulations.');
  // A browser with no room for the copy: nothing is half restored, and what was here is all still here.
  const kept = await q.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  await q.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'engage.xeno.v1' && !window.room) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await q.locator('#records-file').setInputFiles(copy);
  await q.waitForFunction(() => !document.getElementById('records-found').hidden);
  await q.tap('#records-replace');
  await q.tap('#records-replace');
  assert.equal(await q.locator('#records-said').innerText(), 'This browser’s storage is full, so the copy wasn’t restored, and nothing here was changed. Clearing the log makes room.');
  assert.deepEqual(await q.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))), kept);
  await q.evaluate(() => { window.room = true; });
  // Replace: only what the copy has. The survey's record goes, and the log is the copy's.
  await q.locator('#records-file').setInputFiles(copy);
  await q.waitForFunction(() => !document.getElementById('records-found').hidden);
  await q.tap('#records-replace');
  assert.equal(await q.locator('#records-replace').innerText(), 'TAP AGAIN TO REPLACE EVERYTHING HERE');
  await Promise.all([q.waitForNavigation(), q.tap('#records-replace')]);
  await bridgeReady(q);
  assert.deepEqual(await q.evaluate(() => engage.state.log.map(e => e.title)), ['Altair', 'Vega']);
  assert.equal(await q.evaluate(() => localStorage.getItem('engage.survey.v1')), null);
  assert.equal(await q.locator('#records-said').innerText(), 'Restored from your copy: 2 log entries, 1 creature in a jar, 3 simulations.');
  // The ship is where the copy left her, at Altair.
  assert.equal(await q.locator('#where').innerText(), 'Altair');
  await fresh.close();
}

// Planets as places. The system view opens at the star the ship is holding at, flown in to the planet the bridge
// holds in the orbit of; a planet tapped in the list is flown in to, with its readings and a way down; the placed
// planet is filed by where it sits; the away team stands on the world, with its sun, its readings, the lab's
// creature and, on the night side, the Sun marked; and the survey's Your stars lists the stars in the log.
{
  const sv = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sv.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await sv.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => engage.jump('TRAPPIST-1'));
  await p.evaluate(() => engage.jump('Vega'));
  await p.evaluate(() => engage.jump('TRAPPIST-1'));
  await p.goto(base + 'system.html');
  await p.waitForFunction(() => window.systemView?.ready);
  assert.equal(await p.evaluate(() => systemView.star), 'TRAPPIST-1', 'the system view did not open where the ship is');
  assert.equal(await p.evaluate(() => systemView.selected), 'TRAPPIST-1 e', 'it did not fly in to the planet the bridge holds at');
  assert.equal(await p.title(), 'TRAPPIST-1 · System view · Engage');
  assert.equal(await p.locator('#planet-list button').count(), 7);
  assert.match(await p.locator('#close-text').innerText(), /In it: the zone where water could be liquid runs from 0\.026 AU to 0\.051 AU here/);
  await p.tap('#planet-list button:has-text("TRAPPIST-1 b")');
  assert.equal(await p.evaluate(() => systemView.selected), 'TRAPPIST-1 b');
  assert.equal(await p.locator('#planet-list button[aria-pressed="true"]').innerText().then(t => t.split('\n')[0]), 'TRAPPIST-1 b');
  assert.match(await p.locator('#close-text').innerText(), /Too close: the zone/);
  assert.equal(await p.locator('#close-text a.beam').getAttribute('href'), 'away.html#world=TRAPPIST-1%20b');
  await p.waitForFunction(() => systemView.painted === 7, null, { timeout: 20000 });
  // Flying from planet to planet keeps one drawing loop going, not one more for every planet tapped: each frame asks
  // for the next about once, against a counter of our own that asks once a frame too.
  const loops = await p.evaluate(async () => {
    for (const n of 'cdefgh') systemView.select(`TRAPPIST-1 ${n}`);
    const ask = window.requestAnimationFrame.bind(window);
    let asked = 0, frames = 0, on = true;
    window.requestAnimationFrame = cb => { asked++; return ask(cb); };
    const count = () => { frames++; if (on) ask(count); };
    ask(count);
    await new Promise(r => setTimeout(r, 1000));
    on = false;
    window.requestAnimationFrame = ask;
    return asked / Math.max(1, frames);
  });
  assert.ok(loops < 1.5, `the fly-in draws ${loops.toFixed(1)} times a frame after seven planets: its drawing loops pile up`);
  // Home: Earth, and a giant with no ground; the scale reaches the giants only when asked.
  await p.goto(base + 'system.html#star=Sol');
  await p.waitForFunction(() => window.systemView?.ready && systemView.star === 'Sol');
  assert.equal(await p.evaluate(() => systemView.selected), 'Earth');
  assert.ok(await p.locator('#scale-pick').isVisible(), 'the Sun’s system offers no choice of scale');
  await p.tap('#planet-list button:has-text("Jupiter")');
  assert.equal(await p.locator('#close-text a.beam').count(), 0, 'a giant offers a way down');
  assert.match(await p.locator('#close-text').innerText(), /no ground to stand on/);
  // Placing a planet: an Earth at 1 AU from the Sun is on the Class M file; moved to 3 AU it freezes over.
  await p.evaluate(() => systemView.place(1, 'earth'));
  assert.match(await p.locator('#place-filed').innerText(), /^It would go on the Class M file, if it has air and water/);
  await p.evaluate(() => systemView.place(3));
  assert.equal(await p.locator('#place-filed').innerText(), 'It would go on the Class P file: frozen over.');
  assert.equal(await p.locator('#place-links a').first().getAttribute('href'), 'survey.html#P');
  // The slider's lit track ends at its thumb, as the warp slider's does, not at the stylesheet's default.
  assert.equal(await p.locator('#place-au').evaluate(el => el.style.getPropertyValue('--fill')), `${Number(await p.locator('#place-au').inputValue()) / 10}%`);
  // Its creature is grown from its own readings: the lab says where it was placed, keeps it in a jar like any other,
  // and the jar is still there on the next visit.
  await p.evaluate(() => systemView.place(1, 'earth'));
  const grow = await p.locator('#place-links a', { hasText: 'Grow a creature' }).getAttribute('href');
  assert.equal(grow, `xeno.html#world=${encodeURIComponent('placed:Sol|Sol|1|earth|5772|1|0')}`);
  await p.goto(base + grow);
  await p.waitForFunction(() => document.querySelector('#specimen h2')?.textContent);
  assert.equal(await p.locator('#specimen .eyebrow').innerText(), 'GROWN FOR THE EARTH-SIZED PLANET YOU PLACED 1 AU FROM SOL');
  assert.match(await p.locator('#tank-tag').innerText(), /^Your planet at Sol · Specimen \d{4}$/i);
  assert.match(await p.locator('#specimen').innerText(), /Your planet at Sol is Earth’s size, as you picked it, which makes its pull 1 g/);
  assert.match(await p.locator('#specimen').innerText(), /it would go on the Class M file/);
  assert.match(p.url(), /#world=placed%3ASol%7CSol%7C1%7Cearth%7C5772%7C1%7C0-\d+$/);
  const placedName = await p.locator('#specimen h2').innerText();
  await p.tap('#keep');
  await p.reload();
  await p.waitForFunction(() => document.querySelector('#jars .jar'));
  assert.match(await p.locator('#jars .jar').first().innerText(), new RegExp(`${placedName}[\\s\\S]*Your planet at Sol`));
  // A star with no known planets still takes a placed one, from the log's link.
  await p.goto(base + 'system.html#star=Vega&place');
  await p.waitForFunction(() => window.systemView?.ready && systemView.star === 'Vega');
  assert.equal(await p.locator('#planet-list').isHidden(), true);
  assert.match(await p.locator('#sys-intro').innerText(), /No planets are confirmed here yet/);
  // A star the log says has planets, though this room doesn't draw them yet, is not called empty.
  await p.goto(base + 'system.html#star=Lalande%2021185');
  await p.waitForFunction(() => window.systemView?.ready && systemView.star === 'Lalande 21185');
  assert.match(await p.locator('#sys-intro').innerText(), /^Lalande 21185, .* Its planets aren’t drawn here yet: the captain’s log has what is known of them\./);
  // Epsilon Eridani's giant, Ægir, is drawn: its mass from the Archive, its width the Archive's estimate, no way down.
  await p.goto(base + 'system.html#star=Epsilon%20Eridani');
  await p.waitForFunction(() => window.systemView?.ready && systemView.star === 'Ran');
  assert.equal(await p.evaluate(() => systemView.selected), 'Ægir');
  assert.match(await p.locator('#sys-intro').innerText(), /^Epsilon Eridani, 10\.\d ly from Sol\. One known planet, drawn on its orbit/);
  assert.match(await p.locator('#close-text').innerText(), /318 times Earth’s mass; a giant that heavy is about 14 times its width/);
  assert.match(await p.locator('#close-text').innerText(), /Thompson et al\. 2025/);
  assert.equal(await p.locator('#close-text a.beam').count(), 0);
  // 55 Cancri's five, nearest first; its lava world is too wide for the away team.
  await p.goto(base + 'system.html#planet=55%20Cancri%20e');
  await p.waitForFunction(() => window.systemView?.ready && systemView.star === 'Copernicus');
  assert.equal(await p.locator('#planet-list button').count(), 5);
  assert.match(await p.locator('#close-text').innerText(), /Too wide to be sure of ground/);
  // Barnard's Star's four small planets can be stood on.
  await p.goto(base + 'system.html#star=Barnard%27s%20Star');
  await p.waitForFunction(() => window.systemView?.ready && systemView.star === 'Barnard\'s Star');
  assert.equal(await p.locator('#planet-list button').count(), 4);
  assert.equal(await p.locator('#close-text a.beam').getAttribute('href'), 'away.html#world=Barnard%E2%80%99s%20Star%20d');
  await p.goto(base + 'system.html#star=HIP%203');
  await p.waitForFunction(() => window.systemView?.ready && systemView.star === 'HIP 3');
  assert.match(await p.locator('#sys-intro').innerText(), /No planets are known here yet/);
  assert.match(await p.locator('#place-readings').innerText(), /Starlight/i);

  // The away team on TRAPPIST-1 e: its readings, the lab's creature, and Sol on the night side if it is up.
  await p.goto(base + 'away.html#world=TRAPPIST-1%20e');
  await p.waitForFunction(() => window.awayTeam?.ready);
  assert.equal(await p.title(), 'TRAPPIST-1 e · Away team · Engage');
  const ground = await p.locator('#ground').innerText();
  assert.match(ground, /0\.82 g/);
  assert.match(ground, /57 kg/);
  assert.match(ground, /2\.2°, 4\.1 times as wide as the Sun looks from Earth/);
  assert.match(ground, /The sun never sets here/);
  assert.match(await p.locator('#creature').innerText(), /^In front of you: the .*, specimen \d{4} from the xenobiology lab/);
  assert.match(await p.locator('#creature a').getAttribute('href'), /^xeno\.html#world=TRAPPIST-1%20e-\d+$/);
  await p.tap('[data-side="night"]');
  assert.equal(await p.evaluate(() => awayTeam.side), 'night');
  const sol = await p.evaluate(() => awayTeam.solUp);
  assert.match(await p.locator('#seen').innerText(), sol ? /The Sun is the star ringed in amber, magnitude 5\.3: home\./ : /The Sun is below the horizon tonight/);
  // A world with no readings for the lab stands empty, and a giant can't be stood on.
  await p.goto(base + 'away.html#world=Mars');
  await p.waitForFunction(() => window.awayTeam?.ready && awayTeam.world === 'Mars');
  assert.match(await p.locator('#creature').innerText(), /has no readings to grow a creature for Mars/);
  assert.match(await p.locator('#ground').innerText(), /26 kg/);
  await p.goto(base + 'away.html#world=Jupiter');
  await p.waitForFunction(() => window.awayTeam?.ready && awayTeam.world === null);
  assert.match(await p.locator('#away-intro').innerText(), /Jupiter is a giant, with no ground to stand on/);
  assert.equal(await p.locator('#surface').isHidden(), true);
  assert.equal(await p.locator('#pick-list a').count(), 22, 'the transporter does not list the 22 worlds with ground');
  assert.match(await p.locator('#pick-list').innerText(), /Barnard’s Star\s+Barnard’s Star d/i);

  // The survey's Your stars: home and the stars in the log, newest first, each opening the system view to place a planet.
  await p.goto(base + 'survey.html#yours');
  await p.waitForFunction(() => window.survey);
  const yours = await p.locator('#yours-list a').evaluateAll(as => as.map(a => [a.querySelector('b').textContent, a.getAttribute('href')]));
  assert.deepEqual(yours, [['Sol, home', './system.html#star=Sol&place'], ['TRAPPIST-1', './system.html#star=TRAPPIST-1&place'], ['Vega', './system.html#star=Vega&place']]);
  assert.equal(await p.locator('#yours-none').isHidden(), true);
  // A real planet on a survey file can be flown in to and stood on.
  await p.goto(base + 'survey.html#M');
  await p.waitForFunction(() => window.survey);
  assert.equal(await p.locator('#file a', { hasText: 'Beam down' }).first().getAttribute('href'), './away.html#world=Proxima%20b');
  await sv.close();
}

// Today on the bridge, at the head of the log: Starfleet's order of the day (the same for every officer on the date),
// carried out from the log or another room's record; today's simulation, hail and distress call; a friend hailing
// again; the days served; and in the service record a rank with what the next one needs, kept once earned.
{
  const { orderOf, dayOf } = await import('../js/duty.js');
  const day = dayOf(Date.now()), order = orderOf(day);
  const dc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await dc.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await dc.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-log');
  assert.equal(await p.locator('#order .says').innerText(), order.says, 'the order of the day is not the one for the date');
  assert.equal(await p.locator('#order').getAttribute('class'), 'order');
  assert.deepEqual(await p.locator('#today li b').allInnerTexts(), ['Today’s simulation', 'Today’s hail', 'Today’s distress call', 'Today’s exam', 'Today’s rescue test', 'Today’s requisition']);
  assert.match(await p.locator('#served').innerText(), /^Cadet · Your first day aboard$/);
  assert.match(await p.locator('#today .served.next').innerText(), /^Next, Ensign: 10 more stars, 1 more Kobayashi Maru run\.$/);
  assert.ok((await p.locator('#today li a').evaluateAll(as => as.map(a => a.getBoundingClientRect().height))).every(h => h >= 44));
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'today’s card is wider than the phone');
  // A star to visit: Set course on the order chooses it.
  if (order.kind === 'star') {
    await p.locator('#order [data-course]').tap();
    assert.equal(await p.evaluate(() => engage.cat().names[engage.state.target]), order.star);
    assert.ok(await p.locator('#log').evaluate(el => el.hidden), 'Set course left the log open');
    await p.tap('#open-log');
  }
  // Today's simulation sat and today's distress call answered, a friend hailing again, and the order carried out.
  const now = Date.now();
  await p.evaluate(([day, now]) => {
    engage.closeSheets();
    localStorage.setItem('engage.maru.v1', JSON.stringify({ runs: [{ title: 'The lifeboat', outcome: 'escaped', grades: [], at: new Date(now).toISOString(), id: 'a' }], taken: 1, seen: ['The lifeboat'], daily: { date: day, line: 'x' } }));
    localStorage.setItem('engage.distress.v1', JSON.stringify({ answered: 1, rescued: 1, calls: [{ day, star: 'Procyon', found: true, air: 40, open: 2, wrong: 0, at: new Date(now).toISOString() }] }));
    localStorage.setItem('engage.contact.v1', JSON.stringify({ runs: [], met: 1, contacts: 1, friends: [{ seed: 5, people: 'Qaethuk' }] }));
  }, [day, now]);
  const carry = {
    star: () => p.evaluate(n => engage.jump(n), order.star),
    contact: () => p.evaluate(day => { const c = JSON.parse(localStorage.getItem('engage.contact.v1')); localStorage.setItem('engage.contact.v1', JSON.stringify({ ...c, daily: { date: day, line: 'x' } })); }, day),
    jar: () => p.evaluate(now => localStorage.setItem('engage.xeno.v1', JSON.stringify({ jars: [{ id: 'M', seed: 1, at: new Date(now).toISOString() }] })), now),
    radio: () => p.evaluate(now => localStorage.setItem('engage.radio.v1', JSON.stringify({ hails: [{ star: 'Vega', sent: now - 1000 }] })), now),
    missions: () => p.evaluate(now => localStorage.setItem('engage.missions.v1', JSON.stringify({ hails: { v1: now - 1000 } })), now),
    directive: () => p.evaluate(now => localStorage.setItem('engage.directive.v1', JSON.stringify({ heard: [{ case: 'x', path: [], t: now - 1000 }] })), now),
    new: () => p.evaluate(() => engage.jump('Vega')),
    voyage: () => p.evaluate(() => { engage.state.voyage = { id: 'brightest', leg: 0 }; engage.jump('Sirius'); }),
    far: () => p.evaluate(() => engage.jump('Deneb')),
  };
  if (carry[order.kind]) await carry[order.kind]();
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#open-log');
  assert.equal(await p.locator('#order').getAttribute('class'), 'order is-done', `the order (${order.kind}) was carried out and the log did not say so`);
  assert.match(await p.locator('#order .done').innerText(), /^Carried out\./);
  if (order.kind === 'star') assert.ok((await p.locator('#order .done').innerText()).length > 20, 'a star order carried out reported nothing from the log');
  assert.deepEqual(await p.locator('#today li').evaluateAll(els => els.map(el => [el.querySelector('b').textContent, el.className])), [
    ['Today’s simulation', 'done'], ['Today’s hail', order.kind === 'contact' ? 'done' : ''], ['Today’s distress call', 'done'], ['Today’s exam', ''], ['Today’s rescue test', ''], ['Today’s requisition', ''], ['The Qaethuk are hailing again', ''],
  ]);
  assert.equal(await p.locator('#today [data-today="friend"]').getAttribute('href'), 'contact.html');
  assert.match(await p.locator('#served').innerText(), /^Cadet · 1 day served$/);
  assert.match(await p.locator('#rank').innerText(), /^Cadet\nNext, Ensign: \d+ more stars?\.$/);
  // Ten stars and a Kobayashi Maru sat: promoted, said on today's card, kept in the bridge's save.
  await p.evaluate(() => { engage.closeSheets(); for (const n of ['Vega', 'Altair', 'Sirius', 'Procyon', 'Deneb', 'Rigel', 'Polaris', 'Capella', 'Arcturus', 'Spica']) engage.jump(n); engage.closeSheets(); });
  await p.tap('#open-log');
  assert.equal(await p.locator('#today .news').first().innerText(), 'Promoted today to Ensign.');
  assert.match(await p.locator('#rank').innerText(), /^Ensign\nNext, Lieutenant junior grade: /);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.v1')).duty);
  assert.deepEqual([kept.rank, kept.promoted, kept.days.includes(day)], [1, day, true]);
  assert.equal(kept.orders.includes(day), true, 'the order carried out today was not kept');
  // The log cleared: the rank, the days served and the order stay earned.
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('engage.v1')); localStorage.setItem('engage.v1', JSON.stringify({ ...s, log: [], ly: 0, at: 0 })); });
  await p.reload();
  await bridgeReady(p);
  await p.tap('#open-log');
  assert.match(await p.locator('#rank').innerText(), /^Ensign\n/, 'clearing the log took the rank away');
  assert.match(await p.locator('#served').innerText(), /^Ensign · 1 day served$/);
  // Voyager 1's answer to a hail came in a minute ago: it is on today's card, leading to her file. (The day the hail
  // went, two days back, is a day served too, so this comes last.)
  {
    const { readings, jdOf } = await import('../js/ephemeris.js');
    const light = readings('v1', jdOf(new Date())).lightSeconds * 1000;
    await p.evaluate(sent => { engage.closeSheets(); localStorage.setItem('engage.missions.v1', JSON.stringify({ hails: { v1: sent } })); }, Date.now() - 2 * light - 60000);
    await p.tap('#open-log');
    const answer = p.locator('#today [data-today="answer:v1"]');
    assert.equal(await answer.getAttribute('href'), 'missions.html#v1');
    assert.match(await answer.innerText(), /Voyager 1 answered your hail[\s\S]*Her answer came in at \d\d:\d\d/);
  }
  await dc.close();
}

// Subspace radio: the dial lights the shell of stars hearing a year tonight and names three; a star from the log opens
// with the dial at its year; the messages in flight have their bars; a hail to a star is kept, once, and shows on its
// way. The log's broadcast line and Set course both lead here.
{
  const rc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await rc.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await rc.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const { yearNow, heardAt } = await import('../js/radio.js');
  // From the bridge: an arrival's broadcast line links here with the star, and Set course has a way in at its foot.
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => engage.jump('Vega'));
  assert.equal(await p.locator('#arrival-entry .files a', { hasText: 'Subspace radio' }).getAttribute('href'), 'radio.html#star=Vega');
  await p.evaluate(() => engage.closeSheets());
  await p.tap('#choose');
  assert.equal(await p.locator('#list a.to-room').getAttribute('href'), 'radio.html');
  await p.fill('#search', '1969');
  assert.equal(await p.locator('#list a.to-room').getAttribute('href'), 'radio.html#year=1969');
  await p.evaluate(() => engage.closeSheets());
  // The star from the log: the dial at the year Vega is hearing tonight.
  await p.goto(base + 'radio.html#star=Vega');
  await p.waitForFunction(() => window.radio?.ready);
  const vegaYear = await p.evaluate(() => radio.year);
  assert.ok(vegaYear >= 2000 && vegaYear <= 2002, `Vega is hearing ${vegaYear}`);
  assert.equal(await p.evaluate(() => radio.pick), 'Vega');
  assert.match(await p.locator('#picked').innerText(), new RegExp(`^Vega \\(Vega colony\\), 25 light years out, is hearing ${vegaYear} tonight\\.`));
  assert.equal(await p.title(), `${vegaYear} · Subspace radio · Engage`);
  // 1969: the Moon landing, the stars about 57 to 58 light years out, three named with a course and their place tonight.
  await p.goto(base + 'radio.html#year=1969');
  await p.waitForFunction(() => window.radio?.ready && radio.year === 1969);
  assert.equal(await p.locator('#year-line').innerText(), 'In 1969, people first walked on the Moon.');
  assert.match(await p.locator('#year-count').innerText(), /^\d+ catalogued stars are hearing 1969 tonight, 5\d\.\d to 5\d\.\d light years out\.$/);
  assert.equal(await p.locator('#three li').count(), 3);
  assert.match(await p.locator('#three li a').first().getAttribute('href'), /^\.\/\?course=/);
  assert.match(await p.locator('#three li a').nth(1).getAttribute('href'), /^\.\/tonight\.html#star=/);
  // The dial moves the year; 1938 was on the air.
  await p.locator('#dial').fill('1938');
  assert.equal(await p.locator('#dial-out').innerText(), '1938');
  assert.equal(await p.locator('#year-line').innerText(), 'On the air in 1938: Orson Welles’s radio play The War of the Worlds.');
  // This year: no star is near enough yet.
  const thisYear = new Date().getUTCFullYear();
  await p.locator('#dial').fill(String(thisYear));
  assert.match(await p.locator('#year-count').innerText(), new RegExp(`^No star is close enough to be hearing ${thisYear} yet`));
  // A tap on the map picks the star there and turns the dial to its year.
  await p.locator('#dial').fill('1980');
  const box = await p.locator('#radio-map').boundingBox();
  const dot = (await p.evaluate(() => radio.dots())).find(d => d.name === 'Altair');
  await p.touchscreen.tap(box.x + dot.x, box.y + dot.y);
  assert.equal(await p.evaluate(() => radio.pick), 'Altair');
  assert.equal(await p.evaluate(() => radio.year), heardAt(16.73, yearNow()).year);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the room is wider than the phone');
  // Messages in flight: Altair's arrived, Luyten's Star's on its way, M13 with no course.
  await p.tap('[data-tab="messages"]');
  assert.equal(await p.evaluate(() => radio.tab), 'messages');
  const altair = p.locator('[data-message="altair"]');
  assert.match(await altair.innerText(), /Sent 15 August 1983 from a radio telescope at Stanford, California\./);
  assert.match(await altair.innerText(), /arrived about 2000/);
  assert.match(await p.locator('[data-message="sonar"]').innerText(), /due about 2030 · \d+% of the way/);
  assert.match(await p.locator('[data-message="cosmic1"] .from').innerText(), /^Sent 24 May to 1 July 1999 from the RT-70 dish at Yevpatoria, to 4 stars\.$/);
  assert.equal(await p.locator('[data-message="arecibo"] .links').count(), 0, 'a cluster the catalogue lacks offers a course');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the messages are wider than the phone');
  // Hail a star: search, send, kept; a hail on its way isn't sent twice.
  await p.tap('[data-tab="hail"]');
  await p.fill('#hail-search', 'wolf 359');
  await p.locator('#hail-results [data-star]').first().tap();
  assert.match(await p.locator('#hail-what').innerText(), /^Wolf 359 is 7\.8 light years away\. A hail sent now arrives in \w+ 20\d\d, 7 years( \d+ months?)? from now\.$/);
  await p.tap('#hail-send');
  assert.match(await p.locator('#hail-said').innerText(), /^Hailing frequencies open\. Your hail is on its way to Wolf 359/);
  assert.equal(await p.locator('#hail-send').isDisabled(), true);
  assert.equal(await p.locator('#yours li').count(), 1);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.radio.v1')));
  assert.deepEqual(kept.hails.map(h => h.star), ['Wolf 359']);
  await p.reload();
  await p.waitForFunction(() => window.radio?.ready);
  await p.tap('[data-tab="hail"]');
  assert.match(await p.locator('#yours li').innerText(), /^Wolf 359[\s\S]*Arrives in \w+ 20\d\d, /);
  // The hail goes in the captain's log as a supplemental line leading back to it, and on the service record.
  await p.goto(base);
  await bridgeReady(p);
  await p.tap('#open-log');
  const line = p.locator('#entries .supp a', { hasText: 'Wolf 359' });
  assert.match(await line.innerText(), /^Supplemental: hailed Wolf 359 on subspace radio\. It gets there in 20\d\d\.$/);
  assert.equal(await line.getAttribute('href'), 'radio.html#hail=Wolf%20359');
  assert.equal(await p.locator('#service a[data-room="radio"] span').innerText(), '1 sent · none landed yet');
  await p.evaluate(() => engage.closeSheets());
  // A link to hail a star opens with it chosen; a star with no measured distance can't be hailed.
  await p.goto(base + 'radio.html#hail=Altair');
  await p.waitForFunction(() => window.radio?.ready && radio.tab === 'hail');
  assert.match(await p.locator('#hail-what').innerText(), /^Altair is 17 light years away/);
  await rc.close();
}

// Astrometrics: every star on one wall by colour and true brightness. The log links a star to its place there; a
// filter changes the lesson; a tap gives a star's card; the slider walks the Sun through its life; and the stars with
// no colour or no distance are counted as left off.
{
  const ac = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ac.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await ac.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  await p.evaluate(() => { engage.jump('Arcturus'); engage.closeSheets(); engage.jump('Proxima Centauri'); });
  assert.equal(await p.locator('#arrival-entry .files a', { hasText: 'Astrometrics' }).getAttribute('href'), 'astrometrics.html#star=Proxima%20Centauri');
  await p.goto(base + 'astrometrics.html#star=Arcturus');
  await p.waitForFunction(() => window.astrometrics?.ready);
  assert.equal(await p.title(), 'Arcturus · Astrometrics · Engage');
  assert.match(await p.locator('#card').innerText(), /^Arcturus\n[\s\S]*Orange giant[\s\S]*Among the giants: [\d,]+ K, \d+ times as bright as the Sun\./);
  assert.match(await p.locator('#left-out').innerText(), /^16,955 stars on the wall\. Left off: 758 stars the catalogue has no colour for, 67 too red for its colours to give a temperature and 407 with no measured distance/);
  assert.match(await p.locator('#lesson').innerText(), /^[\d,]+ stars, each in its own colour\. Most lie on the main sequence/);
  // The naked eye sees giants and hot stars; the neighbourhood is red dwarfs; Visited is the log, with home.
  await p.tap('[data-filter="eye"]');
  assert.match(await p.locator('#lesson').innerText(), /stars you can see without a telescope\. (9\d|8\d)% of them are giants, supergiants or main-sequence stars hotter than the Sun/);
  await p.tap('[data-filter="near"]');
  assert.match(await p.locator('#lesson').innerText(), /stars within 80 light years, .* (4\d|5\d)% of them are red dwarfs/);
  await p.tap('[data-filter="visited"]');
  assert.equal(await p.locator('#lesson').innerText(), '3 stars in your log, home among them: 2 on the main sequence, 1 giant or supergiant.');
  assert.deepEqual((await p.evaluate(() => astrometrics.dots())).map(d => d.name).sort(), ['Arcturus', 'Proxima Centauri', 'Sol']);
  // A tap on a dot opens its card.
  const box = await p.locator('#wall').boundingBox();
  const prox = (await p.evaluate(() => astrometrics.dots())).find(d => d.name === 'Proxima Centauri');
  await p.touchscreen.tap(box.x + prox.x, box.y + prox.y);
  assert.equal(await p.evaluate(() => astrometrics.pick), 'Proxima Centauri');
  assert.match(await p.locator('#card').innerText(), /On the main sequence: /);
  assert.equal(await p.locator('#card .links a').first().getAttribute('href'), './?course=Proxima%20Centauri');
  // The Sun's life: to a red giant, then the white dwarf at the end.
  await p.locator('#life').fill('4');
  assert.match(await p.locator('#life-said').innerText(), /^12\.23 billion years: a red giant 166 times as wide as today/);
  await p.locator('#life').fill('8');
  assert.equal(await p.locator('#life-out').textContent(), 'at the end');
  assert.match(await p.locator('#life-said').innerText(), /40 Eridani B, beside Vulcan’s sun/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the room is wider than the phone');
  // A star the wall leaves off says why.
  await p.goto(base + 'astrometrics.html#star=Sirius');
  await p.waitForFunction(() => window.astrometrics?.ready && astrometrics.pick === 'Sirius');
  assert.match(await p.locator('#card').innerText(), /On the main sequence/);
  await ac.close();
}

// The distress call: two clues open, cleaning the signal opens another for air, a wrong lock says which clue rules
// the star out and costs air, the right one ends in the debrief in their own sky, and the record keeps the day's call.
// Air running out ends a call too.
{
  const dc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await dc.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await dc.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'distress.html');
  await p.waitForFunction(() => window.distress?.ready);
  assert.equal(await p.locator('#standing').innerText(), '');
  await p.tap('#today');
  await p.evaluate(() => distress.hold(true));
  assert.equal(await p.locator('#signal li:not(.garbled)').count(), 2);
  assert.equal(await p.locator('#signal li.garbled').count(), 3);
  assert.match(await p.locator('#signal li').first().innerText(), /^…our sun is an? [a-z-]+ star…$/);
  const star = await p.evaluate(() => distress.call.star);
  await p.tap('#clean');
  assert.equal(await p.locator('#signal li:not(.garbled)').count(), 3);
  assert.match(await p.locator('#signal li').nth(2).innerText(), /^…your Sun shines at magnitude \d\.\d here…$/);
  assert.equal(await p.locator('#air-left').innerText(), '85%');
  // A tap on the chart picks a star; locking on to the wrong one says why, and costs air.
  const wrong = ['Vega', 'Altair', 'Deneb', 'Rigel', 'Betelgeuse', 'Polaris', 'Spica'].filter(n => n !== star);
  await p.evaluate(n => distress.turnTo(n), wrong[0]);
  const box = await p.locator('#chart').boundingBox(), at = await p.evaluate(n => distress.where(n), wrong[0]);
  await p.touchscreen.tap(box.x + at.x, box.y + at.y);
  assert.equal(await p.evaluate(() => distress.pick), wrong[0]);
  assert.match(await p.locator('#picked').innerText(), new RegExp(`^${wrong[0]}\\n+A [a-z-]+ star · \\d+ light years away`));
  await p.tap('#lock');
  assert.match(await p.locator('#said').innerText(), new RegExp(`^Not ${wrong[0]}: .* That cost 20% of their air\\.$`));
  assert.equal(await p.locator('#air-left').innerText(), '65%');
  assert.equal(await p.locator('#lock').isDisabled(), true, 'a star already ruled out could be locked on to again');
  // The air runs down as you look.
  await p.evaluate(() => distress.hold(false));
  await p.waitForFunction(() => parseInt(document.getElementById('air-left').textContent, 10) < 65, null, { timeout: 10000 }).catch(() => assert.fail('the air did not run down'));
  await p.evaluate(() => distress.hold(true));
  // A star found by name, and locked on to: the debrief, in their own sky.
  await p.fill('#find', star);
  await p.press('#find', 'Enter');
  assert.equal(await p.evaluate(() => distress.pick), star);
  await p.tap('#lock');
  assert.match(await p.locator('#debrief-1').innerText(), /^Found: they were at .*, \d+(\.\d)? light years out\. A rescue ship is on its way, with \d+% of their air left \(3 of 5 clues, 1 wrong lock\)\.$/);
  assert.match(await p.locator('#debrief-2').innerText(), /every star has a sky of its own\.$/);
  assert.match(await p.locator('#chart-tag').innerText(), /^The sky from /i);
  assert.equal(await p.evaluate(() => distress.sky), 'theirs');
  assert.equal(await p.locator('#debrief-links a').first().getAttribute('href'), `./?course=${encodeURIComponent(star)}`);
  await p.tap('[data-sky="earth"]');
  assert.equal(await p.evaluate(() => distress.sky), 'earth');
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.distress.v1')));
  assert.deepEqual([kept.answered, kept.rescued, kept.calls.length, kept.calls[0].found, kept.calls[0].open, kept.calls[0].wrong], [1, 1, 1, true, 3, 1]);
  assert.match(kept.calls[0].day, /^\d{4}-\d\d-\d\d$/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the room is wider than the phone');
  // Back at the briefing, the day's call is answered and the record says so.
  await p.reload();
  await p.waitForFunction(() => window.distress?.ready);
  assert.match(await p.locator('#standing').innerText(), /^Rescued 1 of 1 call\. Today’s call: found at .* with \d+% of their air left\.$/);
  assert.equal(await p.locator('#today').isVisible(), false, 'the day’s call could be answered twice');
  // A new call lost: five wrong locks leave them no air.
  await p.tap('#another');
  await p.evaluate(() => distress.hold(true));
  const lost = await p.evaluate(() => distress.call.star);
  for (const n of ['Vega', 'Altair', 'Deneb', 'Rigel', 'Betelgeuse', 'Polaris', 'Spica'].filter(n => n !== lost).slice(0, 5)) {
    await p.evaluate(x => distress.choose(x), n);
    await p.tap('#lock');
  }
  assert.match(await p.locator('#debrief-1').innerText(), /^Their air ran out\. They were at /);
  assert.equal(await p.locator('#air-left').innerText(), '0%');
  assert.deepEqual(await p.evaluate(() => { const k = JSON.parse(localStorage.getItem('engage.distress.v1')); return [k.answered, k.rescued, k.calls[1].day]; }), [2, 1, null]);
  await dc.close();
}
// Today's call counts from the moment it is begun: left partway (here, by reloading after a wrong lock), it is lost,
// and Answer today's call doesn't come back with the same star, full air and every clue hidden.
{
  const dc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await dc.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await dc.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'distress.html');
  await p.waitForFunction(() => window.distress?.ready);
  await p.tap('#today');
  await p.evaluate(() => distress.hold(true));
  const star = await p.evaluate(() => distress.call.star);
  await p.evaluate(x => distress.choose(x), ['Vega', 'Altair'].find(n => n !== star));
  await p.tap('#lock');
  await p.reload();
  await p.waitForFunction(() => window.distress?.ready);
  assert.equal(await p.locator('#today').isVisible(), false, 'today’s call, left partway, could be answered again');
  assert.match(await p.locator('#standing').innerText(), /^Rescued 0 of 1 call\. Today’s call: lost when it was left partway; they were at .+\.$/);
  assert.match(await p.locator('#today-said').innerText(), /^Today’s call was lost: it was left partway\. Answer a new call to practise/);
  assert.ok(await p.locator('#another').isVisible(), 'there was no new call to practise on');
  await dc.close();
}

// The temporal observatory: the dial moves every star by its own motion and Earth's axis with them. Now has Polaris
// and Proxima; the pyramids' year has Thuban; AD 14,000 has Vega; a typed year and a link both go to their year;
// today's shapes can be hidden.
{
  const tc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await tc.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await tc.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'temporal.html');
  await p.waitForFunction(() => window.temporal?.ready);
  const now = new Date().getFullYear();
  assert.equal(await p.evaluate(() => temporal.year), now);
  assert.equal(await p.evaluate(() => temporal.poleStar), 'Polaris');
  assert.equal(await p.evaluate(() => temporal.nearest), 'Proxima Centauri');
  assert.match(await p.locator('#era').innerText(), /POLE STAR\s+Polaris, magnitude 2\.0, 0\.\d° from the pole\./i);
  assert.equal(await p.title(), 'Temporal observatory · Engage');
  await p.tap('[data-moment="0"]');
  assert.equal(await p.evaluate(() => temporal.poleStar), 'Thuban');
  assert.equal(await p.locator('#year-out').innerText(), '2,800 BC');
  assert.equal(await p.title(), '2,800 BC · Temporal observatory · Engage');
  assert.match(await p.locator('#moment-said').innerText(), /^The age of the pyramids: Thuban/);
  await p.tap('[data-moment="6"]');
  assert.equal(await p.evaluate(() => temporal.poleStar), 'Vega');
  assert.equal(await p.evaluate(() => temporal.nearest), 'Rigil Kentaurus');
  assert.match(await p.locator('#era').innerText(), /NEAREST STAR\s+Alpha Centauri, 3\.\d\d light years\. Today it is Proxima Centauri\./i);
  // Barnard's Star at its closest, by this catalogue.
  await p.tap('[data-moment="5"]');
  assert.match(await p.locator('#moment-said').innerText(), /^Barnard’s Star at its closest by this catalogue: 3\.6\d light years, in AD 11,9\d\d \(published reckonings say about 3\.75 light years, around AD 11,800\)/);
  // No pole star in Caesar's day; a typed year goes there, and so does a link.
  await p.fill('#year', '-44');
  await p.press('#year', 'Enter');
  assert.equal(await p.locator('#year-out').innerText(), '45 BC');
  assert.equal(await p.evaluate(() => temporal.poleStar), null);
  assert.match(await p.locator('#era').innerText(), /POLE STAR\s+None\. No star the eye can find from a town is within 5° of the pole; the nearest is Kochab|POLE STAR\s+None\./i);
  // The dial, all the way on: the shapes of today come apart.
  await p.locator('#dial').fill('1000');
  assert.equal(await p.evaluate(() => temporal.year), now + 99999);
  assert.match(await p.locator('#era').innerText(), /SINCE NOW\s+.* has moved furthest of the bright stars, \d+°\./i);
  await p.goto(base + 'temporal.html#year=14000');
  await p.waitForFunction(() => window.temporal?.ready && temporal.year === 14000);
  assert.equal(await p.evaluate(() => temporal.poleStar), 'Vega');
  await p.tap('#ghosts');
  assert.equal(await p.locator('#ghosts').isChecked(), false);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the room is wider than the phone');
  await tc.close();
}

// The long way home: a quarter at warp 7.8 keeps the tanks full; flat out empties them in weeks and falls back to
// 7.8; a stop for what is ahead costs the quarter; cruising on stops for a decision; the trip is kept to come back to;
// and the trip home ends in the debrief and the record.
{
  const lc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await lc.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await lc.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'longway.html');
  await p.waitForFunction(() => window.longway?.ready);
  await p.evaluate(() => longway.start(42));
  assert.match(await p.locator('#status').innerText(), /SHIP’S DATE\s+Year 1, quarter 1\s+STILL TO GO\s+70,000 ly\s+FUEL\s+100%\s+STORES\s+100%/i);
  assert.match(await p.locator('#burn').innerText(), /The collectors keep up: the tanks never empty at this speed\. Home in 75 years( \d+ months?)? at it\./);
  await p.tap('#fly');
  let t = await p.evaluate(() => longway.trip);
  assert.equal(await p.locator('#warp-out').innerText(), '7.78');
  assert.deepEqual([t.quarter, Math.round(t.left), t.fuel, t.supplies], [1, 70000 - 233, 100, 98]);
  // Flat out: the tanks run dry in weeks.
  await p.locator('#warp').fill('9.975');
  assert.match(await p.locator('#burn').innerText(), /^6,751 times light, 1,688 light years a quarter\. It burns 209 a quarter against the collectors’ 4: the tanks would be dry in 6 weeks, then warp 7\.8\.$/);
  await p.tap('#fly');
  t = await p.evaluate(() => longway.trip);
  assert.equal(t.fuel, 0);
  assert.match(await p.locator('#voyage-log li').first().innerText(), /The tanks ran dry; she fell back to warp 7\.8\./);
  // Cruising on stops at the next thing to decide about, and a stop there costs the quarter.
  await p.locator('#warp').fill('8');
  await p.tap('#cruise');
  t = await p.evaluate(() => longway.trip);
  assert.ok(await p.locator('#stops button').count() === 1 || t.supplies <= 20, 'cruised past a decision');
  if (await p.locator('#stops button').count()) {
    const left = t.left;
    await p.tap('#stops button');
    t = await p.evaluate(() => longway.trip);
    assert.equal(t.left, left, 'a stop flew on');
  }
  // The trip under way is kept, and comes back.
  await p.reload();
  await p.waitForFunction(() => window.longway?.ready);
  assert.equal((await p.evaluate(() => longway.trip)).quarter, t.quarter);
  // All the way home, stopping at every nebula and world: the debrief and the record.
  for (let n = 0; n < 400 && !(await p.evaluate(() => longway.trip.home)); n++) {
    if (await p.locator('#stops button').count()) await p.tap('#stops button');
    else { await p.locator('#warp').fill('9'); await p.tap('#cruise'); }
  }
  assert.equal(await p.locator('#debrief').isVisible(), true);
  assert.match(await p.locator('#debrief-1').innerText(), /^Home in \d+ years( \d+ months?)?, with \d+ stops? for fuel and \d+ for shore leave\.$/);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.longway.v1')));
  assert.deepEqual([kept.trip, kept.homes, kept.arrivals.length, kept.arrivals[0].years], [null, 1, 1, kept.best]);
  assert.ok(kept.best > 40 && kept.best < 75, `${kept.best}`);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the room is wider than the phone');
  await p.tap('#again');
  assert.equal((await p.evaluate(() => longway.trip)).quarter, 0);
  await lc.close();
}

// Main engineering: the order before the shift and what it costs; antimatter with no deuterium to meet strains the
// containment; the sliders set by hand hold the order while the shift runs in real time; a careful shift ends in an
// A, the yardsticks and the record; and a core starved of deuterium is ejected.
{
  const ec = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ec.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await ec.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'engineering.html');
  await p.waitForFunction(() => window.engineering?.ready);
  await p.evaluate(() => engineering.start(42));
  const first = (await p.evaluate(() => engineering.shift)).orders[0];
  assert.equal(first, 7);
  assert.equal(await p.locator('#order-line').innerText(), 'The bridge will ask for 8 warp factors, one an hour. The first: warp 7. Set the flows, then start.');
  assert.equal(await p.locator('#order-cost').innerText(), 'Warp 7 needs 49% of this core’s power: 490 g of antimatter an hour, 21 megatons.');
  // Antimatter alone: the mix says so, and the strain climbs once time runs.
  await p.locator('#flow-a').fill('50');
  assert.match(await p.locator('#mix').innerText(), /^Mix 0\.00 to 1: antimatter with no deuterium to meet\. Containment is straining\.$/);
  await p.evaluate(() => engineering.run(1));
  assert.ok((await p.evaluate(() => engineering.shift.strain)) > 0.1);
  // A fresh shift, the flows set by hand to what holds warp 7, and the shift run in real time.
  await p.evaluate(() => engineering.start(42));
  const f = await p.evaluate(() => engineering.flowsFor(7));
  await p.locator('#flow-d').fill(String(Math.round(f.d * 100)));
  await p.locator('#flow-a').fill(String(Math.round(f.a * 100)));
  await p.locator('#flow-c').fill(String(Math.round(f.c * 100)));
  assert.equal(await p.locator('#mix').innerText(), 'Mix one to one: every gram of antimatter meets a gram of deuterium.');
  await p.tap('#start');
  await p.waitForFunction(() => engineering.shift.t > 2, null, { timeout: 10000 });
  // The bridge's first order is said as soon as the shift starts, not only once it is paused or the hour turns.
  assert.equal(await p.locator('#order-line').innerText(), '“Engineering, bring us to warp 7.”');
  await p.tap('#pause');
  assert.match(await p.locator('#gauges').innerText(), /HOLDING\s+Warp 7\s+On the order/i);
  assert.match(await p.locator('#order-hour').innerText(), /Bridge · hour 1 of 8/i);
  assert.equal(await p.locator('#order-line').innerText(), '“Engineering, bring us to warp 7.”');
  assert.match(await p.locator('#burned-kg').innerText(), /^\d+(\.\d)? g of antimatter$/);
  // The rest of the shift, answering each order a second late.
  for (let k = 0; k < 8 && !(await p.evaluate(() => engineering.shift.over)); k++) {
    await p.evaluate(() => { engineering.set(engineering.flowsFor(engineering.reading.order)); engineering.run(12 - engineering.shift.t % 12 + 1); });
  }
  await p.evaluate(() => engineering.run(20));
  assert.equal(await p.locator('#debrief').isVisible(), true);
  assert.equal(await p.locator('#debrief-head').innerText(), 'Shift complete: A');
  assert.match(await p.locator('#debrief-held').innerText(), /^You held the bridge’s order for (8|9)\d% of the shift\. The bridge never had to ask twice\.$/);
  assert.deepEqual((await p.locator('#yardsticks li').allInnerTexts()).map(l => l.replace(/\d[\d,.]*/g, 'N')),
    ['N megatons of TNT', 'N times the Hiroshima bomb', 'N times the Tsar Bomba, the largest bomb ever set off', 'N hours of all the energy the world uses']);
  assert.equal(await p.locator('#burned').isVisible(), false);
  let kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.engineering.v1')));
  assert.equal(kept.shifts, 1);
  assert.ok(kept.best > 0.8 && kept.kg > 2, JSON.stringify(kept));
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the room is wider than the phone');
  // Another shift, starved of deuterium: the core is ejected in the first hour.
  await p.tap('#again');
  assert.equal(await p.locator('#debrief').isVisible(), false);
  assert.equal(await p.locator('#out-a').innerText(), '0%');
  await p.evaluate(() => engineering.set({ a: 0.8, d: 0.2, c: 0.4 }));
  await p.evaluate(() => engineering.run(10));
  assert.equal(await p.locator('#debrief-head').innerText(), 'Core ejected in hour 1');
  kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.engineering.v1')));
  assert.deepEqual([kept.shifts, kept.ejected], [2, 1]);
  await p.reload();
  await p.waitForFunction(() => window.engineering?.ready);
  assert.equal(await p.locator('#best').innerText(), '');
  await ec.close();
}

// The Prime Directive: the case, a hearing given order by order with each one written into the transcript, the
// board's finding with its four grades and what Picard did, the record, and a second hearing from the finding.
{
  const dc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await dc.addInitScript(() => { if (!localStorage.getItem('engage.v1')) localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true, opts: { sound: false } })); });
  const p = await dc.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base + 'directive.html');
  await p.waitForFunction(() => window.directive?.ready);
  assert.equal(await p.locator('#case-title').innerText(), 'The voice on the radio');
  assert.equal(await p.locator('#record').isVisible(), false);
  await p.tap('#hear');
  assert.equal(await p.locator('#brief').isVisible(), false);
  assert.deepEqual(await p.locator('.pd-choice').allInnerTexts(), ['Stop answering her, tonight', 'Keep listening, but say nothing more', 'Put it before the senior staff, and in the log']);
  await p.locator('.pd-choice', { hasText: 'Stop answering' }).tap();
  assert.match(await p.locator('#transcript li').first().innerText(), /Your order: Stop answering her, tonight\.\s+Oduya signs off without a word\./);
  assert.match(await p.locator('#step-text').innerText(), /^Teshi’s next call is frightened/);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'step-text', 'the next question did not take the focus');
  await p.locator('.pd-choice', { hasText: 'Settle the faults' }).tap();
  await p.locator('.pd-choice', { hasText: 'Beam her up' }).tap();
  await p.locator('.pd-choice', { hasText: 'take her memory' }).tap();
  assert.equal(await p.locator('#verdict').isVisible(), true);
  assert.equal(await p.locator('#finding-title').innerText(), 'Nothing to remember');
  assert.deepEqual(await p.locator('#grades .letter').allInnerTexts(), ['A', 'B', 'B', 'C']);
  assert.match(await p.locator('#grades li').nth(3).innerText(), /CANDOUR: C\s+You took a child’s memory without asking her\./i);
  assert.equal(await p.locator('#happened li').count(), 4);
  assert.match(await p.locator('#screen-title').innerText(), /“Pen Pals” \(The Next Generation, season 2, 1989\)/);
  assert.equal(await p.locator('#screen-same').innerText(), 'Your orders were Picard’s, every one.');
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.directive.v1')));
  assert.deepEqual(kept.heard.map(h => h.path), [['stop', 'settle', 'beam', 'erase']]);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the room is wider than the phone');
  // Again, another way: three orders this time.
  await p.tap('#again');
  assert.equal(await p.locator('#transcript li').count(), 0);
  for (const t of ['Put it before', 'Leave the planet', 'Let it ring']) await p.locator('.pd-choice', { hasText: t }).tap();
  assert.equal(await p.locator('#finding-title').innerText(), 'The order kept');
  assert.equal(await p.locator('#screen-same').innerText(), 'None of your orders was Picard’s.');
  // The record shows on the case.
  await p.tap('#back');
  assert.equal(await p.locator('#record').innerText(), 'Heard 2 times. Last finding: The order kept, F A B A.');
  await p.reload();
  await p.waitForFunction(() => window.directive?.ready);
  assert.equal(await p.locator('#hear').innerText(), 'HEAR IT AGAIN');
  await dc.close();
}

// The shipyard: a design on the bench comes to its numbers, a name is needed to keep her, a kept ship is listed with a
// link to race her on the warp scale, today's requisition is filled by a design that meets it, a design someone sent
// opens on the bench, and a ship can be scrapped.
{
  const sy = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await sy.newPage();
  p.on('pageerror', e => problems.push(e.message));
  const { requisition, stats, ALL, meets, encodeDesign } = await import('../js/shipyard-sim.js');
  await p.goto(base + 'shipyard.html');
  await p.waitForFunction(() => window.shipyard?.ready);
  const day = await p.evaluate(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; });
  const req = requisition(day);
  assert.equal(await p.locator('#req-says').innerText(), req.says);
  assert.equal(await p.locator('#fleet-none').isVisible(), true);
  // The engines slider takes from the other two, and the numbers follow.
  const before = await p.evaluate(() => shipyard.bench);
  await p.locator('#share-e').fill('60');
  const after = await p.evaluate(() => shipyard.bench);
  assert.deepEqual([after.e, after.s + (100 - after.e - after.s)], [60, 40]);
  assert.ok(stats(after).top > stats(before).top);
  assert.equal(await p.locator('#specs div').first().innerText(), `TOP SPEED\nWarp ${stats(after).top}`);
  // No name, no keeping.
  await p.tap('#keep');
  assert.match(await p.locator('#kept-note').innerText(), /needs a name/);
  // A design that meets today's requisition, named and kept, fills it.
  const fit = ALL.find(d => meets(stats(d), req.needs));
  await p.evaluate(d => { shipyard.setHull(d.hull); shipyard.setShare('e', d.e); shipyard.setShare('s', d.s); shipyard.setShare('e', d.e); }, fit);
  assert.ok(meets(stats(await p.evaluate(() => shipyard.bench)), req.needs), 'the bench did not take the design');
  assert.match(await p.locator('#req-state').innerText(), /meets it/);
  await p.fill('#name', 'Meridian');
  await p.fill('#registry', 'ncc-80412');
  await p.tap('#keep');
  assert.match(await p.locator('#kept-note').innerText(), /^The USS Meridian is kept, and fills today’s requisition\.$/);
  assert.match(await p.locator('#req-state').innerText(), /^Filled today with the USS Meridian\./);
  assert.equal(await p.locator('#ships li').count(), 1);
  assert.match(await p.locator('#ships li').innerText(), /Filled the requisition of/);
  const race = await p.locator('#ships a').getAttribute('href');
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('engage.shipyard.v1')));
  assert.deepEqual([kept.designs.length, kept.designs[0].name, kept.designs[0].registry, kept.filled[day] === kept.designs[0].id], [1, 'Meridian', 'NCC-80412', true]);
  // Changing her and saving keeps one ship, not two; New design starts another.
  await p.evaluate(() => shipyard.setShare('d', 40));
  assert.equal(await p.locator('#keep').innerText(), 'SAVE CHANGES');
  await p.tap('#keep');
  assert.equal(await p.locator('#ships li').count(), 1);
  await p.tap('#fresh');
  assert.equal(await p.inputValue('#name'), '');
  // Her race on the warp scale: her name in the bottom lane, at her cruising warp.
  await p.goto(base + race);
  await p.waitForFunction(() => window.warpScale?.trip);
  const lane = await p.evaluate(() => warpScale.trip.lanes.find(l => l.id === 'real'));
  const ship = (await p.evaluate(() => JSON.parse(localStorage.getItem('engage.shipyard.v1')))).designs[0];
  assert.equal(lane.label, 'USS Meridian');
  assert.ok(Math.abs(lane.c - (await import('../js/physics.js')).warpSpeed(stats(ship).cruise)) < 1e-6);
  assert.equal(await p.locator('#real-ship').inputValue(), `yard:${encodeDesign(ship)}`);
  // A design someone sent: on the bench, ready to keep.
  await p.goto(base + 'shipyard.html#ship=' + encodeDesign({ hull: 'escort', e: 50, s: 10, registry: 'NX-74205', name: 'Valiant' }));
  await p.waitForFunction(() => window.shipyard?.ready);
  assert.deepEqual(await p.evaluate(() => [shipyard.bench.hull, shipyard.bench.e, shipyard.bench.name]), ['escort', 50, 'Valiant']);
  assert.match(await p.locator('#kept-note').innerText(), /as someone sent her/);
  await p.tap('#keep');
  assert.equal(await p.locator('#ships li').count(), 2);
  assert.match(await p.locator('#ships li').first().innerText(), /USS Valiant/);
  // Scrapped, she goes; the requisition stays filled.
  p.once('dialog', d => d.accept());
  await p.locator('#ships [data-scrap]').last().tap();
  assert.equal(await p.locator('#ships li').count(), 1);
  assert.equal(Object.keys((await p.evaluate(() => JSON.parse(localStorage.getItem('engage.shipyard.v1')))).filled).length, 1);
  // The one scrapped was the Meridian, who filled it: the card still says it's filled, not that the bench can fill it.
  assert.match(await p.locator('#ships li').innerText(), /USS Valiant/);
  assert.equal(await p.locator('#req-state').innerText(), 'Filled today. Tomorrow brings another.');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the shipyard is wider than the phone');
  await sy.close();
}

// Works offline once it has been opened: every room, not only the bridge. The server goes down as well as the
// browser: in some Chromium builds the browser's offline switch alone doesn't stop the service worker's own requests.
const ROOMS = ['', 'survey.html', 'maru.html', 'missions.html', 'tonight.html', 'xeno.html', 'contact.html', 'warp.html', 'system.html', 'away.html', 'radio.html', 'astrometrics.html', 'distress.html', 'temporal.html', 'longway.html', 'engineering.html', 'directive.html', 'shipyard.html'];
const until = async (ok, ms, what) => {
  for (const end = Date.now() + ms; !(await ok());) { assert.ok(Date.now() < end, what); await new Promise(r => setTimeout(r, 100)); }
};
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });
// The copy is whole before the network goes: every file on the worker's list.
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const shell = [...sw.match(/SHELL = \[([^\]]*)\]/)[1].replace(/\/\/.*/g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
const cacheName = sw.match(/const CACHE = '(engage-v[0-9]+)'/)[1];
await until(() => page.evaluate(async ([name, n]) => (await (await caches.open(name)).keys()).length >= n, [cacheName, shell.length]), 20000, 'the offline copy was never filled');
const titles = {};
// A room's tab is named after what is on screen ("Vega · Warp scale · Engage", and on the bridge "Vega · Engage"),
// so a room is told by how its title ends: with the title its file has.
for (const room of ROOMS) { await page.goto(base + room); titles[room] = (await readFile(join(root, room || 'index.html'), 'utf8')).match(/<title>(.*?)<\/title>/)[1]; }
const roomTitle = async () => { const t = await page.title(); return ROOMS.map(r => titles[r]).find(name => name !== 'Engage' && t.endsWith(name)) || (/(^| · )Engage$/.test(t) ? 'Engage' : t); };
assert.equal(new Set(Object.values(titles)).size, ROOMS.length, 'two rooms share a title, so the checks below could not tell them apart');
// Each room has drawn once its own script has run and left its hook (the bridge's is checked by bridgeReady).
const HOOKS = { '': 'engage', 'survey.html': 'survey', 'maru.html': 'maru', 'missions.html': 'missions', 'tonight.html': 'tonight', 'xeno.html': 'xeno', 'contact.html': 'contact', 'warp.html': 'warpScale', 'system.html': 'systemView', 'away.html': 'awayTeam', 'radio.html': 'radio', 'astrometrics.html': 'astrometrics', 'distress.html': 'distress', 'temporal.html': 'temporal', 'longway.html': 'longway', 'engineering.html': 'engineering', 'directive.html': 'directive', 'shipyard.html': 'shipyard' };
const drawn = room => page.waitForFunction(h => (h === 'engage' ? typeof window.engage?.jump === 'function' : !!window[h]), HOOKS[room], { timeout: 8000 });
net = 'down';
await ctx.setOffline(true);
for (const room of ROOMS) {
  await page.goto(base + room).catch(() => {});
  assert.equal(await roomTitle(), titles[room], `${room || 'the bridge'} did not open offline`);
  await drawn(room).catch(() => assert.fail(`${room || 'the bridge'} opened offline but its script never ran`));
}
await ctx.setOffline(false);

// On a connection that's up but not answering, each room opens from the copy too, after the worker's few seconds' wait
// for the network: the page and every file it loads (were any of them left waiting on the network, it wouldn't draw).
net = 'stalled';
for (const room of ROOMS) {
  const t0 = Date.now();
  await page.goto(base + room, { timeout: 10000 }).catch(() => {});
  await drawn(room).catch(() => {});
  const took = Date.now() - t0;
  assert.equal(await roomTitle(), titles[room], `${room || 'the bridge'} did not open on a stalled connection`);
  assert.ok(took < 8000, `${room || 'the bridge'} took ${took} ms to open on a stalled connection`);
  await drawn(room).catch(() => assert.fail(`${room || 'the bridge'} opened on a stalled connection but its script never ran`));
}
net = 'up';
for (const [req, res] of held.splice(0)) serve(req, res);

// A new release: every file in the new copy comes from the server, though the browser still has its own copies of
// the old ones for ten minutes. (The next release changes index.html, and so FILES in sw.js, as a real one does.)
await page.goto(base);
await bridgeReady();
release = true;
await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
await until(() => page.evaluate(async () => !!(await (await caches.match('index.html'))?.text())?.includes('<!-- the next release -->')),
  10000, "the new release's offline copy kept the old index.html");
release = false;

// Engage once shared junkdrawer.works/ with other tools, and with it one place for offline copies. When Engage's
// service worker starts, it clears out Engage's own old copy and leaves other tools' alone, even one whose name
// starts with Engage's. They're all made first, on a page of the site that doesn't start the service worker.
{
  const shared = await browser.newContext();
  const p = await shared.newPage();
  await p.goto(base + 'icon.svg');
  await p.evaluate(async () => {
    await (await caches.open('another-tool-v1')).put('another-tool/', new Response('another tool'));
    await (await caches.open('engage-x-v1')).put('engage-x/', new Response('a tool with a longer name'));
    await (await caches.open('engage-v0')).put('index.html', new Response('an old Engage'));
  });
  await p.goto(base);
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 });
  const has = name => p.evaluate(n => caches.has(n), name);
  assert.equal(await has('another-tool-v1'), true, 'starting up deleted another tool’s offline copy');
  assert.equal(await has('engage-x-v1'), true, 'starting up deleted the offline copy of a tool whose name starts with Engage’s');
  assert.equal(await has('engage-v0'), false, 'starting up left an old offline copy of Engage behind');
  await shared.close();
}

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();

// sw.js changes whenever a file it keeps does, so a release replaces the whole offline copy at once: FILES in sw.js is
// a fingerprint of every file in SHELL (sha1 of each, in the list's order, an address like './' read as its
// index.html; the first 8 hex of the sha1 of those).
// Everything the ten pages and their scripts load is on the list: a file left off opens online and not offline.
for (const f of ['index.html', 'survey.html', 'maru.html', 'missions.html', 'tonight.html', 'xeno.html', 'contact.html', 'warp.html', 'system.html', 'away.html', 'radio.html', 'astrometrics.html', 'distress.html', 'temporal.html', 'longway.html', 'engineering.html', 'directive.html', 'shipyard.html']) {
  const html = await readFile(join(root, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="((?:css|js|fonts|img|data)\/[^"#?]+|icon[^"#?]*|manifest\.webmanifest)"/g)) assert.ok(shell.includes(m[1]), `${f} loads ${m[1]}, which sw.js does not keep for offline`);
}
// And every script those scripts load in turn: a helper two rooms share is as easy to leave off.
for (const f of shell.filter(f => f.startsWith('js/'))) {
  const js = await readFile(join(root, f), 'utf8');
  for (const m of js.matchAll(/^(?:import|\} from)[^'\n]*'\.\/([\w-]+\.js)';/gm)) assert.ok(shell.includes(`js/${m[1]}`), `${f} loads js/${m[1]}, which sw.js does not keep for offline`);
}
// A link to any page previews as Engage's: each names the site, and says in words what its picture shows.
for (const f of ['index.html', 'survey.html', 'maru.html', 'missions.html', 'tonight.html', 'xeno.html', 'contact.html', 'warp.html', 'system.html', 'away.html', 'radio.html', 'astrometrics.html', 'distress.html', 'temporal.html', 'longway.html', 'engineering.html', 'directive.html', 'shipyard.html']) {
  const html = await readFile(join(root, f), 'utf8');
  assert.match(html, /<meta property="og:site_name" content="Engage">/, `${f} does not say which site it is part of`);
  const alt = html.match(/<meta property="og:image:alt" content="([^"]+)">/)?.[1] || '';
  assert.ok(alt.startsWith('Engage') && alt.length > 60 && alt.length < 200, `${f}'s preview picture has no description: “${alt}”`);
}
// A long press on the installed app's icon offers four rooms. Each shortcut opens a page the offline copy keeps, stays
// inside the app (a plain file name beside the manifest, like every other address in it), and has an icon that is kept too.
{
  const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.shortcuts.map(s => s.url), ['tonight.html', 'maru.html', 'contact.html', 'missions.html']);
  assert.deepEqual([manifest.start_url, manifest.scope], ['./', './']);
  for (const s of manifest.shortcuts) {
    assert.ok(shell.includes(s.url) && ROOMS.includes(s.url), `the shortcut to ${s.name} opens ${s.url}, which is not a room the offline copy keeps`);
    assert.ok(s.name && s.short_name.length <= 12 && s.description, `the shortcut to ${s.url} is missing a name or a description`);
    assert.match(await readFile(join(root, s.url), 'utf8'), new RegExp(`<title>${s.name} · Engage</title>`), `the shortcut called ${s.name} opens a page with another title`);
    for (const i of s.icons) assert.ok(shell.includes(i.src) && i.sizes === '192x192', `${s.name}'s icon ${i.src} is not kept for offline`);
    // Each has the picture of its own room's round button, not the app's icon again.
    assert.deepEqual(s.icons.map(i => i.src), [`img/shortcut-${s.url.replace('.html', '')}.png`], `the shortcut to ${s.name} has no icon of its own`);
    const png = await readFile(join(root, s.icons[0].src));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [192, 192], `${s.icons[0].src} is not 192 × 192`);
  }
}
const all = createHash('sha1');
for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
const files = all.digest('hex').slice(0, 8);
assert.equal(sw.match(/const FILES = '([0-9a-f]*)'/)?.[1], files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
console.log('all good');
