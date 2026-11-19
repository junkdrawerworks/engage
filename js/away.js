// The away team: stand on a real planet and look round. Its sun at its true width and colour, the stars as seen from
// that star with the constellations' lines (and the Sun marked), its sister planets as discs, a strip of readings,
// and, where the lab has the planet's own readings, the lab's creature for it. The rules are in js/worlds.js.
import { loadCatalog } from './catalog.js';
import { titleFor } from './log.js';
import { LY_PER_PC, apparentMag, formatLy, starColor } from './physics.js';
import { jdOf } from './ephemeris.js';
import { worldByName, grows } from './classes.js';
import { growFor } from './xeno-gen.js';
import { drawCreature } from './xeno-art.js';
import { SYSTEMS, planetByName, standable, groundSky, groundReadings, altitude, gravity, yearText } from './worlds.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const still = matchMedia('(prefers-reduced-motion: reduce)');

let cat = null;
const here = { side: 'day', yaw: 0 };

// ---------- Which world ----------

function fromHash() {
  let text = '';
  try { text = decodeURIComponent(location.hash.slice(1)); } catch { /* cut off */ }
  const m = text.match(/^world=(.+)$/i);
  return m ? planetByName(m[1]) : null;
}

function open() {
  const found = fromHash();
  const ok = found && standable(found.planet);
  $('surface').hidden = !ok;
  renderPick(ok ? found.planet : null);
  if (!ok) {
    here.world = null;
    $('away-intro').textContent = location.hash.length > 1
      ? (found ? `${found.planet.name} is a giant, with no ground to stand on. Pick a world with a surface.` : 'That world isn’t one the transporter knows. Pick one below.')
      : 'Pick a world with ground to stand on, and the transporter puts you down on it.';
    document.title = 'Away team · Engage';
    return;
  }
  const { planet, system } = found;
  const i = cat.byName.get(system.star);
  const hostPc = [...cat.pos.subarray(i * 3, i * 3 + 3)];
  const star = { lum: cat.lum[i], temp: cat.temp[i], radius: cat.radius[i] };
  here.world = { planet, system, i, hostPc, star, title: titleFor(cat, i) };
  here.sky = groundSky(system, planet, jdOf(new Date()), hostPc);
  here.stars = starsFrom(i, hostPc);
  here.yaw = 0;
  here.creature = creatureFor(planet);
  document.title = `${planet.name} · Away team · Engage`;
  const ly = Math.hypot(...hostPc) * LY_PER_PC;
  $('away-intro').textContent = system.star === 'Sol'
    ? `Standing on ${planet.name}, ${planet.name === 'Earth' ? 'home' : 'in the Solar System'}.`
    : `Standing on ${planet.name}, ${formatLy(ly)} from home, under ${here.world.title}.`;
  $('world-name').textContent = planet.name;
  $('ground').innerHTML = groundReadings(planet, star).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  const c = here.creature;
  $('creature').innerHTML = c
    ? `In front of you: the ${esc(c.name.common.toLowerCase())}, specimen ${String(c.seed).padStart(4, '0')} from the xenobiology lab, grown for ${esc(planet.name)}’s gravity, light and warmth. <a href="xeno.html#world=${encodeURIComponent(planet.name)}-${c.seed}">See it in the lab</a>.`
    : `Nothing stands here: the xenobiology lab has no readings to grow a creature for ${esc(planet.name)}.`;
  $('doors').innerHTML = [
    `<a class="to-file" href="system.html#star=${encodeURIComponent(system.star)}&planet=${encodeURIComponent(planet.name)}">System view <span aria-hidden="true">→</span></a>`,
    system.star === 'Sol' ? '' : `<a class="to-file" href="./?course=${encodeURIComponent(system.star)}">Set course for ${esc(here.world.title)} <span aria-hidden="true">→</span></a>`,
    system.star === 'Sol' ? '' : `<a class="to-file" href="tonight.html#star=${encodeURIComponent(system.star)}">Its star in your sky tonight <span aria-hidden="true">→</span></a>`,
  ].join('');
  $('src').textContent = `${planet.src}.${planet.least ? ' Its mass is a minimum and its width hasn’t been measured, so its gravity is what rock that heavy would have.' : ''}`;
  setSide(here.side);
}

