import { clamp } from './rng.js'

/**
 * Setbacks come in two flavours:
 *  injury – physical, usually keeps you out of events
 *  slump  – you can still tee it up, you just cannot do the thing any more
 */
export const AILMENTS = [
  {
    id: 'back',
    kind: 'injury',
    name: 'Lower back injury',
    weeks: [4, 16],
    out: true,
    pen: { power: 9, irons: 5, accuracy: 4, consistency: 3 },
    ageWeight: 1.9,
    text: 'Your back locked up on the range. The MRI is not encouraging.',
  },
  {
    id: 'wrist',
    kind: 'injury',
    name: 'Wrist tendon tear',
    weeks: [5, 18],
    out: true,
    pen: { irons: 8, shortGame: 7, power: 4 },
    ageWeight: 1.0,
    text: 'A buried lie in thick rough, and something in the wrist gave way.',
  },
  {
    id: 'shoulder',
    kind: 'injury',
    name: 'Shoulder impingement',
    weeks: [3, 12],
    out: true,
    pen: { power: 7, accuracy: 4, irons: 4 },
    ageWeight: 1.4,
    text: 'The shoulder has been grumbling for months. Now it is shouting.',
  },
  {
    id: 'rib',
    kind: 'injury',
    name: 'Stress fracture (rib)',
    weeks: [6, 14],
    out: true,
    pen: { power: 8, irons: 5, consistency: 4 },
    ageWeight: 1.1,
    text: 'Every full swing feels like being kicked. Six weeks minimum, they say.',
  },
  {
    id: 'knee',
    kind: 'injury',
    name: 'Knee surgery',
    weeks: [8, 24],
    out: true,
    pen: { power: 8, accuracy: 5, consistency: 4 },
    ageWeight: 1.7,
    text: 'The knee finally needs the operation you have been putting off.',
  },
  {
    id: 'neck',
    kind: 'injury',
    name: 'Neck spasm',
    weeks: [2, 6],
    out: true,
    pen: { accuracy: 5, irons: 4, putting: 3 },
    ageWeight: 1.3,
    text: 'You woke up unable to turn your head. It happens more often now.',
  },
  {
    id: 'illness',
    kind: 'injury',
    name: 'Illness',
    weeks: [1, 4],
    out: true,
    pen: { consistency: 5, mental: 3, power: 3 },
    ageWeight: 0.6,
    text: 'Whatever went round the locker room, you got it worst.',
  },
  {
    id: 'yips',
    kind: 'slump',
    name: 'The putting yips',
    weeks: [8, 30],
    out: false,
    pen: { putting: 18, mental: 6 },
    ageWeight: 1.5,
    text: 'Something is wrong with the short ones. You cannot make the stroke.',
  },
  {
    id: 'driverYips',
    kind: 'slump',
    name: 'Two-way miss off the tee',
    weeks: [6, 22],
    out: false,
    pen: { accuracy: 15, consistency: 6, mental: 4 },
    ageWeight: 0.9,
    text: 'You have no idea where the driver is going. Neither does your caddie.',
  },
  {
    id: 'chipYips',
    kind: 'slump',
    name: 'Chipping yips',
    weeks: [6, 20],
    out: false,
    pen: { shortGame: 16, mental: 5 },
    ageWeight: 1.2,
    text: 'Bladed one across the green in front of everybody. Then did it again.',
  },
  {
    id: 'formSlump',
    kind: 'slump',
    name: 'Form slump',
    weeks: [5, 18],
    out: false,
    pen: { consistency: 9, irons: 5, putting: 4, mental: 4 },
    ageWeight: 0.8,
    text: 'Nothing hurts. Nothing works either.',
  },
  {
    id: 'burnout',
    kind: 'slump',
    name: 'Burnout',
    weeks: [4, 14],
    out: false,
    pen: { mental: 12, consistency: 7, putting: 4 },
    ageWeight: 0.7,
    text: 'You are on a plane again and you genuinely cannot remember which city.',
  },
]

export function ailmentById(id) {
  return AILMENTS.find((a) => a.id === id)
}

/** Weekly probability that something goes wrong. */
export function setbackChance(player, { physio = 0, psych = 0, playedThisWeek = false }) {
  const age = player.age
  let base = 0.0055
  base += Math.max(0, age - 30) * 0.00075
  base += Math.max(0, age - 44) * 0.0016
  base += Math.pow(clamp(player.fatigue, 0, 100) / 100, 2) * 0.02
  if (playedThisWeek) base += 0.0035
  base *= 1 - physio * 0.45
  base *= 1 - psych * 0.12
  return clamp(base, 0, 0.14)
}

export function rollSetback(rng, player, { physio = 0, psych = 0, playedThisWeek = false }) {
  const chance = setbackChance(player, { physio, psych, playedThisWeek })
  if (!rng.chance(chance)) return null
  const burnoutPush = clamp(player.fatigue / 70, 0, 1.6)
  const pick = rng.pickWeighted(AILMENTS, (a) => {
    let w = 1
    w *= 1 + (a.ageWeight - 1) * clamp((player.age - 26) / 20, 0, 1.5)
    if (a.id === 'burnout') w *= 0.4 + burnoutPush * 2.4
    if (a.kind === 'slump') w *= 0.85
    if (a.id === 'yips') w *= player.ratings.mental < 50 ? 1.8 : 0.7
    return w
  })
  const weeks = rng.int(pick.weeks[0], pick.weeks[1])
  const severity = clamp(rng.gauss(1, 0.25), 0.5, 1.8)
  return {
    id: pick.id,
    name: pick.name,
    kind: pick.kind,
    out: pick.out,
    weeksTotal: weeks,
    weeksLeft: weeks,
    severity: Math.round(severity * 100) / 100,
    pen: pick.pen,
    text: pick.text,
    startedWeek: null,
  }
}

/** Rating penalties from the active ailment, tapering as recovery progresses. */
export function ailmentPenalty(ailment) {
  if (!ailment) return {}
  const progress = 1 - ailment.weeksLeft / Math.max(1, ailment.weeksTotal)
  const taper = ailment.kind === 'injury' ? 1 - progress * 0.45 : 1 - progress * 0.25
  const out = {}
  for (const [k, v] of Object.entries(ailment.pen)) out[k] = -v * ailment.severity * taper
  return out
}

/**
 * Lingering damage once an injury clears. Serious injuries permanently shave
 * a little off, which is what makes a comeback arc feel earned.
 */
export function residualDamage(ailment, rng, physio) {
  if (ailment.kind !== 'injury') return {}
  const severe = ailment.weeksTotal >= 10
  if (!severe && !rng.chance(0.2)) return {}
  const scale = (severe ? 1 : 0.4) * ailment.severity * (1 - physio * 0.5)
  const out = {}
  for (const [k, v] of Object.entries(ailment.pen)) {
    const loss = Math.round(v * scale * 0.14 * rng.float(0.5, 1.3))
    if (loss > 0) out[k] = -loss
  }
  return out
}

export function recoveryNote(ailment) {
  if (!ailment) return null
  if (ailment.kind === 'injury') {
    if (ailment.weeksLeft > ailment.weeksTotal * 0.6) return 'Early days. No clubs at all.'
    if (ailment.weeksLeft > ailment.weeksTotal * 0.25) return 'Chipping and putting only.'
    return 'Hitting full shots again. Nearly there.'
  }
  if (ailment.weeksLeft > ailment.weeksTotal * 0.5) return 'It is still in your head.'
  return 'Signs of life. It is starting to loosen.'
}
