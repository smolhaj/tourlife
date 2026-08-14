import { SENIOR_AGE } from './constants.js'
import { overall } from './ratings.js'
import { clamp } from './rng.js'

export const CARD_LABELS = {
  full: 'Full card',
  conditional: 'Conditional',
  none: 'No status',
}

export function emptyCards() {
  return {
    domestic: { status: 'none', until: 0 },
    intl: { status: 'none', until: 0 },
    asian: { status: 'none', until: 0 },
    emerging: { status: 'none', until: 0 },
    senior: { status: 'none', until: 0 },
  }
}

export function cardStatus(state, circuit) {
  const c = state.cards[circuit]
  if (!c) return 'none'
  if (c.until && c.until < state.year) return 'none'
  return c.status
}

export function grantCard(state, circuit, status, years) {
  const cur = state.cards[circuit] || { status: 'none', until: 0 }
  const rank = { none: 0, conditional: 1, full: 2 }
  const until = state.year + years
  if (rank[status] > rank[cur.status] || until > cur.until) {
    state.cards[circuit] = {
      status: rank[status] >= rank[cur.status] ? status : cur.status,
      until: Math.max(cur.until, until),
    }
  }
}

/** Is the player exempt into the majors this season? */
export function majorExempt(state) {
  const p = state.player
  const reasons = []
  if (p.rank && p.rank <= 60) reasons.push(`World top 60 (#${p.rank})`)
  if (state.majorExemptUntil && state.majorExemptUntil >= state.year) reasons.push('Past major champion exemption')
  if (state.tourWinExemptUntil && state.tourWinExemptUntil >= state.year) reasons.push('Recent tour winner')
  if (state.career.asianOrderOfMeritWins > 0 && state.asianOMExemptUntil >= state.year) reasons.push('Asian Circuit Order of Merit')
  return { exempt: reasons.length > 0, reasons }
}

/**
 * Can the player tee it up in this event, and if not, is there a back door?
 * Returns { ok, via, reason, qualifier }
 */
export function checkEligibility(state, event) {
  const p = state.player
  if (p.retired) return { ok: false, reason: 'Retired' }

  if (event.circuit === 'senior') {
    if (p.age < SENIOR_AGE) return { ok: false, reason: `Senior Circuit is ${SENIOR_AGE}+` }
    const st = cardStatus(state, 'senior')
    if (st === 'full') return { ok: true, via: 'Senior card' }
    if (st === 'conditional' && !event.flagship) return { ok: true, via: 'Conditional senior status' }
    if (event.seniorMajor && state.career.majors > 0) return { ok: true, via: 'Major champion exemption' }
    return { ok: false, reason: 'No senior status for this event', qualifier: qualifierChance(state, event) }
  }

  // The Emerging Circuit is the floor of the sport: ordinary events there take
  // open entries from anybody, at any age, card or no card. Resolved before
  // every other restriction so that whatever else has gone wrong in a career,
  // there is always somewhere to tee it up. (Holding partial status used to be
  // worse than holding none, because the open-entry fallback sat below the
  // age gate and only applied when status was exactly 'none'.)
  if (event.circuit === 'emerging' && !event.flagship) {
    const est = cardStatus(state, 'emerging')
    if (est === 'full') return { ok: true, via: 'Full card' }
    if (est === 'conditional') return { ok: true, via: 'Conditional status' }
    return { ok: true, via: 'Open entry', fee: EMERGING_ENTRY_FEE }
  }

  if (p.age >= SENIOR_AGE + 5 && event.circuit !== 'amateur') {
    // Regular tours quietly stop taking entries from the very old.
    const st = cardStatus(state, event.circuit)
    if (st !== 'full' && !(p.rank && p.rank <= 60)) {
      return { ok: false, reason: 'No longer exempt on the regular tours', qualifier: qualifierChance(state, event) }
    }
  }

  if (event.circuit === 'amateur') {
    if (state.player.status === 'amateur') return { ok: true, via: 'Amateur status' }
    return { ok: false, reason: 'Professionals cannot enter amateur events' }
  }

  if (event.circuit === 'major') {
    const ex = majorExempt(state)
    if (ex.exempt) return { ok: true, via: ex.reasons[0] }
    if (event.id === 'maj_magnolia' && !(p.rank && p.rank <= 50)) {
      return { ok: false, reason: 'Magnolia is invitation only — world top 50', qualifier: qualifierChance(state, event) * 0.4 }
    }
    return { ok: false, reason: 'Not exempt', qualifier: qualifierChance(state, event) }
  }

  const st = cardStatus(state, event.circuit)
  if (st === 'full') return { ok: true, via: 'Full card' }
  if (st === 'conditional') {
    if (event.flagship) return { ok: false, reason: 'Conditional status does not cover invitationals', qualifier: qualifierChance(state, event) }
    return { ok: true, via: 'Conditional status' }
  }
  if (p.rank && p.rank <= 60) return { ok: true, via: `World top 60 (#${p.rank})` }
  return { ok: false, reason: `No ${event.circuit} status`, qualifier: qualifierChance(state, event) }
}

/**
 * Monday qualifying. Chance is driven by how far above the local standard the
 * player is; nobody is ever a lock.
 */
export function qualifierChance(state, event) {
  const ovr = overall(state.effRatings || state.player.ratings)
  const bar = { amateur: 34, emerging: 52, asian: 56, intl: 62, domestic: 66, major: 72, senior: 58 }[event.circuit] || 60
  const edge = ovr - bar - (event.flagship ? 3 : 0) - (event.isMajor ? 2 : 0)
  return clamp(0.04 + edge * 0.028, 0.01, 0.62)
}

