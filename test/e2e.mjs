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

// On a small phone, or any phone turned on its side, the welcome card is taller than the screen, so it scrolls and
// Take the helm can still be reached. It opens at the top all the same, though Take the helm has the focus.
for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
  const small = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await small.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await bridgeReady(p);
  assert.equal(await p.locator('#intro').evaluate(el => el.scrollTop), 0, `the welcome card opened scrolled down past its heading on a ${viewport.width}×${viewport.height} screen`);
  const touch = await small.newCDPSession(p);
  const x = viewport.width / 2, from = viewport.height - 40, to = 40;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
  for (let i = 1; i <= 10; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / 10 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(600);
  const go = await p.locator('#intro-go').boundingBox();
  assert.ok(go.y + go.height <= viewport.height, `Take the helm is below the bottom of a ${viewport.width}×${viewport.height} screen`);
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
  await q.tap('#choose');
  assert.equal(await q.evaluate(() => document.activeElement?.closest('.sheet')?.id + ' ' + document.activeElement?.className), 'picker close', 'Set course did not focus its close button on a phone');
  await phone.close();
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
assert.equal(await text('#where'), 'Proxima Centauri');
assert.equal(await page.locator('#console').evaluate(el => el.inert), false, 'the helm stayed out of reach after arriving');
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
assert.deepEqual(await page.locator('#arrival-entry .entry-actions > *').evaluateAll(els => els.map(el => [el.textContent, el.getAttribute('href')])), [['In your sky tonight', 'tonight.html#star=Proxima%20Centauri']]);
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
assert.match(await text('#stats'), /1 star visited · 4\.2\d ly traveled/);
assert.match((await text('#records')).replace(/\s+/g, ' '), /^FARTHEST FROM SOL Proxima Centauri · 4\.2\d ly LONGEST TRIP 4\.2\d ly to Proxima Centauri CHARTED DESTINATIONS 2 of 32$/);
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

// When the browser's storage is full (the other tools at junkdrawer.works share it), a new log entry can't be kept.
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
// A long sitting: 60 more worlds. Each quiz world is painted for itself and let go with it, so the painted maps
// kept for good stay at the 17 survey files' own (two sizes each) however long the quiz runs.
for (let n = 0; n < 60; n++) {
  await page.click('#drill-next');
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
await page.click('#again');
assert.match(await text('#runs'), /The lifeboat/);
assert.equal(await shown('#rewrite'), true, 'no way to reprogram the simulator after a run');
await page.click('#rewrite');
await order('enter');
for (let i = 0; i < 6; i++) await order('beam');
await order('warp');
await page.click('#read-eval');
assert.equal(await text('#eval-title'), 'Changed the rules');
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
assert.match(await text('#hail-note'), /If she answered at once/);
await page.click('#hail');
assert.ok(Math.abs(await page.evaluate(() => Date.now() - missions.hails.v1) - 30 * 3600e3) < 5000, 'a tap wiped a hail whose answer was still due');
await page.evaluate(() => { missions.hails.v1 = Date.now() - 60 * 3600e3; });
await page.waitForFunction(() => document.getElementById('hail').textContent === 'Hail her again');
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
await page.locator('.ship-tab[data-id="v2"]').click();
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
assert.match(await page.locator('.system.trek').first().innerText(), /Vulcan|Capella|Aldebaran|Rigel|Pollux|Farpoint|Vega|Altair/);
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
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'tonight’s sky scrolls sideways on a phone');

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
    /^FARTHEST FROM SOL Alpheratz · 97\.0 ly; LONGEST TRIP 90\.3 ly to (Alpheratz|Vega); MOST VISITED Vega · 2 visits; CHARTED DESTINATIONS 2 of 32$/);
  assert.equal(await p.locator('.past').nth(0).locator('[data-again]').count(), 0, 'the log offers a course for the star the ship is at');
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
  assert.match(await p.locator('#card-course').innerText(), /^Set course for Vega again$/i);
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
  // A star the ship hasn't been to says nothing about it, and offers a first course.
  await p.evaluate(() => { location.hash = '#star=Deneb'; });
  await p.waitForFunction(() => document.getElementById('card-title').textContent === 'Farpoint');
  assert.equal(await p.locator('#card-been').evaluate(el => el.hidden), true);
  assert.match(await p.locator('#card-course').innerText(), /^Set course for Deneb$/i);
  await p.click('#card .close');
  await p.click('#open-list');
  assert.match(await p.locator('#list-note').innerText(), /You’ve flown to 2 of the stars listed here\.$/);
  assert.equal(await p.locator('#systems .s-been').count(), 2);
  assert.ok(await p.evaluate(() => localStorage.getItem('engage.v1')) === bridgeSave, 'tonight’s sky wrote to the bridge’s save');
  await been.close();
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
assert.equal(await page.locator('#jars .jar').count(), 1, 'the jar was not kept');
// Letting one go can be taken back, and the count beside Keep links down to the jars.
assert.match(await text('#kept-note'), /^1 kept in your jars/);
await page.click('#jars .jar-drop');
assert.equal(await page.locator('#jars .jar').count(), 0);
assert.match(await text('#jar-undo'), /^Let the .+ go\.\s+Undo$/i);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars.length), 0);
await page.click('#jar-undo-go');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('engage.xeno.v1')).jars), [{ id: 'lava-world', seed: 7 }], 'Undo did not put the creature back in its jar');
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
assert.deepEqual(await page.evaluate(() => xeno.jars[39]), { id: 'M', seed: 1 }, 'the first creature kept was dropped to make room');
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
await Promise.all([page.waitForNavigation(), page.locator('#file a', { hasText: 'Grow a creature' }).click()]);
await page.waitForFunction(() => window.xeno?.current);
assert.equal(await page.evaluate(() => xeno.current.classId), 'O');
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
await page.click('#send');
assert.equal(await text('#eval-title'), 'First contact');
assert.match(await text('#eval-score'), /^1\/1[0-9]/, 'the one right guess is not counted');
assert.ok(await shown('#eval-story'), 'their new phrase is missing');
await page.click('#again');
assert.match(await text('#runs'), /1 of 1[0-9] phrases decoded/);
await page.reload();
await page.waitForFunction(() => window.contact);
assert.equal(await page.locator('#runs li').count(), 1, 'the record was not kept');
await page.goto(base);
await bridgeReady();