// The planets the transporter can put you on, by system.
function renderPick(current) {
  $('pick-head').textContent = current ? 'Other worlds to beam down to' : 'Where to beam down';
  $('pick-list').innerHTML = SYSTEMS.map(s => {
    const worlds = s.planets.filter(standable);
    if (!worlds.length) return '';
    const i = cat.byName.get(s.star);
    return `<h3>${esc(s.star === 'Sol' ? 'The Solar System' : titleFor(cat, i))}</h3><ul>${worlds.map(p => `<li><a href="#world=${encodeURIComponent(p.name)}"${p === current ? ' aria-current="page"' : ''}>
      <b>${esc(p.name)}</b><span>${gravity(p).toFixed(2)} g · a year of ${esc(yearText(p.days))}</span></a></li>`).join('')}</ul>`;
  }).join('');
}

// The lab's creature for this world, if it has the readings: the first of its specimens that stands on the ground.
function creatureFor(p) {
  const filed = worldByName(p.name);
  if (!filed || !grows(filed.world)) return null;
  for (let seed = 1; seed < 200; seed++) {
    const c = growFor(filed.world, seed);
    if (['walker', 'crawler', 'plant'].includes(c.body.plan)) return c;
  }
  return null;
}

// Every star bright enough to see from this star (to magnitude 6), with its direction from here.
function starsFrom(host, hp) {
  const out = [];
  for (let i = 0; i < cat.count; i++) {
    if (i === host || cat.unmeasured[i]) continue;
    const rel = [cat.pos[i * 3] - hp[0], cat.pos[i * 3 + 1] - hp[1], cat.pos[i * 3 + 2] - hp[2]];
    const d = Math.hypot(...rel);
    const mag = apparentMag(cat.absmag[i], d);
    if (mag > 6) continue;
    out.push({ i, dir: rel.map(x => x / d), mag });
  }
  return out.sort((a, b) => a.mag - b.mag);
}
// A star's direction from here, for the constellations' lines, which join stars whatever their brightness.
const dirFrom = i => unit([cat.pos[i * 3] - here.world.hostPc[0], cat.pos[i * 3 + 1] - here.world.hostPc[1], cat.pos[i * 3 + 2] - here.world.hostPc[2]]);

// ---------- Drawing ----------

function setSide(side) {
  here.side = side;
  here.yaw = 0;
  document.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
  const { planet, system } = here.world;
  const up = here.sky[side];
  const locked = planet.locked;
  let seen;
  if (side === 'day') {
    seen = `${locked ? `On the day side, where ${here.world.title} hangs 14° up and never moves.` : `Morning, with the sun 14° up.`} Its sister planets are where they are on their orbits today${system.star === 'Sol' ? '' : ', as far as anyone can guess'}.`;
  } else {
    const sol = here.sky.sol;
    const solLine = !sol ? 'The constellations are the ones you know: from here the stars barely move.'
      : altitude(sol, up) > 3 ? `The Sun is the star ringed in amber, magnitude ${solMag().toFixed(1)}: home.`
      : `The Sun is below the horizon tonight: just now it is in the daytime sky, near ${here.world.title}.`;
    seen = `${locked ? 'On the night side, where it is always night.' : 'Night.'} ${solLine}`;
  }
  $('seen').textContent = seen;
  draw();
}
const solMag = () => apparentMag(4.83, Math.hypot(...here.world.hostPc));

let B, W, H, S;
function basis(pitchDeg) {
  const up = here.sky[here.side];
  const target = here.side === 'day' ? here.sky.sun : here.sky.mark;
  let h0 = unit(target.map((x, k) => x - dot(target, up) * up[k]));
  const right0 = cross(h0, up);
  const cy = Math.cos(here.yaw), sy = Math.sin(here.yaw);
  const fwd = h0.map((x, k) => cy * x + sy * right0[k]);
  const right = right0.map((x, k) => cy * x - sy * h0[k]);
  const pitch = pitchDeg * DEG;
  const f = fwd.map((x, k) => Math.cos(pitch) * x + Math.sin(pitch) * up[k]);
  return { f, r: right, u: cross(right, f), up, fwd, right };
}
function project(d) {
  const z = dot(d, B.f);
  if (z < -0.4) return null;
  const k = 2 / (1 + z);
  return { x: W / 2 + k * dot(d, B.r) * S, y: H / 2 - k * dot(d, B.u) * S, z };
}
const rgb = (c, a = 1) => `rgba(${c.map(v => Math.round(v)).join(',')},${a})`;