/** End-of-season card shuffle, driven by money lists and results. */
export function resolveCards(state, rng) {
  const notes = []
  const s = state.seasonTotals
  const year = state.year

  const moneyByCircuit = s.moneyByCircuit || {}
  const startsByCircuit = s.startsByCircuit || {}

  // Money-list retention: earn enough on a tour and you keep playing there.
  const thresholds = {
    domestic: 800000,
    intl: 380000,
    asian: 165000,
    emerging: 70000,
    senior: 240000,
  }
  for (const circuit of ['domestic', 'intl', 'asian', 'emerging', 'senior']) {
    const money = moneyByCircuit[circuit] || 0
    const starts = startsByCircuit[circuit] || 0
    const cur = cardStatus(state, circuit)
    const bar = thresholds[circuit] * Math.pow(1.022, state.yearsElapsed)
    if (starts >= 8 && money >= bar) {
      grantCard(state, circuit, 'full', 1)
      if (cur !== 'full') notes.push(`Kept your ${circuit} card on the money list.`)
    } else if (starts >= 6 && money >= bar * 0.45) {
      if (cur === 'full') {
        state.cards[circuit] = { status: 'conditional', until: year + 1 }
        notes.push(`Dropped to conditional status on the ${circuit} tour.`)
      } else {
        grantCard(state, circuit, 'conditional', 1)
      }
    }
  }

  // Graduation from the development tour.
  const emergingMoney = moneyByCircuit.emerging || 0
  const infl = Math.pow(1.022, state.yearsElapsed)
  if (emergingMoney >= 175000 * infl) {
    grantCard(state, 'domestic', 'full', 2)
    notes.push('Top of the Emerging Circuit money list — you have graduated to the Domestic Tour.')
  } else if (emergingMoney >= 95000 * infl) {
    grantCard(state, 'intl', 'full', 1)
    notes.push('A strong Emerging Circuit season earned you International Tour status.')
  }

  // Promotion up the ladder. Without these you could win repeatedly on the
  // International or Asian circuits and still have no way onto the tour above,
  // because retention there is measured in starts you were never allowed.
  const intlMoney = moneyByCircuit.intl || 0
  if (intlMoney >= 1200000 * infl && cardStatus(state, 'domestic') !== 'full') {
    grantCard(state, 'domestic', 'full', 2)
    notes.push('You finished high enough on the International Tour money list to earn a Domestic Tour card.')
  }
  if (emergingMoney >= 55000 * infl && cardStatus(state, 'asian') === 'none') {
    grantCard(state, 'asian', 'conditional', 2)
    notes.push('A respectable Emerging Circuit season has opened the Asian Circuit to you.')
  }
  const asianMoney = moneyByCircuit.asian || 0
  if (asianMoney >= 450000 * infl && cardStatus(state, 'intl') !== 'full') {
    grantCard(state, 'intl', 'full', 2)
    notes.push('Topping the Asian Circuit order of merit has earned you International Tour status.')
  }

  // Any win on a tour buys you two years there.
  for (const w of state.career.winsList || []) {
    if (w.year === year && w.circuit !== 'amateur' && w.circuit !== 'major') {
      grantCard(state, w.circuit, 'full', 2)
    }
  }

  // Turning 50 opens the senior door.
  if (state.player.age + 1 >= SENIOR_AGE) {
    const st = state.career.wins >= 5 || state.career.majors >= 1 ? 'full' : 'conditional'
    if (cardStatus(state, 'senior') !== 'full') {
      // Senior status does not lapse — you only get older.
      grantCard(state, 'senior', st, 100)
      notes.push(`You are eligible for the Senior Circuit (${st === 'full' ? 'full' : 'conditional'} status).`)
    }
  }

  return notes
}

/** Q-School: one roll, five levels of outcome. */
export function runQSchool(state, rng) {
  const ovr = overall(state.effRatings || state.player.ratings)
  const roll = ovr + rng.gauss(0, 6.5) + (state.player.form || 0) * 0.8
  if (roll >= 71) {
    grantCard(state, 'domestic', 'full', 2)
    grantCard(state, 'intl', 'conditional', 1)
    return { tier: 'domestic', text: 'You finished inside the top five at Q-School. Full Domestic Tour card.' }
  }
  if (roll >= 65) {
    grantCard(state, 'domestic', 'conditional', 1)
    grantCard(state, 'emerging', 'full', 2)
    return { tier: 'conditional', text: 'Conditional Domestic status and a full Emerging Circuit card.' }
  }
  if (roll >= 58) {
    grantCard(state, 'intl', 'full', 1)
    grantCard(state, 'asian', 'full', 2)
    grantCard(state, 'emerging', 'full', 2)
    return { tier: 'intl', text: 'International Tour card secured, with Asian Circuit status alongside it.' }
  }
  if (roll >= 54) {
    grantCard(state, 'asian', 'full', 2)
    grantCard(state, 'emerging', 'full', 2)
    return { tier: 'asian', text: 'A full Asian Circuit card, and Emerging Circuit status to fall back on.' }
  }
  if (roll >= 50) {
    grantCard(state, 'emerging', 'full', 2)
    grantCard(state, 'asian', 'conditional', 2)
    return { tier: 'emerging', text: 'Full Emerging Circuit card, plus conditional Asian Circuit status.' }
  }
  if (roll >= 43) {
    grantCard(state, 'emerging', 'conditional', 1)
    return { tier: 'conditional-emerging', text: 'Conditional Emerging Circuit status. You will be relying on the alternate list.' }
  }
  return { tier: 'none', text: 'You missed at Q-School. Another year of Monday qualifiers.' }
}

export const Q_SCHOOL_FEE = 6500
export const EMERGING_ENTRY_FEE = 900
