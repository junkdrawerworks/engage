// The bridge's tables and rules that need no page: the room list, when a dragged sheet closes, and the shared
// courses' own pages.
//   node --test test/bridge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOMS, roomList, inWords } from '../js/rooms.js';
import { dismissed, SWIPE_CLOSE } from '../js/sheets.js';
import { SHARED, coursePath, courseSlug, courseLine } from '../js/courses.js';
import { DESTINATIONS } from '../js/destinations.js';
import { coursePages } from '../tools/course-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every room off the bridge is in the room list, once, with its name, a line and its button’s picture', async () => {
  const bridge = await readFile(join(root, 'index.html'), 'utf8');
  // Every link from the bridge to another page of Engage is a room in the list.
  const linked = [...bridge.matchAll(/<a [^>]*id="([\w-]+)"[^>]*href="(\w+\.html)"|<a [^>]*href="(\w+\.html)"[^>]*id="([\w-]+)"/g)]
    .map(m => [m[1] ?? m[4], m[2] ?? m[3]]);
  assert.ok(linked.length >= 7);
  for (const [id, href] of linked) assert.ok(ROOMS.some(r => r.href === href && r.button === id), `the bridge links to ${href} from #${id}, which the room list doesn’t have`);
  assert.equal(new Set(ROOMS.map(r => r.href)).size, ROOMS.length, 'a room is in the list twice');
  for (const r of ROOMS) {
    assert.ok(r.name && r.line.endsWith('.') && r.line.length < 110, `${r.id}’s line is missing or too long`);
    // The round buttons on the bridge draw the same picture as the list does.
    const button = bridge.match(new RegExp(`id="${r.button}"[\\s\\S]*?<svg[^>]*>([\\s\\S]*?)</svg>`))?.[1];
    if (r.button && r.button !== 'open-scale') assert.equal(button, r.icon, `${r.name}’s picture in the list is not its button’s`);
    await readFile(join(root, r.href)); // the page is there
  }
  const html = roomList('https://example.org/', ' target="_blank"');
  assert.equal(html.match(/<li>/g).length, ROOMS.length);
  assert.ok(html.includes('href="https://example.org/survey.html" target="_blank"'));
});

test('counts are said in words', () => {
  assert.equal(inWords(8), 'eight');
  assert.equal(inWords(ROOMS.length + 1), 'eighteen');
  assert.equal(inWords(40), '40');
});

test('a sheet dragged down closes past 80 pixels or on a quick flick, and springs back otherwise', () => {
  assert.equal(SWIPE_CLOSE, 80);
  assert.equal(dismissed(80, 2000), true, 'a slow drag all the way');
  assert.equal(dismissed(79, 2000), false, 'a slow drag not quite far enough');
  assert.equal(dismissed(40, 50), true, 'a flick');
  assert.equal(dismissed(8, 5), false, 'a twitch is not a flick');
  assert.equal(dismissed(-120, 50), false, 'pushed up, not down');
  assert.equal(dismissed(NaN, 50), false);
});

test('every destination but home has a course page of its own, written as tools/course-pages.mjs writes it, with its picture', async () => {
  assert.equal(SHARED.length, DESTINATIONS.length - 1);
  assert.equal(coursePath('Sol'), null, 'a course home is never shared');
  assert.equal(coursePath('Alpheratz'), null, 'a star without notes has a page');
  assert.equal(coursePath('Vega'), 'course/vega.html');
  assert.equal(courseSlug('Barnard’s Star'), 'barnards-star');
  assert.equal(new Set(SHARED.map(d => courseSlug(d.title))).size, SHARED.length, 'two destinations share a page');
  const pages = await coursePages();
  for (const [file, html] of Object.entries(pages)) {
    assert.equal(await readFile(join(root, file), 'utf8').catch(() => ''), html, `${file} is out of date: run node tools/course-pages.mjs`);
    const png = await readFile(join(root, file.replace(/\.html$/, '.png'))).catch(() => null);
    assert.ok(png, `${file}'s picture is missing: run node tools/screenshots.mjs courses`);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  }
  // The line under the preview reads well away from the star: Starfleet's story where there is one.
  for (const d of SHARED) assert.doesNotMatch(courseLine(d), /\byou\b/i, `${d.title}'s preview speaks as if the reader were there`);
  assert.match(courseLine(SHARED.find(d => d.star === 'Keid')), /^Spock’s home world/);
  assert.match(pages['course/vega.html'], /<title>Set course for Vega · Engage<\/title>/);
  assert.match(pages['course/vega.html'], /location\.replace\("\.\.\/\?course=Vega"\)/);
  assert.match(pages['course/the-pleiades.html'], /<meta property="og:title" content="Set course for the Pleiades">/);
});

