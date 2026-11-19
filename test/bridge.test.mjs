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
  assert.equal(inWords(ROOMS.length + 1), 'fifteen');
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
