// Stars that behave: five famous variable stars, and where each is in its cycle at any moment. The captain's log and
// tonight's sky say it in words ("Right now"), and the viewscreen's disc does what the star does, sped up. Pure,
// checked by test/tonight.test.mjs.
//
// Periods, epochs and magnitudes are the General Catalogue of Variable Stars (GCVS 5.1, Samus and others, read
// through VizieR's B/gcvs in November 2026), except where said:
//   Algol: eclipsing, 2.12 to 3.39, the eclipse lasting 14% of the period. Its period drifts (the GCVS's 1983 epoch
//     is four hours out by 2024), so the minimum and period are the RASC Observer's Handbook 2025's: 1 December 2024
//     at 18:52 UT, every 2.867321 days.
//   Mira: 2.0 to 10.1, a maximum at JD 2444839.0 and every 331.96 days, rising over 38% of the cycle. Most maxima
//     reach about magnitude 3.5 and most minima about 9 (Wikipedia's account of the AAVSO's record).
//   Delta Cephei: 3.48 to 4.37, a maximum at JD 2455479.905 and every 5.366208 days, rising over 25% of the cycle.
//   Betelgeuse: semiregular, 0.0 to 1.6. The GCVS gives a possible 2,335 days; its main pulsation is near 400 days
//     (Joyce and others 2020, ApJ 902, 63), with no fixed timing, so there is no saying where in it the star is today.
//     It fell to 1.7 in February 2020 and rose to 0.0 in April 2023.
//   Proxima Centauri: a flare star (GCVS type UV). A superflare in 2016 made it 68 times brighter for minutes, and
//     ones like it are thought to come about five times a year (Howard and others 2018, ApJL 860, L30).

const DAY = 86400000;
const jd = j => (j - 2440587.5) * DAY; // a Julian date as a time in milliseconds

export const VARIABLES = [
  { star: 'Algol', kind: 'eclipse', period: 2.867321, epoch: Date.UTC(2024, 11, 1, 18, 52), bright: 2.1, faint: 3.4, span: 0.14,
    what: 'An eclipsing star: every 2.87 days its dimmer companion passes in front of it' },
  { star: 'Mira', kind: 'pulse', period: 331.96, epoch: jd(2444839.0), bright: 3.5, faint: 9, rise: 0.38,
    what: 'A pulsating red giant: it swells and fades over about 332 days' },
  { star: 'δ Cephei', kind: 'pulse', period: 5.366208, epoch: jd(2455479.905), bright: 3.5, faint: 4.4, rise: 0.25,
    what: 'A Cepheid, the first of its kind: it swells and fades every 5.37 days' },
  { star: 'Betelgeuse', kind: 'semiregular', period: 400, bright: 0, faint: 1.6,
    what: 'A semiregular red supergiant: it swells and fades over about 400 days, never quite on time' },
  { star: 'Proxima Centauri', kind: 'flare',
    what: 'A flare star: without warning it can brighten many times over for a few minutes' },
];
export const variableFor = name => VARIABLES.find(v => v.star === name) || null;

// Where in its cycle the star is at `t` (ms), from 0 to 1: from a maximum for a pulsing star, from the middle of an
// eclipse for Algol. Null for the two with no timing.
export function phaseAt(v, t) {
  if (!v.epoch) return null;
  const p = ((t - v.epoch) / DAY / v.period) % 1;
  return p < 0 ? p + 1 : p;
}

// How bright it is at a phase: 0 for its usual brightest, 1 for its faintest. A pulsing star rises quickly (over
// `rise` of the cycle) and fades slowly; Algol is steady but for the eclipse, `span` of the cycle, deepest at 0.
export function dimAt(v, phase) {
  if (v.kind === 'eclipse') {
    const x = Math.min(phase, 1 - phase) / (v.span / 2);
    return x >= 1 ? 0 : (1 + Math.cos(Math.PI * x)) / 2;
  }
  const fall = 1 - v.rise;
  const x = phase < fall ? phase / fall : 1 - (phase - fall) / v.rise;
  return (1 - Math.cos(Math.PI * x)) / 2;
}
export const magAt = (v, phase) => v.bright + (v.faint - v.bright) * dimAt(v, phase);

// The next moment after `t` that the cycle reaches `phase` (0 for the peak, or Algol's deepest eclipse).
export function nextAt(v, t, phase = 0) {
  const now = phaseAt(v, t);
  let ahead = phase - now;
  if (ahead <= 0) ahead += 1;
  return t + ahead * v.period * DAY;
}

const mag = m => `magnitude ${m.toFixed(1)}`;

