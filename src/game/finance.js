import { TAX_RATE, CADDIE_WIN_CUT, CADDIE_TOP10_CUT, CADDIE_BASE_CUT, lifestyleById, TRAVEL_COST } from './constants.js'
import { inflation } from './schedule.js'

/**
 * Break a prize cheque down the way it actually happens: the caddie and the
 * agent are paid off the gross, then the tax bill lands on what is left.
 */
export function splitPrize(gross, { pos, madeCut, hasCaddie, agentCut }) {
  if (!gross || !madeCut) {
    return { gross: 0, caddie: 0, agent: 0, tax: 0, net: 0 }
  }
  const caddieRate = !hasCaddie ? 0 : pos === 1 ? CADDIE_WIN_CUT : pos <= 10 ? CADDIE_TOP10_CUT : CADDIE_BASE_CUT
  const caddie = Math.round(gross * caddieRate)
  const agent = Math.round(gross * agentCut)
  const taxable = gross - caddie - agent
  const tax = Math.round(taxable * TAX_RATE)
  return { gross, caddie, agent, tax, net: taxable - tax }
}

export function netRate({ hasCaddie, agentCut, pos = 20 }) {
  const s = splitPrize(1_000_000, { pos, madeCut: true, hasCaddie, agentCut })
  return s.net / 1_000_000
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

/** Simple compounding on money you are not spending. */
export function investmentReturn(rng, cash) {
  if (cash <= 0) return 0
  const r = rng.gaussClamped(0.042, 0.1, 2.6)
  return Math.round(cash * r)
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
