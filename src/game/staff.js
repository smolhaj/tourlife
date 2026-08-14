import { STAFF_TIERS, AGENT_TIERS, STAFF_ROLES } from './constants.js'
import { makeName, randomRegion } from './names.js'
import { clamp } from './rng.js'

const COACH_TRAITS = [
  { id: 'ballStriking', label: 'Ball-striking guru', attr: 'irons' },
  { id: 'speed', label: 'Speed merchant', attr: 'power' },
  { id: 'shortGame', label: 'Short game specialist', attr: 'shortGame' },
  { id: 'putting', label: 'Putting doctor', attr: 'putting' },
  { id: 'fundamentals', label: 'Fundamentals purist', attr: 'accuracy' },
  { id: 'grinder', label: 'Consistency builder', attr: 'consistency' },
]

const CADDIE_TRAITS = [
  { id: 'greenReader', label: 'Elite green reader' },
  { id: 'yardageNerd', label: 'Yardage-book obsessive' },
  { id: 'calm', label: 'Calming presence' },
  { id: 'motivator', label: 'Fires you up' },
  { id: 'veteran', label: 'Thirty years on the bag' },
]

const SUPPORT_TRAITS = [
  { id: 'preventative', label: 'Prevention first' },
  { id: 'rehab', label: 'Rehab specialist' },
  { id: 'strength', label: 'Strength and conditioning' },
  { id: 'longevity', label: 'Longevity programme' },
]

const PSYCH_TRAITS = [
  { id: 'closer', label: 'Sunday specialist' },
  { id: 'resilience', label: 'Resilience coaching' },
  { id: 'routine', label: 'Routine architect' },
  { id: 'burnout', label: 'Burnout prevention' },
]

const AGENT_TRAITS = [
  { id: 'hustler', label: 'Relentless hustler' },
  { id: 'connected', label: 'Deeply connected' },
  { id: 'loyal', label: 'Old-school loyalist' },
  { id: 'global', label: 'Global reach' },
]

function traitsFor(role) {
  if (role === 'coach') return COACH_TRAITS
  if (role === 'caddie') return CADDIE_TRAITS
  if (role === 'psych') return PSYCH_TRAITS
  if (role === 'agent') return AGENT_TRAITS
  return SUPPORT_TRAITS
}

export function makeStaffCandidate(rng, role, tierIdx, taken) {
  const isAgent = role === 'agent'
  const tier = isAgent ? AGENT_TIERS[tierIdx] : STAFF_TIERS[tierIdx]
  const region = randomRegion(rng)
  const name = makeName(rng, region.id, taken)
  const q = clamp(tier.q + rng.gauss(0, 0.05), 0.05, 0.99)
  const trait = rng.pick(traitsFor(role))
  return {
    id: `${role}_${name.full.replace(/\W/g, '')}_${tierIdx}`,
    role,
    name: name.full,
    flag: region.flag,
    tier: tierIdx,
    tierLabel: tier.label,
    q: Math.round(q * 1000) / 1000,
    trait: trait.id,
    traitLabel: trait.label,
    traitAttr: trait.attr || null,
    salary: isAgent ? 0 : Math.round(STAFF_TIERS[tierIdx].salary[role] * rng.float(0.85, 1.2) * (0.7 + q * 0.6)),
    cut: isAgent ? tier.cut : 0,
    sponsorMult: isAgent ? tier.sponsorMult : 1,
    yearsWithYou: 0,
  }
}

/** A fresh hiring market. Better staff only surface once you have a reputation. */
export function generateStaffMarket(rng, reputation, taken) {
  const market = {}
  for (const role of STAFF_ROLES) {
    const maxTier = reputation >= 0.85 ? 4 : reputation >= 0.6 ? 3 : reputation >= 0.35 ? 2 : reputation >= 0.15 ? 1 : 0
    const list = []
    const count = 5
    for (let i = 0; i < count; i++) {
      const tierIdx = clamp(Math.round(rng.float(0, maxTier + 0.49)), 0, maxTier)
      list.push(makeStaffCandidate(rng, role.id, tierIdx, taken))
    }
    list.sort((a, b) => b.q - a.q)
    market[role.id] = list
  }
  return market
}

export function emptyStaff() {
  return { coach: null, caddie: null, physio: null, psych: null, agent: null }
}

export function staffQuality(staff, role) {
  return staff?.[role]?.q || 0
}

export function annualStaffCost(staff) {
  let total = 0
  for (const role of STAFF_ROLES) {
    const s = staff[role.id]
    if (s) total += s.salary || 0
  }
  return total
}

export function agentCut(staff) {
  return staff.agent ? staff.agent.cut : 0.02
}

export function sponsorMultiplier(staff) {
  const base = staff.agent ? staff.agent.sponsorMult : 0.55
  const loyalty = staff.agent && staff.agent.trait === 'connected' ? 1.1 : 1
  return base * loyalty
}

/**
 * Everything staff contribute on tournament day, as a small quality bonus and
 * a variance reduction.
 */
export function staffMatchdayEffect(staff, event) {
  const caddie = staff.caddie
  const psych = staff.psych
  let quality = 0
  let sigmaMult = 1
  if (caddie) {
    quality += caddie.q * 0.8
    if (caddie.trait === 'greenReader') quality += 0.5
    if (caddie.trait === 'yardageNerd') quality += 0.35
    if (caddie.trait === 'calm') sigmaMult -= 0.05
    if (caddie.trait === 'veteran' && (event.isMajor || event.flagship)) quality += 0.7
    sigmaMult -= caddie.q * 0.07
  }
  if (psych) {
    const big = event.isMajor || event.seniorMajor ? 1.8 : event.flagship ? 1.2 : 1
    quality += psych.q * 0.5 * big
    if (psych.trait === 'closer' && (event.isMajor || event.flagship)) quality += 0.6
    if (psych.trait === 'routine') sigmaMult -= 0.04
  }
  return { quality, sigmaMult: clamp(sigmaMult, 0.82, 1) }
}

export function coachTrainingBonus(staff, attr) {
  const coach = staff.coach
  if (!coach) return 0
  let bonus = coach.q * 0.85
  if (coach.traitAttr === attr) bonus += 0.55
  return bonus
}

export function describeStaff(s) {
  if (!s) return 'Nobody'
  return `${s.name} — ${s.tierLabel}, ${s.traitLabel}`
}
