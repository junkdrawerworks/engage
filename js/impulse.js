// Impulse power: what the real sky does as a ship moves through space near the speed of light. Special relativity,
// with β the speed as a fraction of light's and θ the angle from dead ahead:
//   aberration   cos θ′ = (cos θ + β) / (1 + β cos θ)   a star at θ at rest is seen at θ′ on the move
//   Doppler      D = 1 / (γ (1 − β cos θ′))              light seen at θ′ arrives at D times its frequency
//   time         γ = 1 / √(1 − β²)                        one hour aboard is γ hours on Earth
// A star's light seen on the move is as if from a star D times hotter, and D² times as bright (all wavelengths).
// Pure: checked by test/warp.test.mjs.

export const C_KM_S = 299792.458;

export const gamma = beta => 1 / Math.sqrt(1 - beta * beta);

// Where a star at cos θ (at rest) is seen from a ship at β, as cos θ′.
export const aberrate = (cosT, beta) => (cosT + beta) / (1 + beta * cosT);

// How much the light of a star seen at cos θ′ is shifted: its frequency times D.
export const doppler = (cosTp, beta) => 1 / (gamma(beta) * (1 - beta * cosTp));

// The circle round dead ahead that the whole forward half of the sky at rest is squeezed into, in degrees: a star
// beside the ship (θ = 90°) is seen at cos θ′ = β.
export const halfSkyDeg = beta => Math.acos(beta) * 180 / Math.PI;

// "1 hour aboard is 2 hours 18 minutes on Earth."
export function hourOnEarth(beta) {
  const minutes = Math.round(gamma(beta) * 60);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const hours = `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return m ? `${hours} ${m} ${m === 1 ? 'minute' : 'minutes'}` : hours;
}

// What green light (550 nm, the middle of what the eye sees) arrives as, shifted by D: a colour, or ultraviolet or
// infrared once it is out of what the eye can see (about 380 to 750 nm).
export function greenSeenAs(d) {
  const nm = 550 / d;
  if (nm < 380) return 'ultraviolet';
  if (nm > 750) return 'infrared';
  return nm < 450 ? 'violet' : nm < 495 ? 'blue' : nm < 570 ? 'green' : nm < 590 ? 'yellow' : nm < 620 ? 'orange' : 'red';
}

// The throttle's speed in words: "0.9 of light speed, 269,813 km/s".
export function speedSaid(beta) {
  if (beta === 0) return 'Full stop';
  return `${beta.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} of light speed, ${Math.round(beta * C_KM_S).toLocaleString('en-US')} km/s`;
}
