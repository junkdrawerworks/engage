// A sweep for anything that turns a number into words with a unit ("3 days", "1.3 light-seconds", "2.5M yr"): every
// value across many decades, 2,000 to a decade, looking for what only shows at a unit's edge. Used by the tests of
// js/physics.js and js/warp-scale.js.
//   a number that isn't one, or a bare zero ("0 minutes");
//   one of something in the plural ("1 seconds", "1 light-hours");
//   a count that should have gone over to the next unit ("60 s", "60 minutes", "24 hr", "12 months", "1,000 million",
//   and, where the function has a word for a million, "1,000,000 years");
//   and a number that goes down while the unit stays the same as the span grows.
const N = '(?<![\\d.,])';
const EDGES = new RegExp([
  'NaN|undefined|Infinity|null',
  `${N}0 ?(second|minute|hour|day|month|year|light|ms|µs|s\\b|min|hr|mo|yr|million|billion)`,
  `${N}1 (seconds|minutes|hours|days|months|years|light-seconds|light-minutes|light-hours|light-days|light years|milliseconds|microseconds)\\b`,
  `${N}(60|61) (seconds|minutes|light-seconds|light-minutes|s|min)\\b`,
  `${N}(24|25) (hours|hr)\\b`,
  `${N}12 (months|mo)\\b`,
  `${N}1,000 (million|milliseconds|microseconds|ms|µs)|${N}1,000M`,
].join('|'));
const MILLION = new RegExp(`${N}1,000,000 (years|yr|light years)`);

// The numbers in "1 day 2 hours", and the unit the first one counts: [[1, 2], 'day'].
function read(text) {
  const parts = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([^\d]*)/g)];
  return [parts.map(p => Number(p[1].replace(/,/g, ''))), (parts[0]?.[2] || '').trim().replace(/s$/, '')];
}

// Every problem found in fn's words for 10^lo to 10^hi, each as "what: the words, for about this value".
export function sweep(fn, lo, hi, { million = true } = {}) {
  const found = new Map();
  const note = (what, text, x) => { const k = `${what}: "${text}"`; if (!found.has(k)) found.set(k, `${k} for ${x.toPrecision(4)}`); };
  let last = null;
  for (let e = lo; e <= hi; e += 1 / 2000) {
    const x = Math.pow(10, e), text = fn(x);
    if (EDGES.test(text) || (million && MILLION.test(text))) note('reads wrong', text, x);
    const [nums, unit] = read(text);
    if (last && last.unit === unit) {
      const down = nums.findIndex((n, k) => n !== (last.nums[k] ?? 0));
      if (down >= 0 && nums[down] < (last.nums[down] ?? 0)) note(`goes down after "${last.text}"`, text, x);
    }
    last = { nums, unit, text };
  }
  return [...found.values()];
}
