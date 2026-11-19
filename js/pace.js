// Draws a picture smaller on a phone too slow to draw it full size, and lets the page stretch it back up. The
// survey's turning globe is painted pixel by pixel: on a slow phone one picture can take 70 ms, and a tap waits
// behind it. The page tells `took` how long each picture took (not the first of a new world or size, which also lays
// the globe out); once the middle of the last six is over 10 ms, the next pictures are drawn at three-quarters of the
// size, and then at three-fifths. A fast phone stays at full size, and nothing ever steps back up, so a
// globe doesn't flicker between sizes. Pure, checked by test/survey.test.mjs.
export const STEPS = [1, 0.75, 0.6];
export const SLOW_MS = 10;
const RUN = 6;

export class Pace {
  constructor(steps = STEPS, slow = SLOW_MS) {
    this.steps = steps;
    this.slow = slow;
    this.step = 0;
    this.times = [];
  }

  // How much of its full size the next picture is drawn at.
  get scale() { return this.steps[this.step]; }

  // Takes how long one picture took to draw, in milliseconds. Returns true when the size has just stepped down.
  took(ms) {
    if (!(ms >= 0) || this.step === this.steps.length - 1) return false;
    this.times.push(ms);
    if (this.times.length < RUN) return false;
    const middle = [...this.times].sort((a, b) => a - b)[RUN >> 1];
    this.times = [];
    if (middle <= this.slow) return false;
    this.step++;
    return true;
  }
}
