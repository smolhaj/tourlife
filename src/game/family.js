import { clamp } from './rng.js'
import { lifestyleById } from './constants.js'

/**
 * The life the tour is being played instead of.
 *
 * `dependents` was an integer that raised the cost of living and lowered the
 * borrowing limit, and the life events that produced it were a flat random
 * pool gated on age alone — so a career could be handed a divorce having never
 * married, become a parent four times in five years, and marry twice without
 * ever separating. None of it was on screen anywhere, and none of it ever
 * asked the player for anything.
 *
 * The part worth modelling is not the milestones, it is the cost. Professional
 * golf is thirty weeks a year in another time zone, and the bill for that is
 * paid at home by somebody who did not choose the job. Strain accumulates from
 * exactly the decisions the player is already making — how many starts, how
 * far, how they live, whether they ever stop — and when it runs out the game
 * asks the only question it can: which one do you want.
 */

export const FAMILY_STATUS = {
  single: 'Single',
  partner: 'With someone',
  married: 'Married',
  separated: 'Separated',
  divorced: 'Divorced',
}

/** Nobody is at home to be neglected when there is nobody at home. */
export function hasPartner(family) {
  return !!(family && family.partner && (family.status === 'partner' || family.status === 'married'))
}

export function newFamily() {
  return { status: 'single', partner: null, kids: [], strain: 0, ultimatum: null, history: [] }
}

/**
 * How hard a season was on the people who did not play it.
 *
 * Returns the change in strain for one year, roughly −0.35 to +0.35. Every
 * term is something the player chose: the size of the schedule, how much of it
 * crossed an ocean, whether they took the winter off, and whether they can
 * afford to bring anyone with them.
 */
export function strainDelta(family, { starts, longHaul, restedWinter, lifestyleId, kids, morale, broke }) {
  if (!hasPartner(family)) return 0
  let d = 0
  // Twenty-two starts is an ordinary year and roughly neutral. Thirty is not.
  d += (starts - 22) * 0.018
  // A long-haul week costs more at home than a drive to the next state.
  d += longHaul * 0.022
  // Small children and a travelling parent are the hardest combination there
  // is, and the years it applies to are exactly the years of a peak.
  d += Math.min(kids, 3) * 0.035
  // A winter actually spent at home is the single biggest thing that helps.
  if (restedWinter) d -= 0.12
  // "Decent hotels, a house you actually like, family travels with you."
  const cost = lifestyleById(lifestyleId).cost
  if (cost >= 260000) d -= 0.07
  if (cost <= 45000) d += 0.04
  // Being miserable at work does not stay at work.
  if (morale < 35) d += 0.05
  if (morale > 75) d -= 0.03
  // Money trouble strains everything.
  if (broke) d += 0.06
  return clamp(d, -0.35, 0.35)
}

export const STRAIN_BANDS = [
  { at: 0.85, id: 'breaking', label: 'Breaking', tone: 'red' },
  { at: 0.65, id: 'strained', label: 'Strained', tone: 'red' },
  { at: 0.4, id: 'stretched', label: 'Feeling the travel', tone: 'orange' },
  { at: 0.18, id: 'ok', label: 'Coping', tone: undefined },
  { at: -1, id: 'happy', label: 'Happy', tone: 'green' },
]

export function strainBand(strain) {
  return STRAIN_BANDS.find((b) => strain > b.at) || STRAIN_BANDS[STRAIN_BANDS.length - 1]
}

/** The threshold at which somebody stops asking and starts deciding. */
export const ULTIMATUM_AT = 0.85

export function strainLine(family) {
  if (!hasPartner(family)) return null
  const band = strainBand(family.strain)
  const who = family.partner.name
  const kids = family.kids.length
  switch (band.id) {
    case 'breaking':
      return `${who} has stopped asking when you will be home.`
    case 'strained':
      return `${who} is finding the travel hard${kids ? ', and doing most of it alone' : ''}.`
    case 'stretched':
      return `${who} would like to see more of you.`
    case 'ok':
      return `Things at home are fine.`
    default:
      return `${who} is happy, and says so.`
  }
}

/** What a player gives up to keep a family, in starts. */
export const ULTIMATUM_STARTS = 14

export function familyLabel(family) {
  if (!family) return 'Single'
  const bits = [FAMILY_STATUS[family.status] || 'Single']
  if (family.kids.length) bits.push(`${family.kids.length} ${family.kids.length === 1 ? 'child' : 'children'}`)
  return bits.join(' · ')
}

