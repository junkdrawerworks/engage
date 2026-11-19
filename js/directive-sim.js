// The Prime Directive's rules: a board of inquiry. A case is a few orders, each a choice where the right thing and
// General Order 1 (no interference with a people who haven't reached warp, not even to let them know you exist) pull
// apart. The board then grades four things, Compassion, Restraint, Judgment and Candour, and says what a captain on
// screen did with the same kind of case. Unlike the Kobayashi Maru it isn't rigged: every path costs something, and
// none earns an A in all four. Pure, checked by test/directive.test.mjs; js/directive.js draws it.
//
// A choice's `score` moves each grade from where every case starts (70, a B), with the board's reason; `next` is the
// step it leads to, or null when the case is over. A case's paths are the choices' ids in order, and a path stays
// what it is: a new choice gets a new id.

export const GRADED = ['Compassion', 'Restraint', 'Judgment', 'Candour'];
export const START = 70;
export const letter = s => (s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F');

export const CASES = [
  {
    id: 'voice',
    title: 'The voice on the radio',
    world: 'Velan IV, a Class M world',
    brief: [
      'For three weeks your science officer, Lieutenant Oduya, has been answering a radio call from Velan IV. The caller is a girl called Teshi, about ten, who thinks she has found someone on the far side of her world.',
      'The Velani have radio and railways and have never left their planet. General Order 1 says you may not let them learn that you exist, or change the course of their history. And their world is coming apart: the survey gives its crust months before the great quakes, perhaps less.',
    ],
    start: 'radio',
    steps: {
      radio: {
        text: 'Oduya brings you the log of the calls. Your orders?',
        choices: [
          { id: 'stop', label: 'Stop answering her, tonight', next: 'quake',
            said: 'Oduya signs off without a word. Teshi calls every night for a week.',
            score: { Restraint: [15, 'You cut the contact the moment you knew of it.'], Compassion: [-10, 'She called every night for a week, and nobody answered.'] } },
          { id: 'listen', label: 'Keep listening, but say nothing more', next: 'quake',
            said: 'Her calls keep coming. Oduya logs every one and answers none.',
            score: { Restraint: [5, 'You stopped the talking, and kept the line open.'], Judgment: [5, 'You kept the one window you had on the planet.'] } },
          { id: 'staff', label: 'Put it before the senior staff, and in the log', next: 'quake',
            said: 'The staff meet. The doctor wants to help her; the first officer reads out the order. Everyone has seen the choice.',
            score: { Candour: [15, 'You put it in the log and in front of your officers before anything was decided.'], Judgment: [5, 'You heard both sides before you chose.'] } },
        ],
      },
      quake: {
        text: 'Teshi’s next call is frightened: the ground is splitting in her valley. Your geologists say a pulse from the deflector could settle the faults under the whole continent in a few hours, from orbit, and no Velani instrument would notice.',
        choices: [
          { id: 'leave', label: 'Leave the planet to its own fate', next: 'last',
            said: 'The order holds. The faults don’t: the valley’s towns are shaken flat.',
            score: { Restraint: [20, 'You kept General Order 1 to the letter, when it cost the most.'], Compassion: [-25, 'You could have saved a continent in an afternoon, unseen, and didn’t.'], Judgment: [-5, 'The order is about history; you let a whole people lose theirs to rock.'] } },
          { id: 'settle', label: 'Settle the faults from orbit', next: 'valley',
            said: 'The deflector hums for four hours. Below, the shaking slows.',
            score: { Compassion: [20, 'You saved the continent.'], Restraint: [-15, 'You changed a planet’s history, however quietly.'], Judgment: [5, 'Nobody below will ever know why the quakes stopped.'] } },
          { id: 'warn', label: 'Have Oduya tell her to get her family to high ground', next: 'valley',
            said: 'Oduya tells her to go up the hill and not to wait. She asks how he knows.',
            score: { Compassion: [5, 'You warned one family.'], Restraint: [-10, 'A voice from nowhere told a child what was coming.'], Judgment: [-10, 'You broke the order, and saved a household instead of a continent.'], Candour: [5, 'You told her the truth about what was coming.'] } },
        ],
      },
      last: {
        text: 'Her last call comes in as the valley goes. She asks if anyone is there.',
        choices: [
          { id: 'answer', label: 'Answer her', next: null,
            said: 'Oduya tells her she isn’t alone. The line goes dead.',
            score: { Compassion: [15, 'Whatever else, she didn’t think she was alone at the end.'], Candour: [10, 'You didn’t pretend not to be there.'], Restraint: [-10, 'You kept the order through the quake, and broke it after.'] } },
          { id: 'silence', label: 'Let it ring', next: null,
            said: 'Nobody answers. The line goes dead.',
            score: { Restraint: [10, 'You held to the end.'], Compassion: [-10, 'The last thing she heard was nothing.'] } },
          { id: 'record', label: 'Record it for the archive, and don’t answer', next: null,
            said: 'Her voice goes into the Federation’s archive, the only record of her valley.',
            score: { Judgment: [5, 'Someone will know they were there.'], Candour: [5, 'You kept the record honest.'], Compassion: [-5, 'A record is not an answer.'] } },
        ],
      },
      valley: {
        text: 'The shaking is easing, but not soon enough: the slope above Teshi’s street is going to give way. Oduya asks to beam down and bring her out.',
        choices: [
          { id: 'refuse', label: 'Refuse: that is as far as we go', next: null,
            said: 'The slope comes down at dawn. Her neighbours dig her out alive, with a broken arm. She never calls again.',
            score: { Restraint: [10, 'You drew a line and kept to it.'], Compassion: [-10, 'You left a child under a hillside you’d seen coming.'] } },
          { id: 'beam', label: 'Beam her up', next: 'aboard',
            said: 'Oduya materialises in her kitchen and brings her out as the slope goes.',
            score: { Compassion: [15, 'You got her out.'], Restraint: [-15, 'A Velani child has now been aboard a starship.'], Judgment: [-5, 'You saved one person and put the whole order at risk.'] } },
          { id: 'team', label: 'Send a team down in their clothes to lead the street out', next: null,
            said: 'Nobody looks twice at strangers in the dust. Eleven families walk out before the slope goes.',
            score: { Compassion: [15, 'Eleven families walked out.'], Restraint: [-5, 'You went down there, in disguise.'], Judgment: [10, 'The most lives for the least disturbance.'], Candour: [-10, 'You saved them by lying to them about who you were.'] } },
        ],
      },
      aboard: {
        text: 'Teshi is in sickbay, unhurt, looking out of the window at her world. She has seen the ship.',
        choices: [
          { id: 'erase', label: 'Have the doctor take her memory of the ship', next: null,
            said: 'She wakes in her own bed, safe, with no memory of where she has been.',
            score: { Restraint: [15, 'You left no trace in her people’s history.'], Candour: [-15, 'You took a child’s memory without asking her.'], Compassion: [-5, 'She lost the friend she made.'] } },
          { id: 'truth', label: 'Send her home with the truth', next: null,
            said: 'She tells everyone. Nobody believes her, yet.',
            score: { Candour: [20, 'You lied to nobody.'], Restraint: [-25, 'You told a pre-warp world, through a child, that it isn’t alone.'], Compassion: [5, 'She keeps her friend.'] } },
          { id: 'secret', label: 'Tell her the truth, and ask her to keep it', next: null,
            said: 'She promises. She is ten.',
            score: { Candour: [10, 'You told her the truth.'], Restraint: [-10, 'The secret is now hers to keep.'], Judgment: [-5, 'You’ve put the order in a child’s hands.'], Compassion: [5, 'She keeps her friend.'] } },
        ],
      },
    },
    // What a captain on screen did with a case like it (Wikipedia, “Pen Pals (Star Trek: The Next Generation)”).
    onScreen: {
      episode: 'Pen Pals',
      series: 'The Next Generation, season 2, 1989',
      path: ['stop', 'settle', 'beam', 'erase'],
      text: 'Data answered a radio call from Sarjenka, a girl on a world tearing itself apart, and talked to her for weeks. Picard ordered him to stop. When her next call came, with volcanoes threatening her home, Picard decided they could not ignore her: the crew settled the planet’s geology, and Data, sent down to take her to safety, brought her back to the ship instead. Picard had Dr Pulaski erase her memories of Data and the Enterprise, and Data took her home asleep.',
    },
    endings: {
      'leave': 'The order kept',
      'refuse': 'A quiet hand',
      'team': 'Strangers in the dust',
      'erase': 'Nothing to remember',
      'truth': 'Not alone',
      'secret': 'A secret kept by a child',
    },
  },
];

export const caseOf = id => CASES.find(c => c.id === id) || null;

// A hearing under way: the case, the step it has reached, and the orders given.
export function newHearing(id) {
  const c = caseOf(id);
  return c ? { case: c.id, step: c.start, path: [], over: false } : null;
}
// The choices open at the hearing's step.
export function choices(h) {
  const c = caseOf(h.case);
  return h.over || !c ? [] : c.steps[h.step].choices;
}
// An order given: the hearing moves on. Returns what the order led to, or null for an order not open now.
export function choose(h, id) {
  const ch = choices(h).find(x => x.id === id);
  if (!ch) return null;
  h.path.push(id);
  if (ch.next) h.step = ch.next; else h.over = true;
  return ch;
}

// The orders of a path, each with its step: [{ step, choice }], or null when the path isn't one the case allows.
export function walk(caseId, path) {
  const c = caseOf(caseId);
  if (!c || !Array.isArray(path)) return null;
  const out = [];
  let step = c.start;
  for (const id of path) {
    if (!step) return null;
    const ch = c.steps[step].choices.find(x => x.id === id);
    if (!ch) return null;
    out.push({ step, choice: ch });
    step = ch.next;
  }
  return step ? null : out;
}

// Every complete path through a case.
export function paths(caseId) {
  const c = caseOf(caseId), out = [];
  const go = (step, path) => {
    for (const ch of c.steps[step].choices) (ch.next ? go(ch.next, [...path, ch.id]) : out.push([...path, ch.id]));
  };
  if (c) go(c.start, []);
  return out;
}

// The board's verdict on a finished path: a title, each grade with its letter and the reason that weighed most (the
// worst mark for a grade below an A, the best for an A, and for a grade nothing touched, that nothing did), what
// happened, and how close the path came to the captain's on screen.
export function verdict(caseId, path) {
  const c = caseOf(caseId), w = walk(caseId, path);
  if (!w) return null;
  const grades = GRADED.map(name => {
    const marks = w.map(x => x.choice.score[name]).filter(Boolean);
    const score = START + marks.reduce((s, [d]) => s + d, 0);
    const l = letter(score);
    const pick = marks.length ? marks.reduce((a, b) => ((l === 'A' ? b[0] > a[0] : b[0] < a[0]) ? b : a)) : null;
    return { name, score, letter: l, why: pick ? pick[1] : 'Nothing you ordered tested it either way.' };
  });
  const last = path[path.length - 1];
  const same = c.onScreen.path.filter((id, k) => path[k] === id).length;
  return {
    title: c.endings[last] || c.endings[path.find(id => c.endings[id])] || 'The board has heard the case',
    grades,
    happened: w.map(x => x.choice.said),
    orders: w.map(x => x.choice.label),
    same, of: c.onScreen.path.length,
  };
}

// "The voice on the radio: Strangers in the dust, B C A C": a hearing in a line, for the record.
export const line = (caseId, v) => `${caseOf(caseId).title}: ${v.title}, ${v.grades.map(g => g.letter).join(' ')}`;

// The record kept under engage.directive.v1: { heard: [{ case, path, t }] }, newest first, the last 30. A hearing
// that isn't a whole path of a case it knows is left out when the record is read.
export const KEEP = 30;
export function recordHearing(saved, caseId, path, t = Date.now()) {
  const was = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  return { ...was, heard: [{ case: caseId, path: [...path], t }, ...heard(was)].slice(0, KEEP) };
}
export function heard(saved) {
  const list = saved && Array.isArray(saved.heard) ? saved.heard : [];
  return list.filter(h => h && typeof h === 'object' && walk(h.case, h.path) && Number.isFinite(h.t));
}
