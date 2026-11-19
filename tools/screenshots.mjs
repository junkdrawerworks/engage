// Renders the README screenshots (docs/*.png) and the link previews (og.png, og-survey.png, og-maru.png, og-missions.png, og-tonight.png, og-xeno.png, og-contact.png, og-warp.png, og-system.png, og-away.png, og-radio.png, og-astrometrics.png, og-distress.png, og-temporal.png):  node tools/screenshots.mjs
// Only the planetary survey's, the Kobayashi Maru's or long missions':  node tools/screenshots.mjs survey  (or maru, missions, tonight, xeno, contact, warp, system, away, radio, astrometrics, distress or temporal; bridge for the bridge's four phone pictures; courses for the shared courses' pictures, course/*.png)
// Math.random is seeded, so the warp streaks come out the same each time. Needs Playwright, and upng-js from `npm install`.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.bin': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const SEED = 4;
const CONTACT = 6; // the encounter in first contact's pictures
const only = process.argv[2];
// Headless Chromium draws WebGL in software.
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(join(root, 'docs'), { recursive: true });

// Saves a screenshot with a 256-colour palette, which keeps the pictures a fraction of the size.
async function save(shot, path) {
  const img = UPNG.decode(shot);
  await writeFile(join(root, path), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}

async function open(viewport, deviceScaleFactor) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(seed => {
    let a = seed; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    localStorage.setItem('engage.v1', JSON.stringify({ seenIntro: true }));
  }, SEED);
  await page.goto(base);
  await page.waitForFunction(() => typeof window.engage?.jump === 'function'); // not just the Engage button, by its id
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => engage.holdBehave?.(0.5)); // a star that behaves (Proxima) is pictured between flares
  return page;
}

// Phone screenshots for the README.
if (!only || only === 'bridge') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.evaluate(() => engage.target('Proxima Centauri'));
  await page.waitForTimeout(1400);
  await save(await page.screenshot(), 'docs/phone-helm.png');

  await page.evaluate(() => engage.freeze('Proxima Centauri', 0.42));
  await page.waitForTimeout(700);
  await save(await page.screenshot(), 'docs/phone-warp.png');

  await page.reload();
  await page.waitForFunction(() => typeof window.engage?.jump === 'function'); // not just the Engage button, by its id
  await page.evaluate(() => { engage.holdBehave(0.5); engage.speed(10); engage.target('Proxima Centauri'); });
  await page.click('#engage');
  await page.waitForFunction(() => !document.getElementById('arrival').hidden, null, { timeout: 20000 });
  await page.waitForTimeout(1600);
  await save(await page.screenshot(), 'docs/phone-log.png');

  await page.click('#arrival-home');
  await page.waitForTimeout(4200);
  await save(await page.screenshot(), 'docs/phone-home.png');
  await page.context().close();
}

