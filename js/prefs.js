// What every room shares about how Engage sounds, feels and reads: sound on or off, vibration on or off (Android
// only: iPhones have no way for a page to vibrate), and the text size. Kept under its own key, apart from the
// bridge's save, so the speaker in any room's header can change it and every other room, and the bridge, follow.
// Pure, checked by test/bridge.test.mjs; js/room.js reads and writes it for a page.

export const PREFS = 'engage.prefs';

// Text: Standard, Large, Largest. Each is a scale on the browser's own text size, so a phone set to larger text
// starts larger here too (every size in Engage's stylesheets is counted in --px, a sixteenth of the browser's size
// times this scale).
export const SIZES = ['standard', 'large', 'largest'];
export const SCALE = { standard: 1, large: 1.15, largest: 1.3 };
export const SIZE_NAMES = { standard: 'Standard', large: 'Large', largest: 'Largest' };

const DEFAULTS = { sound: true, buzz: true, text: 'standard' };

// The settings as kept, given `get(key)` (the browser's storage: text or null). Anything missing or damaged is the
// default. Sound was once the bridge's own setting ("Engine sound", in engage.v1's opts): a bridge that had it off
// keeps it off until the new setting is first changed.
export function readPrefs(get) {
  const p = parse(get(PREFS));
  const out = { ...DEFAULTS };
  if (p) {
    if (typeof p.sound === 'boolean') out.sound = p.sound;
    if (typeof p.buzz === 'boolean') out.buzz = p.buzz;
    if (SIZES.includes(p.text)) out.text = p.text;
  }
  if (!p || typeof p.sound !== 'boolean') {
    const bridge = parse(get('engage.v1'));
    if (bridge?.opts?.sound === false) out.sound = false;
  }
  return out;
}

// The settings with one changed, ready to keep.
export function withPref(prefs, key, value) {
  const next = { ...DEFAULTS, ...prefs, [key]: value };
  if (!SIZES.includes(next.text)) next.text = DEFAULTS.text;
  return { sound: !!next.sound, buzz: !!next.buzz, text: next.text };
}

// How much bigger the words drawn into pictures (tonight's tags, the Maru's display, the missions map) are than
// their standard size: the browser's own text size against its usual 16 px, times the setting's scale.
export function textScale(text, rootPx = 16) {
  const browser = Number.isFinite(rootPx) && rootPx > 0 ? rootPx / 16 : 1;
  return browser * (SCALE[text] ?? 1);
}

function parse(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { return null; }
}