/**
 * One offseason of home life, as a list of things that happened.
 *
 * A state machine rather than a random table: you meet somebody before you
 * marry them, you separate before you divorce, and nothing happens to a family
 * you do not have. Returns events for the caller to apply and narrate, so all
 * the mutation of player and finances stays in one place in the engine.
 */
export function familyYear(family, rng, ctx) {
  const out = []
  const { age, starts, longHaul, restedWinter, lifestyleId, morale, broke, marketability } = ctx

  // Somebody new. More likely young, and much less likely while the last one
  // is still raw.
  if (family.status === 'single' || family.status === 'divorced') {
    const settled = family.status === 'divorced' ? 0.09 : 0.16
    const chance = settled * (age < 24 ? 0.5 : age > 40 ? 0.55 : 1) * (1 + (marketability || 0) * 0.3)
    if (rng.chance(chance)) out.push({ id: 'met', name: rng.pick(PARTNER_NAMES) })
    return out
  }

  if (family.status === 'separated') {
    // It goes one way or the other, and rarely stays where it is.
    if (rng.chance(0.3)) out.push({ id: 'reconciled' })
    else if (rng.chance(0.45)) out.push({ id: 'divorced' })
    return out
  }

  const d = strainDelta(family, {
    starts,
    longHaul,
    restedWinter,
    lifestyleId,
    kids: family.kids.length,
    morale,
    broke,
  })
  out.push({ id: 'strain', by: d })
  const after = clamp(family.strain + d, 0, 1)

  /**
   * Exactly one thing happens to a relationship in a year, which has to be
   * enforced rather than assumed. Written as independent `if`s these overlap:
   * a partnership between 0.45 and 0.5 strain could marry *and* part in the
   * same offseason, and any partnership over 0.85 could part — nulling the
   * partner — and then be handed an ultimatum from them, which read a name
   * off null and took the whole game down.
   */
  if (family.status === 'partner') {
    // Strain is the main reason a partnership ends, but not the only one —
    // a flat chance on top covers everything the model does not name, and is
    // what stops literally every career in the game getting married.
    if ((after > 0.5 && rng.chance(0.2)) || rng.chance(0.06)) out.push({ id: 'parted' })
    else if (after < 0.5 && rng.chance(0.18)) out.push({ id: 'married' })
    return out
  }

  // Married, from here down.
  if (after >= ULTIMATUM_AT && !family.ultimatum && !family.hadUltimatum) {
    // Only once. A marriage does not survive being asked twice.
    out.push({ id: 'ultimatum' })
    return out
  }
  if (after >= 0.95 && rng.chance(0.45)) {
    out.push({ id: 'separated' })
    return out
  }
  // Children arrive into a home that is holding together, mostly.
  const wantsKids = family.kids.length < 3 && age >= 24 && age < 45
  if (wantsKids && after < 0.62 && rng.chance(0.2)) {
    out.push({ id: 'child', name: rng.pick(CHILD_NAMES) })
  }
  return out
}

const PARTNER_NAMES = [
  'Erin', 'Marta', 'Yuki', 'Nadia', 'Solveig', 'Priya', 'Rosa', 'Fiona', 'Anneke', 'Camille',
  'Devon', 'Sam', 'Alex', 'Jordan', 'Noa', 'Rowan', 'Theo', 'Mateo', 'Idris', 'Casey',
]

const CHILD_NAMES = [
  'Bryn', 'Isla', 'Rafa', 'Nell', 'Otis', 'Maya', 'Frankie', 'Juno', 'Wren', 'Arlo',
  'Sasha', 'Remy', 'Indie', 'Cato', 'Marlowe', 'Pip', 'Sunny', 'Kit',
]

/**
 * How much the state of a home life pushes somebody towards stopping.
 *
 * Weighted to matter without deciding on its own: a happy family is a mild
 * reason to keep going, a breaking one is a large reason to stop, and an
 * ultimatum on the table outweighs anything else in the calculation because
 * that is what an ultimatum is.
 */
export function familyPressure(family) {
  if (!family) return null
  if (family.ultimatum) {
    return { weight: 55, label: 'Home', detail: `${family.partner.name} has asked you to choose` }
  }
  if (family.status === 'separated') return { weight: 16, label: 'Home', detail: 'Separated, and it is not going well' }
  if (!hasPartner(family)) return null
  const band = strainBand(family.strain)
  if (band.id === 'breaking') return { weight: 30, label: 'Home', detail: strainLine(family) }
  if (band.id === 'strained') return { weight: 18, label: 'Home', detail: strainLine(family) }
  if (band.id === 'happy' && family.kids.length) {
    return { weight: -8, label: 'Home', detail: 'A good reason to keep earning' }
  }
  return null
}