function draw(time = performance.now()) {
  if (!here.world) return;
  const canvas = $('sky');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Frame the view so the ground is in it, 12° of it, and the sun by day or the Sun by night, 10° clear of the top:
  // as wide as 75° across where the screen allows, and wider on a wide screen to take in the height.
  const target = here.side === 'day' ? here.sky.sun : here.sky.mark;
  const a = Math.min(75, Math.max(10, altitude(target, here.sky[here.side])));
  const across = Math.max(75, Math.min(150, (a + 22) * W / H)) * DEG;
  S = W / 2 / (2 * Math.tan(across / 4));
  const tall = 4 * Math.atan(H / 2 / S / 2) / DEG; // the view's height, in degrees, at that scale
  B = basis(-12 + tall / 2);
  const day = here.side === 'day';
  const sc = starColor(here.world.star.temp).map(v => v * 255);

  // The sky: by day lit by its sun, its colour leaning to the sun's; by night dark.
  const sky = g.createLinearGradient(0, 0, 0, H);
  if (day) {
    const light = Math.min(1, Math.max(0.35, Math.sqrt(here.world.star.lum / here.world.planet.au ** 2)));
    sky.addColorStop(0, rgb([30 + sc[0] * 0.1, 60 + sc[1] * 0.12, 110 + sc[2] * 0.15].map(v => v * light)));
    sky.addColorStop(1, rgb([90 + sc[0] * 0.5, 100 + sc[1] * 0.35, 120 + sc[2] * 0.2].map(v => v * light)));
  } else { sky.addColorStop(0, '#02040b'); sky.addColorStop(1, '#0a1022'); }
  g.fillStyle = sky; g.fillRect(0, 0, W, H);

  // The constellations' lines and the stars, from here. By day only what outshines the sky.
  if (!day) {
    g.strokeStyle = 'rgba(134, 190, 255, 0.13)'; g.lineWidth = 1; g.beginPath();
    for (const [a, b] of cat.lines) {
      const da = dirFrom(a), db = dirFrom(b);
      if (dot(da, B.up) < 0 && dot(db, B.up) < 0) continue;
      const pa = project(da), pb = project(db);
      if (!pa || !pb || pa.z < 0 || pb.z < 0 || Math.hypot(pa.x - pb.x, pa.y - pb.y) > W) continue;
      g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
    }
    g.stroke();
  }
  const named = [];
  for (const s of here.stars) {
    if (day && s.mag > -1) break;
    if (dot(s.dir, B.up) < -0.01) continue;
    const p = project(s.dir);
    if (!p || p.x < -6 || p.y < -6 || p.x > W + 6 || p.y > H + 6) continue;
    const r = Math.min(4, 0.6 + (6.4 - s.mag) * 0.42), c = cat.color.subarray(s.i * 3, s.i * 3 + 3);
    g.fillStyle = `rgba(${c[0] * 255 | 0}, ${c[1] * 255 | 0}, ${c[2] * 255 | 0}, ${Math.min(1, (6.4 - s.mag) / 2)})`;
    g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    if (s.mag < 1.6 && s.i !== 0 && named.length < 6 && !/^(HIP|Gliese|HD|GJ) /.test(cat.names[s.i])) named.push([cat.names[s.i], p]);
  }
  g.font = "500 11px 'Chakra Petch', sans-serif"; g.fillStyle = 'rgba(205, 213, 227, 0.7)'; g.textAlign = 'left';
  if (!day) for (const [name, p] of named) g.fillText(name, p.x + 6, p.y - 5);

  // The Sun, home, ringed: it is in the catalogue as one of the stars, but small and easy to miss.
  const sol = here.sky.sol;
  if (sol && !day && dot(sol, B.up) > 0) {
    const p = project(sol);
    if (p && p.z > 0) {
      g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(p.x, p.y, 2.2, 0, 7); g.fill();
      g.strokeStyle = '#ffb54a'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 11, 0, 7); g.stroke();
      g.font = "600 12px 'Chakra Petch', sans-serif"; g.fillStyle = '#ffb54a';
      g.fillText('Sol · home', p.x + 15, p.y + 4);
    }
  }

  // The sister planets, each as wide as it looks from here, lit on its sun's side.
  for (const s of here.sky.sisters) {
    if (dot(s.dir, B.up) < 0) continue;
    const p = project(s.dir);
    if (!p || p.z < 0 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
    const r = Math.max(1.4, (s.deg * DEG / 2) * S);
    const lit = 0.25 + 0.75 * s.lit;
    g.fillStyle = `rgba(${Math.round(230 * lit)}, ${Math.round(220 * lit)}, ${Math.round(205 * lit)}, 1)`;
    g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    g.font = "500 11px 'Chakra Petch', sans-serif"; g.fillStyle = 'rgba(205, 213, 227, 0.8)';
    const short = here.world.system.star === 'Sol' ? s.planet.name : s.planet.name.split(' ').pop();
    g.fillText(short, p.x + r + 4, p.y + 4);
  }

  // The sun, at its true width, with its glare.
  if (dot(here.sky.sun, B.up) > -0.02) {
    const p = project(here.sky.sun);
    if (p && p.z > 0) {
      const deg = 2 * Math.atan(here.world.star.radius * 0.00465047 / here.world.planet.au) / DEG;
      const r = Math.max(1.5, (deg * DEG / 2) * S);
      const glare = g.createRadialGradient(p.x, p.y, r, p.x, p.y, r + 90);
      glare.addColorStop(0, rgb(sc, 0.75)); glare.addColorStop(1, rgb(sc, 0));
      g.fillStyle = glare; g.beginPath(); g.arc(p.x, p.y, r + 90, 0, 7); g.fill();
      g.fillStyle = rgb(sc); g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    }
  }

  // The ground: everything below the horizon, the far edge first.
  const pts = [];
  for (let a = -110; a <= 110; a += 2) {
    const d = B.fwd.map((x, k) => Math.cos(a * DEG) * x + Math.sin(a * DEG) * B.right[k]);
    const p = project(d);
    if (p && p.z > -0.2) pts.push(p);
  }
  if (pts.length > 1) {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
    g.lineTo(W + 20, H + 20); g.lineTo(-20, H + 20); g.closePath();
    const ground = g.createLinearGradient(0, H * 0.4, 0, H);
    const shade = day ? 1 : 0.25;
    ground.addColorStop(0, rgb([40 + sc[0] * 0.12, 34 + sc[1] * 0.08, 30 + sc[2] * 0.05].map(v => v * shade)));
    ground.addColorStop(1, rgb([12, 10, 10].map(v => v * shade)));
    g.fillStyle = ground; g.fill();
    g.strokeStyle = day ? rgb(sc, 0.5) : 'rgba(255, 181, 74, 0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const p of pts) g.lineTo(p.x, p.y); g.stroke();
  }

  // The lab's creature, standing in front.
  const c = here.creature;
  if (c) {
    g.save();
    if (!day) g.filter = 'brightness(0.35)';
    drawCreature(g, c, W * 0.3, H * 0.93, Math.min(W, H) * 0.3, still.matches ? 0 : time / 1000);
    g.restore();
  }
}

