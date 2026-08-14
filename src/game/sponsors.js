import { SPONSOR_CATEGORIES, SPONSOR_BRANDS } from './constants.js'
import { clamp } from './rng.js'
import { inflation } from './schedule.js'

const BASE_DEAL = 3_500_000

/**
 * How sellable the player is right now, 0..1.
 * Ranking dominates; majors give it staying power. Everything else is a
 * modifier — a player ranked 300th is not a marketing asset no matter how
 * many mini-tour events they have won.
 */
export function marketability(p, career) {
  const rank = p.rank && p.rank > 0 ? p.rank : 500
  let m = clamp(1.05 - Math.log10(rank) / 2.4, 0, 1)
  m += Math.min(0.3, (career.majors || 0) * 0.055)
  m += Math.min(0.12, (career.wins || 0) * 0.008)
  m += Math.min(0.14, (p.season?.wins || 0) * 0.07)
  if (career.majors > 0) m += 0.04
  if (p.age > 45) m -= (p.age - 45) * 0.018
  if (p.age < 24) m -= 0.05
  if (p.status === 'amateur') m *= 0.2
  return clamp(m, 0, 1.25)
}

export function dealValue(category, m, agentMult, yearsElapsed, rng) {
  const cat = SPONSOR_CATEGORIES.find((c) => c.id === category)
  const raw = BASE_DEAL * cat.base * Math.pow(m, 2.6) * agentMult * inflation(yearsElapsed)
  const jitter = rng ? rng.float(0.82, 1.2) : 1
  return Math.max(15000, Math.round((raw * jitter) / 5000) * 5000)
}

/**
 * Build this offseason's sponsorship offers. Categories you already have an
 * active exclusive deal in are skipped.
 */
export function generateOffers(rng, player, career, staff, activeDeals, yearsElapsed, agentMult) {
  const m = marketability(player, career)
  const live = activeDeals.filter((d) => d.yearsLeft > 0)
  // Nobody signs everything — past seven logos an athlete runs out of surface
  // area and the deals start cannibalising each other.
  if (live.length >= 7) return []
  const held = new Set(live.map((d) => d.category))
  const available = SPONSOR_CATEGORIES.filter((c) => !held.has(c.id))
  const slots = clamp(Math.round(1 + m * 6 + (staff.agent ? staff.agent.q * 2.5 : 0)), 0, available.length)
  const chosen = rng.shuffle(available).slice(0, slots)

  return chosen.map((cat) => {
    const annual = dealValue(cat.id, m, agentMult, yearsElapsed, rng)
    const years = rng.int(2, m > 0.6 ? 5 : 4)
    const brand = rng.pick(SPONSOR_BRANDS[cat.id])
    const minRank = m > 0.7 ? rng.int(30, 70) : m > 0.4 ? rng.int(70, 140) : rng.int(150, 300)
    return {
      id: `${cat.id}_${brand}_${yearsElapsed}`.replace(/\W/g, '_'),
      category: cat.id,
      categoryName: cat.name,
      brand,
      annual,
      years,
      yearsLeft: years,
      signingBonus: rng.chance(0.45) ? Math.round((annual * rng.float(0.2, 0.6)) / 5000) * 5000 : 0,
      winBonus: Math.round((annual * rng.float(0.05, 0.14)) / 1000) * 1000,
      majorBonus: Math.round((annual * rng.float(0.3, 0.8)) / 5000) * 5000,
      minRank,
      strikes: 0,
      providesGear: !!cat.providesGear,
      gearQuality: cat.providesGear ? clamp(0.35 + m * 0.55 + rng.gauss(0, 0.08), 0.15, 0.98) : 0,
      signedYear: null,
      negotiated: false,
    }
  })
}

/**
 * Push for a better deal. Outcome depends on marketability and your agent.
 * Returns { outcome: 'improved'|'held'|'withdrawn', offer }
 */
export function negotiate(rng, offer, m, staff) {
  const agentQ = staff.agent ? staff.agent.q : 0.15
  const leverage = clamp(m * 0.62 + agentQ * 0.42, 0.05, 0.96)
  const roll = rng.next()
  if (roll < leverage * 0.72) {
    const bump = 1 + rng.float(0.1, 0.28) * (0.5 + leverage)
    return {
      outcome: 'improved',
      offer: {
        ...offer,
        annual: Math.round((offer.annual * bump) / 5000) * 5000,
        signingBonus: Math.round((offer.signingBonus * bump) / 5000) * 5000,
        negotiated: true,
      },
    }
  }
  if (roll > 0.9 - leverage * 0.35) {
    return { outcome: 'held', offer: { ...offer, negotiated: true } }
  }
  return { outcome: 'withdrawn', offer: null }
}

/** Annual income from all live contracts. */
export function sponsorIncome(deals) {
  return deals.filter((d) => d.yearsLeft > 0).reduce((a, d) => a + d.annual, 0)
}

/**
 * Roll contracts forward one season. Underperformance costs you deals.
 * Returns { deals, expired, dropped, renewals }
 */
export function rollSponsors(rng, deals, player, career) {
  const kept = []
  const expired = []
  const dropped = []
  for (const d of deals) {
    if (d.yearsLeft <= 0) continue
    const next = { ...d, yearsLeft: d.yearsLeft - 1 }
    const rank = player.rank || 400
    const underperforming = rank > d.minRank * 1.25
    if (underperforming) {
      next.strikes = (next.strikes || 0) + 1
      if (next.strikes >= 2 && rng.chance(0.55)) {
        dropped.push(next)
        continue
      }
    } else {
      next.strikes = 0
      // Playing well mid-contract earns a quiet raise.
      if (rank < d.minRank * 0.45 && rng.chance(0.3)) {
        next.annual = Math.round((next.annual * rng.float(1.08, 1.22)) / 5000) * 5000
        next.raised = true
      }
    }
    if (next.yearsLeft <= 0) {
      expired.push(next)
      continue
    }
    kept.push(next)
  }
  return { deals: kept, expired, dropped }
}

export function sponsorBonusesFor(deals, { win, major }) {
  let total = 0
  for (const d of deals) {
    if (d.yearsLeft <= 0) continue
    if (major) total += d.majorBonus || 0
    else if (win) total += d.winBonus || 0
  }
  return total
}
