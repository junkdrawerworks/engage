// A shared course to one of the destinations with notes is sent as a page of its own, course/<name>.html, because a
// chat's link preview reads only the page and never the part after the "?": every ?course= link used to unfurl as
// the same card. Each page has its own title, a line about the star and a picture of the star as the
// viewscreen shows it on arrival, and passes straight on to the bridge with the course laid in. tools/course-pages.mjs
// writes the pages from this module, and `node tools/screenshots.mjs courses` draws the pictures. Pure, checked by
// test/bridge.test.mjs (which also fails when a page is out of date).
import { DESTINATIONS, HOME } from './destinations.js';
import { chartFor } from './charts.js';
import { roughLy } from './physics.js';

export const COURSES = 'course/';

// The page's name: the title in plain lower-case letters and digits ("Barnard’s Star" is barnards-star, "Tau Ceti"
// tau-ceti, "The Pleiades" the-pleiades).
export const courseSlug = title => title.toLowerCase().normalize('NFD').replace(/[̀-ͯ’']/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The destinations that have a page: all but home, which is never a course to send.
export const SHARED = DESTINATIONS.filter(d => d.star !== HOME);

// The page for a star's catalogue name, or null when it has none (any star without notes: the plain link is sent).
export function coursePath(name) {
  const d = SHARED.find(x => x.star === name);
  return d ? `${COURSES}${courseSlug(d.title)}.html` : null;
}

// What the picture says under the star's name: how far it is, and what Starfleet's charts put there.
export function courseCaption(d, ly) {
  const tag = chartFor(d.star)?.tag;
  return [roughLy(ly), tag && tag !== d.title ? (/ colony$/.test(tag) ? `the ${tag}` : tag) : null]
    .filter(Boolean).join(' · ');
}

// The line under the preview's title: what Starfleet's charts put there, where they put something (the story the
// log tells on arrival), or else the first of the star's notes that reads well away from it (not "where you are now").
export function courseLine(d) {
  const chart = chartFor(d.star);
  if (chart) return chart.log || chart.line;
  return d.notes.find(n => !/\byou\b|this one/i.test(n)) || d.notes[0];
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The page itself. `live` is the site's address, for the preview's picture and address, which must be whole.
export function coursePage(d, ly, live) {
  const slug = courseSlug(d.title);
  const to = `../?course=${encodeURIComponent(d.star)}`;
  const named = d.inText || d.title;
  const line = courseLine(d);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Set course for ${esc(named)} · Engage</title>
  <meta name="description" content="${esc(line)}">
  <meta property="og:site_name" content="Engage">
  <meta property="og:title" content="Set course for ${esc(named)}">
  <meta property="og:description" content="${esc(line)}">
  <meta property="og:image" content="${live}${COURSES}${slug}.png">
  <meta property="og:image:alt" content="Engage: ${esc(named)} on the viewscreen as the ship drops out of warp. Set course for ${esc(named)}, ${esc(courseCaption(d, ly).replace(/ · /g, ', '))}.">
  <meta property="og:url" content="${live}${COURSES}${slug}.html">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#05070d">
  <link rel="icon" href="../icon.svg" type="image/svg+xml">
  <meta http-equiv="refresh" content="0; url=${esc(to)}">
  <script>location.replace(${JSON.stringify(to)});<\/script>
  <style>body { margin: 0; padding: 24px 16px; background: #05070d; color: #e8edf6; font: 16px/1.5 system-ui, sans-serif; } a { color: #ffb54a; }</style>
</head>
<body>
  <p>Laying in a course for ${esc(named)}… <a href="${esc(to)}">Take the helm</a></p>
</body>
</html>
`;
}
