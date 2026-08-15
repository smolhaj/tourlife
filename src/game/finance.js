import { TAX_RATE, CADDIE_WIN_CUT, CADDIE_TOP10_CUT, CADDIE_BASE_CUT, lifestyleById, TRAVEL_COST } from './constants.js'
import { inflation } from './schedule.js'

/**
 * Break a prize cheque down the way it actually happens: the caddie and the
 * agent are paid off the gross, then the tax bill lands on what is left.
 */
export function splitPrize(gross, { pos, madeCut, hasCaddie, agentCut, backerCut = 0 }) {
  if (!gross || !madeCut) {
    return { gross: 0, caddie: 0, agent: 0, backer: 0, tax: 0, net: 0 }
  }
  const caddieRate = !hasCaddie ? 0 : pos === 1 ? CADDIE_WIN_CUT : pos <= 10 ? CADDIE_TOP10_CUT : CADDIE_BASE_CUT
  const caddie = Math.round(gross * caddieRate)
  const agent = Math.round(gross * agentCut)
  // A backer is paid off the top like everyone else who has a claim on the
  // cheque before you do.
  const backer = Math.round(gross * backerCut)
  const taxable = gross - caddie - agent - backer
  const tax = Math.round(taxable * TAX_RATE)
  return { gross, caddie, agent, backer, tax, net: taxable - tax }
}

export function netRate({ hasCaddie, agentCut, pos = 20 }) {
  const s = splitPrize(1_000_000, { pos, madeCut: true, hasCaddie, agentCut })
  return s.net / 1_000_000
}

/**
 * Appearance money.
 *
 * Outside the biggest domestic tour — which forbids it — tournaments pay names
 * to turn up, and for a marketable player it is a large share of what a season
 * abroad is worth. It is also the only guaranteed money in golf, which makes it
 * the one thing that can justify a long flight into a weak field when the
 * ranking points are all at home.
 *
 * Nobody is paid to show up until people have heard of them, which is what the
 * threshold is for.
 */
const APPEARANCE_MIN_MARKET = 0.45
const APPEARANCE_SHARE = 0.18

/** Circuits whose promoters can write the cheque. */
export function paysAppearanceFees(event) {
  if (!event || event.isMajor || !event.purse) return false
  return event.circuit === 'intl' || event.circuit === 'asian'
}

/**
 * The fifth promoter to book you this year is not paying what the first paid.
 * Appearance money is bought novelty, and a player who turns up everywhere has
 * none left to sell — which is also what stops a marketable career collecting
 * a seven-figure cheque forty times a season and out-earning the sport.
 */
function appearanceSlot(alreadyTaken) {
  return 1 / (1 + Math.max(0, alreadyTaken) * 0.55)
}

export function appearanceFee(event, marketability, alreadyTaken = 0) {
  if (!paysAppearanceFees(event)) return 0
  const m = marketability || 0
  if (m < APPEARANCE_MIN_MARKET) return 0
  // Scaled from the threshold, so the first cheque a player is offered is a
  // small one rather than an abrupt six figures the week they cross the line.
  const t = (m - APPEARANCE_MIN_MARKET) / (1.25 - APPEARANCE_MIN_MARKET)
  const raw = event.purse * APPEARANCE_SHARE * Math.pow(clamp(t, 0, 1), 1.9) * appearanceSlot(alreadyTaken)
  return raw < 10000 ? 0 : Math.round(raw / 5000) * 5000
}

/** Appearance money is negotiated by your agent and taxed like any other fee. */
export function netAppearance(gross, agentCut) {
  return netEndorsement(gross, agentCut)
}

/** Endorsement income is taxed too, but nobody takes a caddie cut of it. */
export function netEndorsement(gross, agentCut) {
  const agent = Math.round(gross * Math.max(0.08, agentCut))
  const taxable = gross - agent
  const tax = Math.round(taxable * TAX_RATE)
  return { gross, agent, tax, net: taxable - tax }
}