// The "Right now" reading. `when(t)` says a moment the way the page wants it ("Sat 21 Nov, 3:15 am"); `day(t)` says
// a date alone ("21 November"). The timings are as Earth sees the star, so the captain's log, written at the star
// itself, passes `fromEarth` and says so ("Seen from Earth, it’s in eclipse now"): at the star the light is the
// same cycle, but how far along it is there can't be worked out from timings measured here.
export function nowLine(v, t, { when, day, fromEarth = false }) {
  if (v.kind === 'flare') return 'A flare star, so there’s no saying what it is doing this minute. One flare in 2016 made it 68 times brighter for a few minutes; flares that big come about five times a year, and smaller ones far more often.';
  if (v.kind === 'semiregular') return `${v.what}, so there’s no saying where in its cycle it is today. In February 2020 it faded to magnitude 1.7, and in April 2023 it reached 0.0.`;
  const its = fromEarth ? 'Seen from Earth, it’s' : 'It’s';
  const phase = phaseAt(v, t);
  if (v.kind === 'eclipse') {
    const deepest = nextAt(v, t), half = v.span / 2;
    if (phase < half) return `${v.what}. ${its} coming out of eclipse now, at ${mag(magAt(v, phase))}, back to its usual 2.1 within a few hours. The next eclipse is deepest ${when(nextAt(v, t + DAY))}.`;
    if (phase > 1 - half) return `${v.what}. ${its} in eclipse now, at ${mag(magAt(v, phase))} and fading to 3.4, deepest ${when(deepest)}.`;
    return `${v.what}. ${its} shining at its usual magnitude 2.1 now. The next eclipse is deepest ${when(deepest)}, when it fades to 3.4 for a few hours either side.`;
  }
  const peak = nextAt(v, t);
  const rising = phase >= 1 - v.rise;
  const days = Math.round((peak - t) / DAY);
  const m = magAt(v, phase);
  if (v.period > 30) {
    // Mira, by the day: each peak differs, and comes a week or two either side of its date.
    if (rising && days <= 30) return `${v.what}. ${its} near its brightest now, at about ${mag(m)} and rising, with the peak due about ${day(peak)}. Most peaks reach about 3.5, some brighter, some fainter.`;
    if (phase < 30 / v.period) return `${v.what}. ${its} just past its brightest, at about ${mag(m)}, and fading. The next peak is due about ${day(nextAt(v, t + 31 * DAY))}.`;
    const eye = m > 6 ? ', too faint to see without a telescope' : '';
    return `${v.what}. ${its} ${rising ? 'brightening' : 'fading'} now, at about ${mag(m)}${eye}. The next peak is due about ${day(peak)}.`;
  }
  return `${v.what}. ${its} ${rising ? 'brightening' : 'fading'} now, at ${mag(m)}, and next at its brightest, magnitude 3.5, ${when(peak)}.`;
}

// ---------- On the viewscreen ----------

// Holding at one of them, its disc does what the star does, sped up: one cycle in SHOWN_IN seconds, or for Proxima a
// flare every few seconds. `s` is seconds on the page's clock. Returns { light, size, glow }, each 1 for the star as
// usual: light scales its brightness, size its disc's width, glow its halo. The dimming is the star's own, in
// magnitudes, but held to at most 1.3 (Mira's swing of five and a half would leave no disc to see).
export const SHOWN_IN = 12;
const frac = x => x - Math.floor(x);
export function onScreen(v, s) {
  if (v.kind === 'flare') {
    // A faint flicker, and a flare in each nine seconds, at a moment of its own: up in a fifth of a second, down over
    // about two.
    const flicker = 1 + 0.04 * Math.sin(s * 7.3) + 0.03 * Math.sin(s * 12.1 + 1);
    const w = Math.floor(s / 9), at = w * 9 + 1 + 6 * frac(Math.sin(w * 12.9898 + 4.1) * 43758.5453);
    const since = s - at;
    const flare = since < 0 || since > 3 ? 0 : since < 0.2 ? since / 0.2 : Math.exp(-(since - 0.2) / 0.6);
    return { light: flicker + 2.2 * flare, size: 1, glow: 1 + 1.5 * flare };
  }
  const phase = frac(s / SHOWN_IN);
  const dim = v.kind === 'semiregular' ? (1 - Math.cos(2 * Math.PI * phase)) / 2 : dimAt(v, phase);
  const range = Math.min(v.faint - v.bright, 1.3);
  const light = 10 ** (-0.4 * range * dim);
  // A pulsing star is widest when it is dimmest (Mira's radius runs from about 330 to 400 Suns: Wikipedia, after
  // Woodruff and others 2004); an eclipse leaves the disc as it is.
  const size = v.kind === 'eclipse' ? 1 : 1 + (v.star === 'Mira' ? 0.18 : 0.07) * dim;
  return { light, size, glow: light };
}

// The line under the header while the ship holds there: the real period, and that the viewscreen speeds it up, as
// two parts short enough for a phone's header. With reduced motion asked for the disc stays still, and the line
// gives only the period.
const REAL = {
  Algol: 'Dims every 2.87 days', Mira: 'Pulses over 332 days', 'δ Cephei': 'Pulses every 5.37 days',
  Betelgeuse: 'Pulses, about 400 days', 'Proxima Centauri': 'Flares without warning',
};
export const onScreenParts = (v, moving = true) => (moving ? [REAL[v.star], 'sped up'] : [REAL[v.star]]);
