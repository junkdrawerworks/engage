// Renders the PNG app icons from the SVGs:  node tools/make-icons.mjs
// Also the icons for the home-screen shortcuts (a long press on the installed app's icon on Android): each room's own
// picture from js/rooms.js, the one on its round button, drawn on the app icon's night sky as img/shortcut-ROOM.png.
// Saved with a 256-colour palette through upng-js (from `npm install`), as tools/screenshots.mjs saves its pictures:
// the four icons are part of the offline copy, and Chromium's own PNGs of them were two to four times the size.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const rounded = await readFile(join(root, 'icon.svg'), 'utf8');
const square = await readFile(join(root, 'tools/icon-full-bleed.svg'), 'utf8');
// Android may cut its icon to a circle: this one keeps the whole drawing inside the part that always shows.
const maskable = await readFile(join(root, 'tools/icon-maskable.svg'), 'utf8');
// A shortcut's icon is cut to a circle on Android, so the room's picture sits well inside it.
const { ROOMS } = await import('../js/rooms.js');
const { shortcuts } = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
// In the colour of the room's round button on the bridge (css/app.css).
const COLOUR = { survey: '#e8edf6', xeno: '#6fe3a4', maru: '#ff8f84', contact: '#c9a2ff', missions: '#86d8ff', tonight: '#ffd27a', warp: '#c9a2ff' };
const shortcutIcon = room => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><radialGradient id="bg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#16244a"/><stop offset="1" stop-color="#05070d"/></radialGradient></defs>
  <rect width="64" height="64" fill="url(#bg)"/>
  <g transform="translate(18 18) scale(1.1667)" fill="none" stroke="${COLOUR[room.id]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${room.icon}</g>
</svg>`;
const out = [
  ['icon-192.png', 192, rounded, true],
  ['icon-512.png', 512, rounded, true],
  ['icon-512-maskable.png', 512, maskable, false],
  ['icon-180.png', 180, square, false], // iOS rounds the corners itself
  ...shortcuts.map(s => [`img/shortcut-${ROOMS.find(r => r.href === s.url).id}.png`, 192, shortcutIcon(ROOMS.find(r => r.href === s.url)), false]),
];

const browser = await pw.chromium.launch();
const page = await browser.newPage();
for (const [name, size, svg, clear] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const img = UPNG.decode(await page.screenshot({ omitBackground: clear }));
  await writeFile(join(root, name), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}
await browser.close();
console.log('icons written');