// ---------- What's new off the bridge ----------
import { ROOMS as ALL_ROOMS, newRooms, whatsNew } from '../js/rooms.js';

test('a room added since the last visit is named, with a link to it, and nothing else is', () => {
  const all = ALL_ROOMS.map(r => r.id);
  assert.deepEqual(newRooms(all), []);
  assert.deepEqual(newRooms(null), [], 'a save from before the bridge kept count was told of rooms it may have seen');
  assert.deepEqual(newRooms(all.filter(id => id !== 'away')).map(r => r.id), ['away']);
  const two = newRooms(all.filter(id => !['system', 'away'].includes(id)));
  assert.equal(whatsNew(two), 'New since your last visit: <a href="system.html" data-room="system">System\u00a0view</a> and <a href="away.html" data-room="away">Away\u00a0team</a>.');
  assert.equal(whatsNew(newRooms(['survey', 'maru'])).match(/<a /g).length, ALL_ROOMS.length - 2);
  assert.match(whatsNew(newRooms(['survey', 'maru'])), /<\/a>, <a .*<\/a> and <a [^,]*<\/a>\.$/);
  assert.equal(whatsNew([]), '');
});

// ---------- What every room shares: sound, vibration, the text size, high contrast ----------
import { PREFS, SIZES, readPrefs, textScale, withPref } from '../js/prefs.js';

test('sound, vibration, the text size and high contrast are kept once for every room, and a damaged copy is the defaults', () => {
  const from = kept => key => (key in kept ? kept[key] : null);
  assert.deepEqual(readPrefs(from({})), { sound: true, buzz: true, text: 'standard', contrast: false });
  assert.deepEqual(readPrefs(from({ [PREFS]: '{"sound":false,"buzz":false,"text":"largest","contrast":true}' })), { sound: false, buzz: false, text: 'largest', contrast: true });
  assert.equal(readPrefs(from({ [PREFS]: '{"contrast":"yes"}' })).contrast, false);
  assert.deepEqual(readPrefs(from({ [PREFS]: 'not json' })), { sound: true, buzz: true, text: 'standard', contrast: false });
  assert.deepEqual(readPrefs(from({ [PREFS]: '{"sound":"no","text":"huge"}' })), { sound: true, buzz: true, text: 'standard', contrast: false });
  // Sound was the bridge's own setting: a bridge that had it off keeps it off, until the new setting is changed.
  assert.equal(readPrefs(from({ 'engage.v1': '{"opts":{"sound":false}}' })).sound, false);
  assert.equal(readPrefs(from({ 'engage.v1': '{"opts":{"sound":false}}', [PREFS]: '{"sound":true}' })).sound, true);
  assert.equal(readPrefs(from({ 'engage.v1': '{"opts":{"sound":true}}' })).sound, true);
  // One changed, the rest kept.
  assert.deepEqual(withPref({ sound: false, buzz: true, text: 'large' }, 'buzz', false), { sound: false, buzz: false, text: 'large', contrast: false });
  assert.deepEqual(withPref({ sound: false, buzz: true, text: 'large', contrast: false }, 'contrast', true), { sound: false, buzz: true, text: 'large', contrast: true });
  assert.deepEqual(withPref({}, 'text', 'enormous'), { sound: true, buzz: true, text: 'standard', contrast: false });
  assert.ok(PREFS.startsWith('engage.'));
  assert.deepEqual(SIZES, ['standard', 'large', 'largest']);
});

test('words drawn into pictures grow with the text size and with the browser’s own', () => {
  assert.equal(textScale('standard'), 1);
  assert.equal(textScale('large'), 1.15);
  assert.equal(textScale('largest', 20), 1.3 * 1.25);
  assert.equal(textScale('standard', NaN), 1);
  assert.equal(textScale('odd', 16), 1);
  // On an iPhone the usual size is Apple's 17 px body: at it nothing grows, and two notches of Larger Text up (21 px) grow.
  assert.equal(textScale('standard', 17, 17), 1);
  assert.ok(Math.abs(textScale('large', 21, 17) - 1.15 * 21 / 17) < 1e-12);
  assert.equal(textScale('standard', 16, NaN), 1);
});

