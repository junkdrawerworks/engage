// The bridge's tables and rules that need no page: the room list, and when a dragged sheet closes.
//   node --test test/bridge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOMS, roomList, inWords } from '../js/rooms.js';
import { dismissed, SWIPE_CLOSE } from '../js/sheets.js';

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
    if (r.button !== 'open-scale') assert.equal(button, r.icon, `${r.name}’s picture in the list is not its button’s`);
    await readFile(join(root, r.href)); // the page is there
  }
  const html = roomList('https://example.org/', ' target="_blank"');
  assert.equal(html.match(/<li>/g).length, ROOMS.length);
  assert.ok(html.includes('href="https://example.org/survey.html" target="_blank"'));
});

test('counts are said in words', () => {
  assert.equal(inWords(8), 'eight');
  assert.equal(inWords(ROOMS.length + 1), 'eight');
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
