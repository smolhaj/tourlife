import { CAREER_PHASES, MAJOR_NARRATIVE, SENIOR_AGE } from './constants.js'
import { fmtMoney } from './finance.js'

export function careerPhase(player) {
  if (player.retired) return { id: 'retired', label: 'Retired' }
  if (player.age >= SENIOR_AGE) return { id: 'senior', label: 'Senior circuit' }
  for (const phase of CAREER_PHASES) {
    if (phase.test(player)) return phase
  }
  return CAREER_PHASES[CAREER_PHASES.length - 1]
}

export function majorNarrative(majors) {
  let out = MAJOR_NARRATIVE[0]
  for (const m of MAJOR_NARRATIVE) if (majors >= m.min) out = m
  return out
}

/**
 * Hall of Fame points. Roughly calibrated so ~100 is a coin-flip case and
 * 150+ is a first-ballot certainty.
 */
export function legacyScore(career, player) {
  const s =
    (career.majors || 0) * 15 +
    (career.wins || 0) * 3.1 +
    (career.seniorWins || 0) * 0.8 +
    (career.top10s || 0) * 0.35 +
    (career.weeksAtNo1 || 0) * 0.16 +
    (career.seasonsTop10 || 0) * 2.4 +
    (career.careerEarnings || 0) / 12_000_000 +
    Math.max(0, (player?.peakOvr || 0) - 62) * 1.1
  return Math.round(s * 10) / 10
}

export function legacyLabel(score) {
  if (score >= 220) return { label: 'Inner circle', tone: 'great' }
  if (score >= 150) return { label: 'First-ballot Hall of Fame', tone: 'great' }
  if (score >= 100) return { label: 'Hall of Fame', tone: 'good' }
  if (score >= 65) return { label: 'Hall of Very Good', tone: 'good' }
  if (score >= 35) return { label: 'Long, respectable career', tone: 'ok' }
  if (score >= 12) return { label: 'Made a living out here', tone: 'ok' }
  return { label: 'A few years, then real life', tone: 'bad' }
}

export function makeHighlight(type, { year, week, title, text, importance = 1, money, eventName }) {
  return { type, year, week, title, text, importance, money, eventName }
}

const WIN_LINES = [
  'Held on when it mattered.',
  'Ran away with it on the back nine.',
  'Made a putt on the last that will be on highlight reels forever.',
  'Won it in a playoff nobody expected.',
  'Never looked like losing after Thursday.',
  'Chipped in on 17. Of course.',
  'Came from five back with a Sunday 63.',
]

export function winLine(rng, event, margin) {
  if (margin >= 6) return `A ${margin}-shot demolition of the field.`
  if (margin === 0) return 'Won it in a playoff nobody expected.'
  if (margin === 1) return 'One shot. That is all it took, and all there was.'
  return rng.pick(WIN_LINES)
}

const MC_LINES = [
  'Two rounds and a long drive home.',
  'Never got going.',
  'A Friday 76 did it.',
  'Three doubles in eleven holes.',
  'The putter was cold all week.',
]

export function missedCutLine(rng) {
  return rng.pick(MC_LINES)
}

/** Small, cheap flavour so weeks off are not silent. */
const OFF_WEEK_LINES = [
  'Range work. Nothing dramatic.',
  'Flew home. Slept in your own bed for once.',
  'Two days with the coach, three days with your family.',
  'Played a member-guest with your dad. Shot 78 and enjoyed it.',
  'Gym, physio, gym. Boring is the point.',
  'Watched the tournament on TV and hated it.',
  'Signed a hundred flags at a corporate day.',
  'Practised putting until your back complained.',
]

export function offWeekLine(rng) {
  return rng.pick(OFF_WEEK_LINES)
}

/** Rare non-golf life events that colour a career. */
export const LIFE_EVENTS = [
  { id: 'child', text: 'You became a parent. Everything reorganises around it.', minAge: 25, effect: { morale: 8, dependents: 1, burnout: 0.04 } },
  { id: 'marriage', text: 'You got married in the offseason.', minAge: 24, effect: { morale: 7, dependents: 1 } },
  { id: 'divorce', text: 'The marriage did not survive the travel.', minAge: 30, effect: { morale: -14, cashPct: -0.3 } },
  { id: 'mentor', text: 'An old pro took you under their wing. You listened.', minAge: 20, effect: { morale: 4, mental: 2 } },
  { id: 'loss', text: 'You lost someone close. You played anyway.', minAge: 26, effect: { morale: -10, mental: 1 } },
  { id: 'documentary', text: 'A streaming documentary followed you all season. The exposure is worth money.', minAge: 24, effect: { morale: 3, marketability: 0.06 } },
  { id: 'charity', text: 'You started a junior golf foundation in your hometown.', minAge: 28, effect: { morale: 6, cash: -250000 } },
  { id: 'investment', text: 'A restaurant investment went badly.', minAge: 26, effect: { morale: -5, cashPct: -0.12 } },
  { id: 'course', text: 'You bought into a course design business. It pays.', minAge: 34, effect: { morale: 4, cash: -400000, income: 200000 } },
  { id: 'feud', text: 'A locker-room disagreement went public. Not a great look.', minAge: 22, effect: { morale: -6, marketability: -0.05 } },
  { id: 'honour', text: 'Your home club named a hole after you.', minAge: 30, effect: { morale: 9 } },
]

export function shareText(state) {
  const p = state.player
  const c = state.career
  const legacy = legacyScore(c, p)
  const lines = [
    `⛳ TOUR LIFE — ${p.name} ${p.flag}`,
    `${p.retired ? 'Retired' : 'Age'} ${p.age} · ${careerPhase(p).label}`,
    '',
    `🏆 Majors: ${c.majors}   Wins: ${c.wins}   Top 10s: ${c.top10s}`,
    `🌍 Best world ranking: #${c.bestRank || '—'}   Weeks at #1: ${c.weeksAtNo1 || 0}`,
    `💰 Career earnings: ${fmtMoney(c.careerEarnings, { compact: true })}   Net worth: ${fmtMoney(state.finance.cash, { compact: true })}`,
    `📜 ${majorNarrative(c.majors).label} · ${legacyLabel(legacy).label} (${legacy})`,
  ]
  return lines.join('\n')
}
