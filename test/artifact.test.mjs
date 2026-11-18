// The single-file copies for the Artifact viewer (tools/build-artifact.mjs): built into a temporary folder, each of
// the eight opened in Chromium the way the viewer opens it (the file's contents inside a page of the viewer's own),
// and held to starting with no errors, asking the network for nothing, and linking only to the live site.
// The build lists each page's modules by hand. A module a page starts to import and the list doesn't have used to
// leave a copy that opened to nothing, and no test built them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = 'https://junkdrawer.works/engage/';
const VIEWER = 'https://viewer.test/artifact';

// Each copy, how to tell it has started, and something to open in it so the links it writes as it goes are there too.
const COPIES = [
  ['engage', () => typeof window.engage?.jump === 'function', () => {}],
  ['survey', () => !!window.survey && !!document.querySelector('#file h2'), () => window.survey.open('K')],
  ['maru', () => !!window.maru, () => {}],
  ['missions', () => !!window.missions && !!document.getElementById('ship-name').textContent, () => window.missions.choose('v1')],
  ['tonight', () => !!window.tonight, () => window.tonight.show({ kind: 'planet', name: 'mars' })],
  ['xeno', () => !!window.xeno?.current, () => window.xeno.show('M', 1218)],
  ['contact', () => !!window.contact, () => {}],
  ['warp', () => !!window.warpScale?.trip, () => window.warpScale.select('voyager')],
];

test('the single-file copies build, start, and keep to themselves', { timeout: 300000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engage-artifact-'));
  let browser;
  try {
    execFileSync(process.execPath, [join(root, 'tools/build-artifact.mjs'), dir], { stdio: 'pipe' });
    browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const [name, started, open] of COPIES) {
      const body = await readFile(join(dir, `${name}.html`), 'utf8');
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const errors = [], asked = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.route('**/*', r => {
        if (r.request().url() === VIEWER) return r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>` });
        asked.push(r.request().url());
        return r.abort();
      });
      await page.goto(VIEWER, { waitUntil: 'load' });
      try { await page.waitForFunction(started, null, { timeout: 30000 }); } catch { /* said below, with the page's own errors */ }
      assert.deepEqual(errors, [], `${name}.html had errors as it started`);
      assert.equal(await page.evaluate(started), true, `${name}.html did not start`);
      await page.evaluate(open);
      await page.waitForTimeout(300);
      assert.deepEqual(errors, [], `${name}.html had errors`);
      assert.deepEqual(asked, [], `${name}.html asked the network for something`);
      // Every link either stays on the page (#...) or goes to the live site: the viewer has no other pages.
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
      const astray = [...new Set(links.filter(h => !h.startsWith('#') && !h.startsWith('https://junkdrawer.works/')))];
      assert.deepEqual(astray, [], `${name}.html has links that go nowhere in the viewer`);
      assert.ok(links.some(h => h.startsWith(LIVE)), `${name}.html has no link to the live site`);
      await ctx.close();
    }
  } finally {
    await browser?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
