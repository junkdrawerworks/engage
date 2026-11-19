// Cover your tracks, the planetary survey's quiz: what its record says. Pure, checked by test/survey.test.mjs.
import { CLASSES, byId, label } from './classes.js';

// Each answer is kept as two tallies. `filed` counts, for each file, the worlds filed under it rightly; `mixed`
// counts the slips, by "truth>picked": "K>D" is a Class K world filed as Class D.
const count = x => (Number.isInteger(x) && x >= 0 ? x : 0);
export function tallies(raw, valid) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw)) if (valid(k) && count(v)) out[k] = count(v);
  return out;
}
export const isFile = id => byId.has(id);
export const isSlip = k => { const [a, b] = String(k).split('>'); return isFile(a) && isFile(b) && a !== b; };

// Puts one answer on the record: the world was of `truth`, and it was filed as `picked`.
export function record(saved, truth, picked) {
  if (truth === picked) saved.filed[truth] = (saved.filed[truth] || 0) + 1;
  else saved.mixed[`${truth}>${picked}`] = (saved.mixed[`${truth}>${picked}`] || 0) + 1;
}

// The files a world has been rightly filed under at least once: their ids, in the survey's order.
export const filesUsed = filed => CLASSES.filter(c => filed[c.id] > 0).map(c => c.id);

// The slip made most often, once it has been made at least twice (one slip says nothing): { truth, picked, times },
// or null. Ties go to the earlier file in the survey's order, so the line doesn't change from one visit to the next.
export function caughtOut(mixed) {
  let best = null;
  const at = id => CLASSES.indexOf(byId.get(id));
  for (const [k, times] of Object.entries(mixed)) {
    if (!isSlip(k) || times < 2) continue;
    const [truth, picked] = k.split('>');
    if (!best || times > best.times || (times === best.times && (at(truth) < at(best.truth) || (truth === best.truth && at(picked) < at(best.picked))))) best = { truth, picked, times };
  }
  return best;
}
export function caughtOutLine(mixed) {
  const c = caughtOut(mixed);
  return c ? `Most often caught out: ${label(byId.get(c.truth))}, mistaken for ${label(byId.get(c.picked))} (${c.times} times)` : '';
}
