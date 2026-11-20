// Engine sounds, made on the spot with Web Audio: no sound files to download.
let ctx = null, master = null, hum = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

function noise(seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// One plain tone: `type` of wave from `f0` to `f1` Hz, starting `at` seconds from now for `dur`, peaking at `peak`.
function tone({ f0, f1 = f0, at = 0, dur = 0.18, type = 'sine', peak = 0.1, cut = 0 }) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.015, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = o;
  if (cut) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; o.connect(lp); out = lp; }
  out.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// The sounds made in the rooms besides the bridge's flight, each said by name to a test that is listening (a page
// with window.engageHeard set to a list): nobody building Engage can hear them.
function heard(name) {
  if (typeof window !== 'undefined' && Array.isArray(window.engageHeard)) window.engageHeard.push(name);
}
function ready(name) {
  if (!sound.on || !ensure()) return false;
  ctx.resume();
  heard(name);
  return true;
}

export const sound = {
  on: true,

  blip(freq = 880) {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.16);
  },

  // The jump: a rising rush of filtered noise over a low swell, which settles into a hum for the trip.
  engage(seconds) {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime;
    // The rush swells and settles over its first 2.6 seconds, and the hold that follows can't start before that: a
    // hold point set earlier would come first in time, keep the sound at nothing until then, and cut in with a click.
    seconds = Math.max(seconds, 2.6);
    const n = noise(seconds + 3), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 1.6);
    bp.frequency.exponentialRampToValueAtTime(520, t + 2.6);
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.5, t + 1.5);
    ng.gain.exponentialRampToValueAtTime(0.09, t + 2.6);
    ng.gain.setValueAtTime(0.09, t + seconds);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 1.4);
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
    n.stop(t + seconds + 1.5);

    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'sine';
    o.frequency.setValueAtTime(42, t);
    o.frequency.exponentialRampToValueAtTime(66, t + 1.5);
    o2.frequency.setValueAtTime(84, t);
    o2.frequency.exponentialRampToValueAtTime(132, t + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22, t + 1.4);
    og.gain.exponentialRampToValueAtTime(0.1, t + 2.4);
    og.gain.setValueAtTime(0.1, t + seconds);
    og.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 1.2);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(og).connect(master);
    for (const x of [o, o2]) { x.start(t); x.stop(t + seconds + 1.3); }
    hum = { o, o2, og, ng };
  },

  // Going to warp and away at once, for the Kobayashi Maru: the jump's rising rush and low swell with no trip to hum
  // through. It rises for the 0.7 seconds the ship takes to streak off the screen and is gone half a second later.
  warpOut() {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime;
    const n = noise(1.4), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.7);
    bp.frequency.exponentialRampToValueAtTime(520, t + 1.2);
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.08, t + 0.06);
    ng.gain.exponentialRampToValueAtTime(0.5, t + 0.7);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
    n.stop(t + 1.3);

    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), og = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o2.type = 'sine';
    o.frequency.setValueAtTime(42, t);
    o.frequency.exponentialRampToValueAtTime(66, t + 0.7);
    o2.frequency.setValueAtTime(84, t);
    o2.frequency.exponentialRampToValueAtTime(132, t + 0.7);
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.06, t + 0.06);
    og.gain.exponentialRampToValueAtTime(0.22, t + 0.65);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(og).connect(master);
    for (const x of [o, o2]) { x.start(t); x.stop(t + 1.25); }
  },

  // Dropping out of warp: a falling whoosh.
  arrive() {
    if (!this.on || !ensure()) return;
    const t = ctx.currentTime;
    const n = noise(1.6), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + 1.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    n.connect(bp).connect(g).connect(master);
    n.start(t);
    n.stop(t + 1.5);
    hum = null;
  },

  // For the Kobayashi Maru: weapons, hits and the red alert.
  phaser() {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.5);
    o2.frequency.setValueAtTime(1407, t); o2.frequency.exponentialRampToValueAtTime(690, t + 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
    g.gain.setValueAtTime(0.06, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(master);
    for (const x of [o, o2]) { x.start(t); x.stop(t + 0.62); }
  },

  torpedo() {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.42);
  },

  boom(big = false) {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime, len = big ? 2.4 : 1.1;
    const n = noise(len), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(big ? 1800 : 1200, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.9 : 0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(lp).connect(g).connect(master);
    n.start(t); n.stop(t + len + 0.05);
  },

  // A short hit on the hull: a thud with some rattle.
  thud() {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.4);
  },

  // Red alert: two rising whoops.
  alert() {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.55, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(760, t + 0.4);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.04);
      g.gain.setValueAtTime(0.07, t + 0.38);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
      o.connect(lp).connect(g).connect(master);
      o.start(t); o.stop(t + 0.5);
    }
  },

  // The transporter: a shimmer of high tones.
  beam() {
    if (!this.on || !ensure()) return;
    ctx.resume();
    const t = ctx.currentTime;
    for (const [f, d] of [[1760, 0], [2217, 0.05], [2637, 0.1], [3520, 0.15]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + d);
      o.frequency.linearRampToValueAtTime(f * 1.02, t + d + 1.1);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.025, t + d + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.2);
      o.connect(g).connect(master);
      o.start(t + d); o.stop(t + d + 1.25);
    }
  },

  // The warp scale's race: the five ships leave together on a rising sweep, and each one arriving rings a little
  // lower than the last (`k` counts them in, from 0).
  raceStart() {
    if (!ready('raceStart')) return;
    tone({ f0: 220, f1: 880, dur: 0.45, type: 'triangle', peak: 0.08 });
    tone({ f0: 880, dur: 0.25, at: 0.42, peak: 0.07 });
  },
  laneIn(k = 0) {
    if (!ready('laneIn')) return;
    const f = 1320 * Math.pow(2, -k / 4);
    tone({ f0: f, dur: 0.5, peak: 0.06 });
    tone({ f0: f * 2, dur: 0.25, peak: 0.02 });
  },

  // Long missions and subspace radio: a hail going out is three rising chirps, and one landing is three falling.
  hailOut() {
    if (!ready('hailOut')) return;
    for (let i = 0; i < 3; i++) tone({ f0: 700 + i * 120, f1: 1050 + i * 120, at: i * 0.13, dur: 0.11, peak: 0.07 });
  },
  hailIn() {
    if (!ready('hailIn')) return;
    for (let i = 0; i < 3; i++) tone({ f0: 1290 - i * 120, f1: 900 - i * 120, at: i * 0.13, dur: 0.11, peak: 0.07 });
  },

  // The Kobayashi Maru's evaluation: a stamp for each grade as it lands, `at` seconds from now.
  stamp(at = 0) {
    if (!ready('stamp')) return;
    const t = ctx.currentTime + at;
    const n = noise(0.14), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    n.connect(lp).connect(g).connect(master);
    n.start(t); n.stop(t + 0.15);
    tone({ f0: 120, f1: 60, at, dur: 0.16, peak: 0.25 });
  },

  // First contact: a rising figure when contact is made, a falling one when the channel closes.
  contactMade() {
    if (!ready('contactMade')) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f0: f, at: i * 0.14, dur: i === 3 ? 0.9 : 0.3, type: 'triangle', peak: 0.07 }));
  },
  channelClosed() {
    if (!ready('channelClosed')) return;
    [659.25, 523.25, 440, 329.63].forEach((f, i) => tone({ f0: f, at: i * 0.16, dur: i === 3 ? 0.8 : 0.3, type: 'triangle', peak: 0.06, cut: 1400 }));
  },

  // The survey's quiz: right is two notes going up, wrong two going down.
  right() {
    if (!ready('right')) return;
    tone({ f0: 660, dur: 0.14, peak: 0.08 });
    tone({ f0: 990, at: 0.11, dur: 0.24, peak: 0.08 });
  },
  wrong() {
    if (!ready('wrong')) return;
    tone({ f0: 311, dur: 0.18, type: 'square', peak: 0.04, cut: 1200 });
    tone({ f0: 233, at: 0.16, dur: 0.3, type: 'square', peak: 0.04, cut: 1000 });
  },

  // The lab: a creature going into a jar, glass on glass.
  clink() {
    if (!ready('clink')) return;
    for (const [f, at, peak] of [[2637, 0, 0.06], [3951, 0, 0.025], [2793, 0.09, 0.03]]) tone({ f0: f, at, dur: 0.35, peak });
  },

  stop() {
    if (hum && ctx) {
      const t = ctx.currentTime;
      for (const g of [hum.og, hum.ng]) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); }
      hum = null;
    }
    if (ctx) master.gain.setValueAtTime(this.on ? 0.5 : 0, ctx.currentTime);
  },
};