export function annualExpenses({ lifestyleId, staffCost, startsByCircuit, yearsElapsed, dependents = 0, amateur = false }) {
  const ls = lifestyleById(lifestyleId)
  const infl = inflation(yearsElapsed)
  let travel = 0
  for (const [circuit, count] of Object.entries(startsByCircuit || {})) {
    travel += (TRAVEL_COST[circuit] || 8000) * count
  }
  // Amateurs are mostly sleeping in spare rooms and driving to events.
  const living = ls.cost * (1 + dependents * 0.18) * (amateur ? 0.35 : 1)
  return {
    living: Math.round(living * infl),
    travel: Math.round(travel * infl),
    staff: Math.round(staffCost),
    total: Math.round(living * infl + travel * infl + staffCost),
  }
}

/**
 * How deep in the red you can get before nobody will fund you any further.
 *
 * Golf careers end at the bank far more often than they end on the range. A
 * kid on the mini-tours is borrowing from parents and running up cards, and
 * that runs out somewhere under six figures. Somebody who has banked real
 * money has a house to remortgage and a name people will lend against, so the
 * ceiling rises with what you have already earned and how marketable you are —
 * but it never becomes unlimited.
 */
export function borrowingLimit({ careerEarnings = 0, marketability = 0, status = 'pro', yearsElapsed = 0, dependents = 0 }) {
  const infl = inflation(yearsElapsed)
  // Family, cards, and a sympathetic uncle.
  let limit = 85_000
  // Proven earnings are collateral: a slice of what you have banked in your life.
  limit += Math.min(careerEarnings * 0.16, 3_200_000)
  // A name people recognise can raise money on it.
  limit += marketability * 240_000
  // Amateurs have no earnings history at all to lend against.
  if (status === 'amateur') limit *= 0.7
  // Mouths to feed shorten everybody's patience.
  limit *= 1 - Math.min(dependents, 3) * 0.09
  return Math.round(limit * infl)
}

/** Annual cost of carrying debt. Unsecured borrowing is not cheap. */
export const DEBT_INTEREST = 0.09

export function debtInterest(cash) {
  return cash >= 0 ? 0 : Math.round(-cash * DEBT_INTEREST)
}

/**
 * Where you stand against that ceiling. `headroom` is what is left to borrow;
 * once it is gone the season cannot be funded.
 */
export function solvency(cash, limit) {
  const debt = Math.max(0, -cash)
  const headroom = Math.max(0, limit - debt)
  const used = limit > 0 ? debt / limit : 0
  let state = 'clear'
  if (debt > 0 && used < 0.5) state = 'borrowing'
  else if (used >= 0.5 && used < 0.85) state = 'stretched'
  else if (used >= 0.85 && used < 1) state = 'critical'
  else if (used >= 1) state = 'insolvent'
  return { debt, limit, headroom, used, state, insolvent: used >= 1 }
}

export const SOLVENCY_LABEL = {
  clear: 'In the black',
  borrowing: 'Borrowing, but comfortably',
  stretched: 'Stretched',
  critical: 'Nearly out of credit',
  insolvent: 'Out of money',
}

/**
 * A backer: somebody pays your bills now for a slice of everything you win
 * later. This is how the bottom of professional golf is actually financed, and
 * it is the only way out of a hole that does not involve quitting.
 *
 * Money follows promise, not need. A twenty-four-year-old with a real ceiling
 * gets funded; a thirty-eight-year-old journeyman in the same hole does not,
 * and that asymmetry is the point. Returns null when nobody is interested.
 */
