// The Prime Directive: the case, the hearing and the board's finding. The rules are in js/directive-sim.js.
import { CASES, caseOf, choices, choose, heard, line, newHearing, recordHearing, verdict } from './directive-sim.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'engage.directive.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage full or blocked: the case is still heard */ } };
const still = matchMedia('(prefers-reduced-motion: reduce)');

let saved = read();
const theCase = CASES[0];
let hearing = null, last = null;

function show(id) {
  for (const s of ['brief', 'hearing', 'verdict']) $(s).hidden = s !== id;
}

function renderBrief() {
  $('case-where').textContent = `Case 1 · ${theCase.world}`;
  $('case-title').textContent = theCase.title;
  $('case-brief').innerHTML = theCase.brief.map(p => `<p>${esc(p)}</p>`).join('');
  const mine = heard(saved).filter(h => h.case === theCase.id);
  $('record').hidden = !mine.length;
  if (mine.length) {
    const v = verdict(theCase.id, mine[0].path);
    $('record').textContent = `${mine.length === 1 ? 'Heard once' : `Heard ${mine.length} times`}. Last finding: ${line(theCase.id, v).replace(`${theCase.title}: `, '')}.`;
  }
  $('hear').textContent = mine.length ? 'Hear it again' : 'Hear the case';
}

function renderHearing() {
  const c = caseOf(hearing.case);
  let step = c.start;
  $('transcript').innerHTML = hearing.path.map(id => {
    const ch = c.steps[step].choices.find(x => x.id === id);
    const html = `<li><p class="was">${esc(c.steps[step].text)}</p><p class="order"><b>Your order:</b> ${esc(ch.label)}.</p><p class="said">${esc(ch.said)}</p></li>`;
    step = ch.next;
    return html;
  }).join('');
  $('step-text').textContent = c.steps[hearing.step].text;
  $('choices').innerHTML = choices(hearing).map(ch => `<button type="button" class="pd-choice" data-choice="${ch.id}">${esc(ch.label)}</button>`).join('');
}

function renderVerdict(path) {
  const v = verdict(theCase.id, path), s = theCase.onScreen;
  $('finding-title').textContent = v.title;
  $('grades').innerHTML = v.grades.map(g => `<li><span class="letter l-${g.letter}" aria-hidden="true">${g.letter}</span><span><b>${g.name}: ${g.letter}</b>${esc(g.why)}</span></li>`).join('');
  $('happened').innerHTML = v.orders.map((o, k) => `<li><b>${esc(o)}.</b> ${esc(v.happened[k])}</li>`).join('');
  $('screen-title').textContent = `“${s.episode}” (${s.series})`;
  $('screen-text').textContent = s.text;
  $('screen-same').textContent = v.same === v.of ? 'Your orders were Picard’s, every one.'
    : v.same ? `Your orders matched Picard’s at ${v.same} of ${v.of} steps.` : 'None of your orders was Picard’s.';
}

function start() {
  hearing = newHearing(theCase.id);
  renderHearing();
  show('hearing');
  $('step-text').focus({ preventScroll: true });
  $('hearing').scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
}
function give(id) {
  if (!hearing || hearing.over || !choose(hearing, id)) return;
  if (!hearing.over) {
    renderHearing();
    $('step-text').focus({ preventScroll: true });
    return;
  }
  last = [...hearing.path];
  saved = recordHearing(saved, theCase.id, last);
  write(saved);
  renderVerdict(last);
  show('verdict');
  $('finding-title').focus({ preventScroll: true });
  $('verdict').scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
}

$('hear').addEventListener('click', start);
$('again').addEventListener('click', start);
$('back').addEventListener('click', () => { renderBrief(); show('brief'); scrollTo({ top: 0 }); });
$('choices').addEventListener('click', e => { const b = e.target.closest('[data-choice]'); if (b) give(b.dataset.choice); });

window.directive = {
  ready: true,
  get hearing() { return hearing && JSON.parse(JSON.stringify(hearing)); },
  get last() { return last; },
  // For the README's pictures: a whole hearing given at once.
  hear: path => { start(); for (const id of path) give(id); },
};
renderBrief();
show('brief');

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