function tick(t) {
  if (here.world && here.creature && !still.matches) draw(t);
  requestAnimationFrame(tick);
}

// ---------- Hands on ----------

document.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => setSide(b.dataset.side)));
{
  let drag = null;
  const view = $('sky').parentElement;
  view.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw: here.yaw }; view.setPointerCapture(e.pointerId); });
  view.addEventListener('pointermove', e => { if (drag && S) { here.yaw = drag.yaw + (drag.x - e.clientX) / S; draw(); } });
  view.addEventListener('pointerup', () => { drag = null; });
  view.addEventListener('pointercancel', () => { drag = null; });
}
document.addEventListener('keydown', e => {
  if (!here.world || e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowLeft') { here.yaw -= 10 * DEG; draw(); }
  else if (e.key === 'ArrowRight') { here.yaw += 10 * DEG; draw(); }
});
window.addEventListener('hashchange', () => cat && open());
window.addEventListener('resize', () => draw());

window.awayTeam = {
  get world() { return here.world?.planet.name || null; },
  get side() { return here.side; },
  stand: s => setSide(s),
  get solUp() { return !!(here.world && here.sky.sol && altitude(here.sky.sol, here.sky.night) > 3); },
  get creature() { return here.creature ? { name: here.creature.name.common, seed: here.creature.seed } : null; },
  ready: false,
};

loadCatalog().then(c => {
  cat = c;
  open();
  window.awayTeam.ready = true;
  requestAnimationFrame(tick);
});