// Link preview, 1200 x 630: a card with the name on the left and the viewscreen at warp on the right.
if (!only) {
  const page = await open({ width: 640, height: 630 }, 1);
  await page.evaluate(() => { engage.state.opts.labels = false; engage.freeze('Rigil Kentaurus', 0.36); });
  await page.waitForTimeout(700);
  const shot = await page.evaluate(() => engage.snapshot());
  await page.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: #05070d; color: #e8edf6; display: flex; overflow: hidden; }
    .text { width: 560px; padding: 0 0 0 72px; display: flex; flex-direction: column; justify-content: center; position: relative; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #ffb54a; }
    h1 { margin: 10px 0 18px; font: 600 104px/1 C; letter-spacing: .1em; text-transform: uppercase; }
    p { margin: 0; font: 34px/1.3 P; color: #cdd5e3; max-width: 440px; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #86d8ff; }
    .view { position: absolute; right: 0; top: 0; width: 640px; height: 630px; background: url(${shot}) center / cover; }
    .view::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #05070d 0%, rgba(5,7,13,0) 30%); }
  </style>
  <div class="text"><div class="eyebrow">Warp 9 · real stars</div><h1>Engage</h1><p>Set course for a real star, pick a warp factor and go.</p><div class="meta">18,000 stars, each in its real place</div></div>
  <div class="view"></div>`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og.png');
  await card.context().close();
}

// The planetary survey: a phone screenshot for the README, and its link preview with a row of planets.
if (!only || only === 'survey') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'survey.html#O');
  await page.waitForFunction(() => window.survey);
  await page.waitForTimeout(2500);
  await save(await page.screenshot(), 'docs/phone-survey.png');
  const planets = await page.evaluate(async () => {
    const { paint, portrait } = await import('./js/planet-art.js');
    return [['earth', 3], ['jovian', 1], ['lava', 1], ['icegiant', 4], ['mars', 1]].map(([s, seed]) => portrait(paint(s, seed, 512), 520, 0.9).toDataURL());
  });
  await page.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(ellipse at 75% 50%, #111b33, #05070d 70%); color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #ffb54a; }
    h1 { margin: 10px 0 18px; font: 600 80px/1 C; letter-spacing: .04em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; max-width: 470px; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #86d8ff; }
    img { position: absolute; }
  </style>
  <div class="text"><div class="eyebrow">Engage · Science station</div><h1>Planetary survey</h1><p>Starfleet’s planet classes, next to the real planets astronomers have found.</p><div class="meta">From Class M to Demon class</div></div>
  <img src="${planets[1]}" style="left:690px; top:-40px; width:420px">
  <img src="${planets[0]}" style="left:610px; top:270px; width:330px">
  <img src="${planets[2]}" style="left:930px; top:330px; width:260px">
  <img src="${planets[3]}" style="left:1050px; top:110px; width:200px">
  <img src="${planets[4]}" style="left:560px; top:120px; width:150px">`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og-survey.png');
  await card.context().close();
}

// The Kobayashi Maru: a phone screenshot mid-battle for the README, and its link preview with the tactical display.
if (!only || only === 'maru') {
  const play = async (page, plan) => {
    for (const id of plan) {
      await page.click(`.order[data-id="${id}"]`);
      await page.waitForFunction(() => !maru.busy, null, { timeout: 20000 });
    }
  };
  // Each run is seeded from the clock. This moment gives the README's picture: 150 aboard, the hull at 51%, five cruisers.
  const page = await open({ width: 390, height: 844 }, 2);
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:12Z'));
  await page.goto(base + 'maru.html');
  await page.waitForFunction(() => window.maru);
  await page.click('#start');
  await play(page, ['hail-maru', 'enter', 'beam', 'beam']);
  await page.click('.order[data-id="phasers"]');
  await page.waitForTimeout(450);
  await save(await page.screenshot(), 'docs/phone-maru.png');
  await page.context().close();

  const wide = await open({ width: 700, height: 900 }, 1);
  await wide.clock.setFixedTime(new Date('2026-10-20T12:00:12Z'));
  await wide.goto(base + 'maru.html');
  await wide.waitForFunction(() => window.maru);
  await wide.click('#start');
  await play(wide, ['enter', 'beam', 'torpedoes']);
  await wide.waitForTimeout(400);
  const shot = await wide.evaluate(() => document.getElementById('plot').toDataURL());
  await wide.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(ellipse at 20% 0%, #3a0f14, #05070d 65%); color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #ff6b5e; }
    h1 { margin: 10px 0 18px; font: 600 80px/1 C; letter-spacing: .03em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; max-width: 470px; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #ffb54a; }
    .view { position: absolute; right: 0; top: 0; width: 640px; height: 630px; background: url(${shot}) 70% center / cover; }
    .view::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #05070d 0%, rgba(5,7,13,0) 35%); }
  </style>
  <div class="view"></div>
  <div class="text"><div class="eyebrow">Engage · Starfleet Academy</div><h1>Kobayashi Maru</h1><p>The no-win test. You can’t save everyone, so you’re graded on how you lose.</p><div class="meta">One order a turn</div></div>`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og-maru.png');
  await card.context().close();
}

// Long missions: a phone screenshot of the map for the README, and its link preview with the map beside the words.
if (!only || only === 'missions') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'missions.html#v1');
  await page.waitForFunction(() => window.missions);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await save(await page.screenshot(), 'docs/phone-missions.png');
  await page.context().close();

  const wide = await open({ width: 640, height: 700 }, 1);
  await wide.goto(base + 'missions.html#v1');
  await wide.waitForFunction(() => window.missions);
  await wide.evaluate(() => document.fonts.ready);
  await wide.waitForTimeout(600);
  const shot = await wide.evaluate(() => document.getElementById('map').toDataURL());
  await wide.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(ellipse at 20% 0%, #13213d, #05070d 65%); color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 540px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #86d8ff; }
    h1 { margin: 10px 0 18px; font: 600 80px/1 C; letter-spacing: .03em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; max-width: 500px; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #ffb54a; }
    .view { position: absolute; right: -10px; top: -30px; width: 640px; height: 700px; background: url(${shot}) center / contain no-repeat; }
  </style>
  <div class="view"></div>
  <div class="text"><div class="eyebrow">Engage · Long-range sensors</div><h1>Long missions</h1><p>The Voyagers, New Horizons, Webb and the Pioneers, where they are right now.</p><div class="meta">From NASA’s own trajectories</div></div>`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og-missions.png');
  await card.context().close();
}

// Tonight's sky: a phone screenshot facing east from New York after midnight, and its link preview.
if (!only || only === 'tonight') {
  const setUp = () => { tonight.place(40.71, -74.01, 'New York', 'America/New_York'); tonight.at('2026-10-11T04:30:00Z'); tonight.look(105, 32, 82); };
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'tonight.html');
  await page.waitForFunction(() => window.tonight);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(setUp);
  await page.waitForTimeout(400);
  await save(await page.screenshot(), 'docs/phone-tonight.png');
  await page.context().close();

  const wide = await open({ width: 700, height: 630 }, 1);
  await wide.goto(base + 'tonight.html');
  await wide.waitForFunction(() => window.tonight);
  await wide.evaluate(() => document.fonts.ready);
  await wide.evaluate(setUp);
  await wide.waitForTimeout(400);
  const shot = await wide.evaluate(() => document.getElementById('view').toDataURL());
  await wide.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: #05070d; color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 64px; top: 0; bottom: 0; width: 500px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #86d8ff; }
    h1 { margin: 10px 0 18px; font: 600 76px/1 C; letter-spacing: .03em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #ffb54a; }
    .view { position: absolute; right: 0; top: 0; width: 700px; height: 630px; background: url(${shot}) center / cover no-repeat; }
    .view::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #05070d 0%, rgba(5, 7, 13, 0) 30%); }
  </style>
  <div class="view"></div>
  <div class="text"><div class="eyebrow">Engage · Tonight’s sky</div><h1>Starfleet style</h1><p>Point your phone at the sky and see where Vulcan is tonight.</p><div class="meta">Every star tagged where it really is</div></div>`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og-tonight.png');
  await card.context().close();
}

// The xenobiology lab: a phone screenshot, and a link preview with three creatures in their tanks.
if (!only || only === 'xeno') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // grown at once, standing still
  await page.goto(base + 'xeno.html#H-37');
  await page.waitForFunction(() => window.xeno?.current);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await save(await page.screenshot(), 'docs/phone-xeno.png');
  const tanks = await page.evaluate(async () => {
    const { grow } = await import('./js/xeno-gen.js');
    const { drawScene } = await import('./js/xeno-art.js');
    return [['H', 37], ['J', 1], ['P', 74]].map(([id, seed]) => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 600;
      const g = c.getContext('2d'); g.scale(2, 2);
      drawScene(g, grow(id, seed), 400, 300, 1.3, 1);
      return c.toDataURL();
    });
  });
  await page.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(ellipse at 75% 50%, #111b33, #05070d 70%); color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 500px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #6fe3a4; }
    h1 { margin: 10px 0 18px; font: 600 76px/1 C; letter-spacing: .03em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #ffb54a; }
    img { position: absolute; border-radius: 22px; border: 2px solid rgba(140,180,255,.32); box-shadow: 0 20px 50px rgba(0,0,0,.6); }
  </style>
  <div class="text"><div class="eyebrow">Engage · Science station</div><h1>Xenobiology lab</h1><p>Pick a planet class and grow something that could live there.</p><div class="meta">Shaped by gravity, air, light and heat</div></div>
  <img src="${tanks[1]}" style="left:610px; top:40px; width:340px">
  <img src="${tanks[2]}" style="left:890px; top:110px; width:290px">
  <img src="${tanks[0]}" style="left:670px; top:320px; width:380px">`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og-xeno.png');
  await card.context().close();
}

// First contact: a phone screenshot partway in, with guesses in the notebook, and a link preview with the viewscreen.
if (!only || only === 'contact') {
  const settle = p => p.waitForFunction(() => !contact.busy, null, { timeout: 20000 });
  const page = await open({ width: 390, height: 844 }, 2);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // every line at once, the captain standing still
  await page.goto(base + 'contact.html');
  await page.waitForFunction(() => window.contact);
  await page.evaluate(seed => contact.start(seed), CONTACT);
  await settle(page);
  await page.evaluate(() => { contact.tag('meet', 'meet'); contact.pick('meet'); contact.send(); });
  await settle(page);
  await page.evaluate(() => { contact.tag('yes', 'yes'); contact.tag('see', 'see'); contact.pick('see'); });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await save(await page.screenshot(), 'docs/phone-contact.png');
  await page.context().close();

  const wide = await open({ width: 760, height: 900 }, 2);
  await wide.emulateMedia({ reducedMotion: 'reduce' });
  await wide.goto(base + 'contact.html');
  await wide.waitForFunction(() => window.contact);
  await wide.evaluate(seed => contact.start(seed), CONTACT);
  await settle(wide);
  await wide.evaluate(() => { contact.pick('meet'); contact.send(); });
  await settle(wide);
  await wide.waitForTimeout(400);
  const shot = await wide.evaluate(() => document.getElementById('screen').toDataURL());
  await wide.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(ellipse at 20% 0%, #2a1a48, #05070d 65%); color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #c9a2ff; }
    h1 { margin: 10px 0 18px; font: 600 80px/1 C; letter-spacing: .03em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #ffb54a; }
    /* The viewscreen is wider than this half of the card, so it is drawn a little smaller than the card is tall and
       set so that the picture they are sending, frame and caption, clears the right edge by 40 px (it used to run
       off it: "TRANSMITTED IMAG"). Its top, bottom and right edges fade into the card. */
    .view { position: absolute; right: 0; top: 0; width: 700px; height: 630px; background: #05070d url(${shot}) -149px center / auto 580px no-repeat; }
    .view::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #05070d 0%, rgba(5,7,13,0) 30%), linear-gradient(270deg, #05070d 0%, rgba(5,7,13,0) 5%), linear-gradient(180deg, #05070d 4%, rgba(5,7,13,0) 14%, rgba(5,7,13,0) 86%, #05070d 96%); }
  </style>
  <div class="view"></div>
  <div class="text"><div class="eyebrow">Engage · Communications</div><h1>First contact</h1><p>They speak in stories. Work out what they mean, and answer in their words.</p><div class="meta">A new language every time</div></div>`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og-contact.png');
  await card.context().close();
}

// The warp scale: a phone screenshot partway through the race to the galactic core, and a link preview with the race.
if (!only || only === 'warp') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'warp.html#core');
  await page.waitForFunction(() => window.warpScale);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => warpScale.freeze(warpScale.trip.clock.when(300)));
  await page.waitForTimeout(300);
  await save(await page.screenshot(), 'docs/phone-scale.png');
  await page.context().close();

  const wide = await open({ width: 560, height: 900 }, 2);
  await wide.goto(base + 'warp.html#core');
  await wide.waitForFunction(() => window.warpScale);
  await wide.evaluate(() => document.fonts.ready);
  await wide.evaluate(() => warpScale.freeze(warpScale.trip.clock.when(300)));
  await wide.waitForTimeout(300);
  const [shot, aspect] = await wide.evaluate(() => { const c = document.getElementById('race'); return [c.toDataURL(), c.height / c.width]; });
  await wide.context().close();

  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(ellipse at 20% 0%, #2a2148, #05070d 65%); color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #ffb54a; }
    h1 { margin: 10px 0 18px; font: 600 80px/1 C; letter-spacing: .03em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #c9a2ff; }
    .view { position: absolute; right: 48px; top: 50%; transform: translateY(-50%); width: ${Math.round(480 / aspect)}px; height: 480px; border-radius: 24px; border: 1px solid rgba(140,180,255,.32); background: url(${shot}) center / 100% 100%; }
  </style>
  <div class="view"></div>
  <div class="text"><div class="eyebrow">Engage · Navigation</div><h1>Warp scale</h1><p>Earth to the galactic core at warp 1, 5 and 9.975.</p><div class="meta">From the Moon to Andromeda</div></div>`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), 'og-warp.png');
  await card.context().close();
}

// The pictures for the shared courses' own pages (course/*.html, see js/courses.js and tools/course-pages.mjs): each
// destination as the viewscreen shows it on arrival, beside its name, how far it is and what Starfleet put there.
// Only with `courses` named or nothing: thirty-one of them take a while.
// The system view and the away team: TRAPPIST-1 from above, and standing on TRAPPIST-1 e.
const ogCard = async (shot, aspect, eyebrow, title, line, meta, out) => {
  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><style>
    @font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }
    body { margin: 0; width: 1200px; height: 630px; background: radial-gradient(ellipse at 20% 0%, #13283a, #05070d 65%); color: #e8edf6; overflow: hidden; position: relative; }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; z-index: 1; }
    .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #ffb54a; }
    h1 { margin: 10px 0 18px; font: 600 80px/1 C; letter-spacing: .03em; }
    p { margin: 0; font: 32px/1.3 P; color: #cdd5e3; }
    .meta { margin-top: 30px; font: 600 22px C; letter-spacing: .08em; color: #62d68c; }
    .view { position: absolute; right: 48px; top: 50%; transform: translateY(-50%); width: ${Math.round(520 / aspect)}px; height: 520px; border-radius: 24px; border: 1px solid rgba(140,180,255,.32); background: url(${shot}) center / 100% 100%; }
  </style>
  <div class="view"></div>
  <div class="text"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${line}</p><div class="meta">${meta}</div></div>`);
  await card.waitForTimeout(300);
  await save(await card.screenshot(), out);
  await card.context().close();
};
if (!only || only === 'system') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'system.html#star=TRAPPIST-1');
  await page.waitForFunction(() => window.systemView?.ready && systemView.painted === 7, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);
  await save(await page.screenshot(), 'docs/phone-system.png');
  const [shot] = await page.evaluate(() => [document.getElementById('orrery').toDataURL()]);
  await page.context().close();
  await ogCard(shot, 1, 'Engage · Science station', 'System view', 'Fly in to the real planets of Proxima, TRAPPIST-1 and home.', 'And place one of your own', 'og-system.png');
}
if (!only || only === 'away') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'away.html#world=TRAPPIST-1%20e');
  await page.waitForFunction(() => window.awayTeam?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await save(await page.screenshot(), 'docs/phone-away.png');
  await page.context().close();
  const wide = await open({ width: 600, height: 900 }, 2);
  await wide.goto(base + 'away.html#world=TRAPPIST-1%20e');
  await wide.waitForFunction(() => window.awayTeam?.ready);
  await wide.waitForTimeout(800);
  const [shot, aspect] = await wide.evaluate(() => { const c = document.getElementById('sky'); return [c.toDataURL(), c.height / c.width]; });
  await wide.context().close();
  await ogCard(shot, aspect, 'Engage · Transporter room', 'Away team', 'Beam down and stand on a real planet, under its own sun.', 'TRAPPIST-1 e, Proxima b, Mars', 'og-away.png');
}

// Subspace radio: the stars hearing 1966, the year Star Trek went out, on the dial.
if (!only || only === 'radio') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'radio.html#year=1966');
  await page.waitForFunction(() => window.radio?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.screen').getBoundingClientRect().top + scrollY - 140));
  await page.waitForTimeout(200);
  await save(await page.screenshot(), 'docs/phone-radio.png');
  const [shot] = await page.evaluate(() => [document.getElementById('radio-map').toDataURL()]);
  await page.context().close();
  await ogCard(shot, 1, 'Engage · Communications', 'Subspace radio', 'Which real stars are hearing 1966, the year Star Trek went out, tonight?', 'And the real messages in flight', 'og-radio.png');
}

// Astrometrics: every star on the wall, Arcturus picked, and the Sun's life at its red giant.
if (!only || only === 'astrometrics') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'astrometrics.html#star=Arcturus');
  await page.waitForFunction(() => window.astrometrics?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await save(await page.screenshot(), 'docs/phone-astrometrics.png');
  await page.context().close();
  const wide = await open({ width: 1000, height: 900 }, 1);
  await wide.goto(base + 'astrometrics.html#sun=4');
  await wide.waitForFunction(() => window.astrometrics?.ready);
  await wide.evaluate(() => document.fonts.ready);
  await wide.waitForTimeout(400);
  const [shot, aspect] = await wide.evaluate(() => { const c = document.getElementById('wall'); return [c.toDataURL(), c.height / c.width]; });
  await wide.context().close();
  await ogCard(shot, aspect, 'Engage · Astrometrics lab', 'Astrometrics', '17,000 real stars by colour and true brightness.', 'And the Sun’s life, to white dwarf', 'og-astrometrics.png');
}

// The distress call: a call from Procyon, cleaned once, with Procyon picked on Earth's sky; and for the link preview,
// the debrief's sky from Procyon, our Sun in Aquila.
if (!only || only === 'distress') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'distress.html');
  await page.waitForFunction(() => window.distress?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { distress.startAt('Procyon'); distress.hold(true); });
  await page.click('#clean');
  await page.evaluate(() => { distress.turnTo('Betelgeuse'); distress.choose('Procyon'); });
  await page.waitForTimeout(300);
  await save(await page.screenshot(), 'docs/phone-distress.png');
  await page.context().close();
  const wide = await open({ width: 1000, height: 900 }, 1);
  await wide.goto(base + 'distress.html');
  await wide.waitForFunction(() => window.distress?.ready);
  await wide.evaluate(() => document.fonts.ready);
  await wide.evaluate(() => { distress.startAt('Procyon'); distress.hold(true); distress.finish(); });
  await wide.waitForTimeout(400);
  const [shot, aspect] = await wide.evaluate(() => { const c = document.getElementById('chart'); return [c.toDataURL(), c.height / c.width]; });
  await wide.context().close();
  await ogCard(shot, aspect, 'Engage · Communications', 'Distress call', 'Survivors describe their sky. Find their star before their air runs out.', 'Every star has a sky of its own', 'og-distress.png');
}

// The temporal observatory: the Big Dipper 50,000 years on, come apart from today's dashed shape.
if (!only || only === 'temporal') {
  const page = await open({ width: 390, height: 844 }, 2);
  await page.goto(base + 'temporal.html#year=52026');
  await page.waitForFunction(() => window.temporal?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.click('#to-dipper');
  await page.evaluate(() => scrollTo(0, 120));
  await page.waitForTimeout(300);
  await save(await page.screenshot(), 'docs/phone-temporal.png');
  await page.context().close();
  const wide = await open({ width: 1000, height: 900 }, 1);
  await wide.goto(base + 'temporal.html#year=52026');
  await wide.waitForFunction(() => window.temporal?.ready);
  await wide.evaluate(() => document.fonts.ready);
  await wide.click('#to-dipper');
  await wide.waitForTimeout(400);
  const [shot, aspect] = await wide.evaluate(() => { const c = document.getElementById('chart'); return [c.toDataURL(), c.height / c.width]; });
  await wide.context().close();
  await ogCard(shot, aspect, 'Engage · Stellar cartography', 'Temporal observatory', 'The real sky of another century, 100,000 years either way.', 'The Big Dipper in AD 52,026', 'og-temporal.png');
}

if (!only || only === 'courses') {
  const { SHARED, COURSES, courseSlug, courseCaption } = await import('../js/courses.js');
  const font = async f => (await readFile(join(root, 'fonts', f))).toString('base64');
  const fonts = `@font-face { font-family: C; font-weight: 600; src: url(data:font/woff2;base64,${await font('chakra-petch-600.woff2')}); }
    @font-face { font-family: P; src: url(data:font/woff2;base64,${await font('ibm-plex-sans.woff2')}); }`;
  const page = await open({ width: 800, height: 630 }, 1); // wide enough that the star settles in the middle
  await page.evaluate(() => { engage.state.opts.labels = false; });
  const card = await open({ width: 1200, height: 630 }, 1);
  await mkdir(join(root, COURSES), { recursive: true });
  for (const d of SHARED) {
    const ly = await page.evaluate(star => {
      engage.jump(star);
      engage.closeSheets();
      engage.lookAtStar(star);
      const c = engage.cat(), i = c.byName.get(star);
      return Math.hypot(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]) * 3.26156;
    }, d.star);
    await page.waitForTimeout(1600); // the view turns to the star
    const shot = await page.evaluate(() => engage.snapshot());
    const named = d.title;
    const size = named.length > 13 ? 64 : named.length > 9 ? 80 : 96;
    await card.setContent(`<!doctype html><style>
      ${fonts}
      body { margin: 0; width: 1200px; height: 630px; background: #05070d; color: #e8edf6; overflow: hidden; position: relative; }
      .view { position: absolute; right: 0; top: 0; width: 800px; height: 630px; background: url(${shot}) center / cover; }
      .view::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #05070d 0%, rgba(5,7,13,.85) 28%, rgba(5,7,13,0) 60%); }
      .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; }
      .eyebrow { font: 600 22px C; letter-spacing: .18em; text-transform: uppercase; color: #ffb54a; }
      h1 { margin: 12px 0 22px; font: 600 ${size}px/1 C; letter-spacing: .04em; }
      .meta { font: 600 26px/1.35 C; letter-spacing: .06em; color: #86d8ff; }
      .site { margin-top: 34px; font: 22px P; color: #93a0b8; }
    </style>
    <div class="view"></div>
    <div class="text"><div class="eyebrow">Set course for</div><h1>${named}</h1><div class="meta">${courseCaption(d, ly).replace(/ · /g, ' <span style="color:#ffb54a">·</span> ')}</div><div class="site">Engage: warp to real stars</div></div>`);
    await card.waitForTimeout(150);
    await save(await card.screenshot(), `${COURSES}${courseSlug(d.title)}.png`);
  }
  await page.context().close();
  await card.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');
