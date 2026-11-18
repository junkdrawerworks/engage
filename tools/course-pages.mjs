// Writes course/<name>.html, the page a shared course to each destination with notes is sent as (see js/courses.js):
//   node tools/course-pages.mjs
// Run it after changing a destination's title or first note, or the site's address. The pictures the pages name are
// drawn by `node tools/screenshots.mjs courses`. test/bridge.test.mjs fails while a page is out of date.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../js/catalog.js';
import { COURSES, SHARED, courseSlug, coursePage } from '../js/courses.js';
import { LIVE } from '../js/share.js';
import { LY_PER_PC } from '../js/physics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The pages, as { file: html }, from the star data in the repo.
export async function coursePages() {
  const bin = await readFile(join(root, 'data/stars.bin'));
  const cat = buildCatalog(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), JSON.parse(await readFile(join(root, 'data/stars.json'), 'utf8')));
  const pages = {};
  for (const d of SHARED) {
    const i = cat.byName.get(d.star);
    const ly = Math.hypot(cat.pos[i * 3], cat.pos[i * 3 + 1], cat.pos[i * 3 + 2]) * LY_PER_PC;
    pages[`${COURSES}${courseSlug(d.title)}.html`] = coursePage(d, ly, LIVE);
  }
  return pages;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(join(root, COURSES), { recursive: true });
  const pages = await coursePages();
  for (const [file, html] of Object.entries(pages)) await writeFile(join(root, file), html);
  console.log(`${Object.keys(pages).length} course pages in ${COURSES}`);
}
