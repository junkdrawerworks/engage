// The Bridge Officer's Test, as rules: no drawing and no page, so it can be tested on its own.
// In The Next Generation's "Thine Own Self" (season 7, episode 16, first shown 14 February 1994) Deanna Troi has
// passed every other part of the test for promotion to commander and keeps failing this one, a holodeck simulation of
// a badly damaged Enterprise. She tries again and again to save the ship without putting anyone at risk. The only
// answer is to order Geordi La Forge, holographic in the simulation, to make a repair in a place that will quickly
// kill him. (Source: Wikipedia's article on the episode, read 18 November 2026. Memory Alpha could not be reached to
// check the details, so the damage, the tries and the words here are Engage's own, not the episode's.)
// Here: a coolant leak, a warp core that will breach, and one conduit in a flooded compartment that only the chief
// engineer can mend in time. Every other order is a real thing to try, and none of them works.

export const MINUTES = 6; // to the breach: each order takes one

// The orders, in the order the page lists them. `tried` is said the first time; a second time is only time lost.
const ORDERS = [
  { id: 'eject', label: 'Eject the warp core', sub: 'Get it clear of the ship', tried: ['Engineering', 'The ejection system took the same hit. It won’t answer.'] },
  { id: 'shutdown', label: 'Shut the core down', sub: 'From the bridge', tried: ['Ops', 'The shutdown runs through the damaged conduit. The core isn’t listening.'] },
  { id: 'beam', label: 'Beam the conduit out', sub: 'Or a team in, in suits', tried: ['Transporter room', 'We can’t get a lock through that radiation, Commander. Not on the conduit, not on a team.'] },
  { id: 'drone', label: 'Send in a remote', sub: 'A repair drone', tried: ['Engineering', 'The radiation is scrambling its circuits. It stopped two metres inside the door.'] },
  { id: 'volunteer', label: 'Ask for a volunteer', sub: 'Don’t make it an order', tried: ['La Forge', 'Nobody else knows that conduit well enough to do it in time. If anyone goes, it’s me. Give the order, Commander.'] },
  { id: 'self', label: 'Go in yourself', sub: 'Your life, not his', tried: ['The examiner', 'You don’t know that conduit. You’d be dead before you found it, and the ship with you.'] },
  { id: 'wait', label: 'Look for another way', sub: 'There must be one', tried: ['Ops', 'Nothing, Commander. Every other system that could stop it is down.'] },
  { id: 'separate', label: 'Separate the saucer', sub: 'Save who you can', end: 'saucer' },
  { id: 'order', label: 'Order La Forge in', sub: 'He won’t come out', end: 'passed', danger: true },
];

export function newTest() {
  return { minutes: MINUTES, turn: 0, tried: [], over: null };
}

export function orders(t) {
  if (t.over) return [];
  return ORDERS.map(o => ({ id: o.id, label: o.label, sub: t.tried.includes(o.id) ? 'Already tried' : o.sub, tried: t.tried.includes(o.id), danger: !!o.danger }));
}

// Gives one order. Returns what was said, for the page's log.
export function act(t, id) {
  const o = ORDERS.find(x => x.id === id);
  if (t.over || !o) return [];
  const lines = [];
  const say = (who, text, tone) => lines.push({ who, text, tone });
  t.turn++;
  if (o.end === 'passed') {
    t.over = 'passed';
    say('You', 'Commander La Forge, go into engineering and repair that conduit.');
    say('La Forge', 'Understood.', 'good');
    say('Engineering', 'The conduit is sealed. Coolant flow restored. Core temperature falling.', 'good');
    say('Computer', 'Lieutenant Commander La Forge: no life signs.', 'bad');
    say('The examiner', 'End simulation.');
    return lines;
  }
  if (o.end === 'saucer') {
    t.over = 'saucer';
    say('Helm', 'Separation complete. The saucer is clear, at full impulse.');
    say('Computer', 'Warp core breach in the stardrive section.', 'bad');
    say('The examiner', 'End simulation.');
    return lines;
  }
  if (t.tried.includes(id)) say('Ops', 'We’ve tried that, Commander.');
  else { t.tried.push(id); say(...o.tried); }
  t.minutes--;
  if (t.minutes <= 0) {
    t.over = 'breach';
    say('Computer', 'Warp core breach.', 'bad');
    say('The examiner', 'End simulation.');
  } else say('Computer', `Warp core breach in ${t.minutes} minute${t.minutes === 1 ? '' : 's'}.`, t.minutes <= 2 ? 'bad' : undefined);
  return lines;
}

// The test picked up from the orders given, as the Maru's is.
export function replay(kept) {
  if (!kept || !Array.isArray(kept.orders) || kept.orders.length > 40) return null;
  const t = newTest();
  for (const id of kept.orders) { if (t.over || !ORDERS.some(o => o.id === id)) return null; act(t, id); }
  return t;
}

// The verdict. The test has one passing answer, and the board says what the other orders were for.
export function evaluate(t) {
  const others = t.tried.length;
  const tries = others === 1 ? 'one other way' : `${['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][others] || others} other ways`;
  if (t.over === 'passed') {
    return {
      title: 'Passed', passed: true,
      summary: 'The ship and everyone else aboard came through. Commander La Forge did not.',
      note: [
        others ? `You tried ${tries} first. Each was worth trying, and none of them was going to work.` : 'You gave the order without looking for another way. The board will ask whether you could have known there wasn’t one.',
        'You ordered a friend to his death to save the ship. That is the order this test is about: a commander has to be able to give it.',
      ],
    };
  }
  if (t.over === 'saucer') {
    return {
      title: 'The saucer', passed: false,
      summary: 'The saucer got clear with most of the crew. The stardrive section was lost, and everyone still in it.',
      note: [
        others ? `You tried ${tries} before you gave up on the ship.` : 'You gave up on the ship at once.',
        'There was a way to save all of her, and it cost one life. You chose to lose more of them rather than give that order.',
      ],
    };
  }
  return {
    title: 'Breach', passed: false,
    summary: 'The warp core breached. The ship was lost with everyone aboard.',
    note: [
      `You tried ${tries}, looking for an answer that cost nobody. There wasn’t one.`,
      'The board isn’t testing whether you can find a clever way out. It is testing whether you can give the order when there isn’t one.',
    ],
  };
}

export const moral = 'The Bridge Officer’s Test has one answer, and it costs a life.';