// The warp scale: reached from under the warp slider with the helm's warp factor, a race to the galactic core run to
// the end, another place picked from the ladder, and a link back to the bridge with a course set.
await page.evaluate(() => { const w = document.getElementById('warp'); w.value = 7.5; w.dispatchEvent(new Event('input')); });
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
await page.reload();
await page.waitForFunction(() => window.warpScale);
assert.equal(await page.evaluate(() => warpScale.place), 'vulcan', 'the place was not remembered');
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

// Works offline once it has been opened: every room, not only the bridge. The server goes down as well as the
// browser: in some Chromium builds the browser's offline switch alone doesn't stop the service worker's own requests.
const ROOMS = ['', 'survey.html', 'maru.html', 'missions.html', 'tonight.html', 'xeno.html', 'contact.html', 'warp.html'];
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
for (const room of ROOMS) { await page.goto(base + room); titles[room] = await page.title(); }
assert.equal(new Set(Object.values(titles)).size, ROOMS.length, 'two rooms share a title, so the checks below could not tell them apart');
// Each room has drawn once its own script has run and left its hook (the bridge's is checked by bridgeReady).
const HOOKS = { '': 'engage', 'survey.html': 'survey', 'maru.html': 'maru', 'missions.html': 'missions', 'tonight.html': 'tonight', 'xeno.html': 'xeno', 'contact.html': 'contact', 'warp.html': 'warpScale' };
const drawn = room => page.waitForFunction(h => (h === 'engage' ? typeof window.engage?.jump === 'function' : !!window[h]), HOOKS[room], { timeout: 8000 });
net = 'down';
await ctx.setOffline(true);
for (const room of ROOMS) {
  await page.goto(base + room).catch(() => {});
  assert.equal(await page.title(), titles[room], `${room || 'the bridge'} did not open offline`);
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
  assert.equal(await page.title(), titles[room], `${room || 'the bridge'} did not open on a stalled connection`);
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

// Every tool at junkdrawer.works/ shares one address, and with it one place for offline copies. When Engage's
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
// Everything the eight pages and their scripts load is on the list: a file left off opens online and not offline.
for (const f of ['index.html', 'survey.html', 'maru.html', 'missions.html', 'tonight.html', 'xeno.html', 'contact.html', 'warp.html']) {
  const html = await readFile(join(root, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="((?:css|js|fonts|img|data)\/[^"#?]+|icon[^"#?]*|manifest\.webmanifest)"/g)) assert.ok(shell.includes(m[1]), `${f} loads ${m[1]}, which sw.js does not keep for offline`);
}
const all = createHash('sha1');
for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
const files = all.digest('hex').slice(0, 8);
assert.equal(sw.match(/const FILES = '([0-9a-f]*)'/)?.[1], files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
console.log('all good');