test('the bridge falls quiet on arrival at Wolf 359, and only there', () => {
  assert.deepEqual(DESTINATIONS.filter(d => d.quiet).map(d => d.star), ['Wolf 359']);
});

// ---------- First Contact Day ----------
import { firstContactDay, isFirstContactDay } from '../js/rooms.js';

test('on 5 April, and only then, the bridge greets you with First Contact Day', () => {
  assert.equal(isFirstContactDay(new Date(2027, 3, 5, 0, 1)), true);
  assert.equal(isFirstContactDay(new Date(2027, 3, 5, 23, 59)), true);
  assert.equal(isFirstContactDay(new Date(2027, 3, 4, 23, 59)), false);
  assert.equal(isFirstContactDay(new Date(2027, 3, 6)), false);
  assert.equal(isFirstContactDay(new Date(2027, 4, 5)), false, 'May is not April');
  const line = firstContactDay();
  assert.match(line, /^5 April, First Contact Day: in 2063 Zefram Cochrane flew the Phoenix to warp 1/);
  assert.match(line, /<a href="contact\.html">First\u00a0contact<\/a>$/);
  assert.match(firstContactDay('https://engage.junkdrawer.works/', ' target="_blank"'), /href="https:\/\/engage\.junkdrawer\.works\/contact\.html" target="_blank"/);
});

// ---------- Earth's sky, turned to find the star ----------
import { Sky } from '../js/sky.js';

test('the viewscreen can be pointed so a star lands where it is wanted on the screen', () => {
  let r = 7;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 500; n++) {
    const t = rand() * 2 * Math.PI, z = rand() * 1.6 - 0.8, q = Math.sqrt(1 - z * z);
    const dir = [q * Math.cos(t), q * Math.sin(t), z];
    const tx = (rand() - 0.5) * 1.2, ty = (rand() - 0.5) * 1.2;
    const { yaw, pitch } = Sky.aim(dir, tx, ty);
    const seen = Sky.seen(dir, yaw, pitch);
    assert.ok(seen && Math.abs(seen.tx - tx) < 1e-9 && Math.abs(seen.ty - ty) < 1e-9, `aimed at ${tx}, ${ty}; seen at ${JSON.stringify(seen)}`);
  }
  // Behind the view is nowhere on the screen; and near a pole the view stops short of looking past straight up.
  assert.equal(Sky.seen([-1, 0, 0], 0, 0), null);
  assert.ok(Sky.aim([0, 0, 1], 0, -0.5).pitch <= 89 * Math.PI / 180);
});

test('a planet held beside goes near its star, wholly on the screen, as far from it as fits', () => {
  // A phone, 390 × 844, with a star on the horizon lifted 20° above the middle of the view as an arrival leaves it,
  // clear of the header's 150 px and the helm's lower 220.
  const box = { l: 0, t: 150, r: 390, b: 624, w: 390, h: 844 };
  const F = Math.sqrt(390 * 844) / 2 / Math.tan(30 * Math.PI / 180);
  const star = [1, 0, 0], size = 18 * Math.PI / 180, pitch = -20 * Math.PI / 180;
  const spot = Sky.beside(star, 0, pitch, F, box, size);
  assert.ok(spot.fits);
  const angle = Math.acos(spot.dir[0]);
  assert.ok(Math.abs(angle - spot.theta) < 1e-9 && spot.theta >= 20 * Math.PI / 180, `${angle} from the star`);
  const seen = Sky.seen(spot.dir, 0, pitch), R = Math.tan(size / 2) * F;
  const x = 195 + seen.tx * F, y = 422 - seen.ty * F;
  assert.ok(x - R > box.l && x + R < box.r && y - R > box.t && y + R < box.b, `the disc is off the clear part: ${x}, ${y}`);
  // The star off the screen behind: 30° below it, and it says it didn't fit.
  const behind = Sky.beside([-1, 0, 0], 0, 0, F, box, size);
  assert.equal(behind.fits, false);
  assert.ok(Math.abs(Math.acos(-behind.dir[0]) - 30 * Math.PI / 180) < 1e-9);
});