export function backerOffer(rng, { age, ovr, potentialOvr, rank, needed, yearsElapsed = 0 }) {
  const room = Math.max(0, potentialOvr - ovr)
  // Youth is most of it; a visible ceiling and a decent ranking do the rest.
  let appeal = 0
  appeal += Math.max(0, 34 - age) * 0.06
  appeal += Math.max(0, potentialOvr - 58) * 0.035
  appeal += Math.min(room, 14) * 0.02
  if (rank && rank <= 300) appeal += (300 - rank) / 900
  if (age >= 38) appeal -= 0.5
  if (appeal < 0.35) return null

  const infl = inflation(yearsElapsed)
  // They cover the hole and a season on top, within reason.
  const amount = Math.round(Math.min(Math.max(needed, 120_000 * infl), 1_600_000 * infl))
  // The less they believe, the more they take.
  const cut = Math.round(clamp(0.46 - appeal * 0.16, 0.18, 0.46) * 100) / 100
  const years = appeal > 0.9 ? 3 : appeal > 0.6 ? 4 : 5
  return {
    id: `backer_${Math.round(amount)}_${Math.round(cut * 100)}`,
    amount,
    cut,
    years,
    name: rng ? rng.pick(BACKER_NAMES) : BACKER_NAMES[0],
    appeal: Math.round(appeal * 100) / 100,
  }
}

const BACKER_NAMES = [
  'a group of members at your home club',
  'a former tour pro turned investor',
  'a local car dealership owner',
  'your old college coach and two of his friends',
  'a syndicate that stakes mini-tour players',
  'an equipment rep who believes in you',
  'a family friend with more money than sense',
]

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * "Coast" milestones. `burn` is the current annual cost of living; the
 * target assumes a 4% real withdrawal rate.
 */
export function coastTargets(burn) {
  const nest = burn * 25
  return [
    { id: 'lean', label: 'Lean FI', amount: Math.round(nest * 0.55), blurb: 'You could stop, if you moved somewhere cheap.' },
    { id: 'coast', label: 'CoastFI', amount: Math.round(nest * 0.8), blurb: 'Let it compound and you never have to work again.' },
    { id: 'fi', label: 'Financial independence', amount: Math.round(nest), blurb: 'The tour is now a choice, not a job.' },
    { id: 'fat', label: 'Fat FI', amount: Math.round(nest * 2), blurb: 'Generational. Buy the golf course.' },
  ]
}

export function coastStatus(netWorth, burn) {
  const targets = coastTargets(burn)
  let reached = null
  for (const t of targets) if (netWorth >= t.amount) reached = t
  const next = targets.find((t) => netWorth < t.amount) || null
  return { reached, next, targets, progress: next ? netWorth / next.amount : 1 }
}

/**
 * Compounding on money you are not spending.
 *
 * Two things were wrong with the old version, and they only showed up at the
 * very top: gains were untaxed, and the volatility was wide enough that a
 * lucky run of years mattered more to a great career's final net worth than
 * the golf did. A nine-major career could finish at $1.7bn, with most of it
 * arriving from the portfolio rather than the sport.
 *
 * Gains are taxed at a lower rate than income, as they are, and the spread is
 * narrower — a rich athlete's money is mostly in property and index funds, not
 * in a single bet. The mean is barely touched; the tail is what needed cutting.
 */
export const CAPITAL_GAINS_RATE = TAX_RATE * 0.62

export function investmentReturn(rng, cash) {
  if (cash <= 0) return 0
  const r = rng.gaussClamped(0.042, 0.065, 2.6)
  const gross = cash * r
  return Math.round(gross > 0 ? gross * (1 - CAPITAL_GAINS_RATE) : gross)
}

export function fmtMoney(v, opts = {}) {
  const { compact = false, sign = false } = opts
  const neg = v < 0
  const a = Math.abs(Math.round(v))
  let s
  if (compact) {
    if (a >= 1e9) s = `$${(a / 1e9).toFixed(2)}B`
    else if (a >= 1e6) s = `$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`
    else if (a >= 1e3) s = `$${(a / 1e3).toFixed(0)}K`
    else s = `$${a}`
  } else {
    s = `$${a.toLocaleString('en-US')}`
  }
  if (neg) return `-${s}`
  return sign ? `+${s}` : s
}
