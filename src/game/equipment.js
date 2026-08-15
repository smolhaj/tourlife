import { EQUIP_SLOTS, EQUIP_BRANDS, EQUIP_MAX_BONUS, OVERALL_WEIGHTS } from './constants.js'
import { clamp } from './rng.js'

const MODEL_WORDS = ['Pro', 'Tour', 'X', 'SL', 'Max', 'Ti', 'Forged', 'CB', 'Elite', 'One', 'Vector', 'Halo', 'Rogue', 'Prime']

/** Industry-wide technology level in a given season. Everything drifts up. */
export function techBaseline(yearsElapsed) {
  return 50 + yearsElapsed * 1.45
}

export function makeEquipItem(rng, slot, yearsElapsed, year, brandHint = null) {
  const baseline = techBaseline(yearsElapsed)
  const brand = brandHint || rng.pick(EQUIP_BRANDS)
  const tech = Math.round((baseline + rng.gauss(2.2, 3.4)) * 10) / 10
  const first = rng.pick(MODEL_WORDS)
  const second = rng.chance(0.5) ? rng.pick(MODEL_WORDS.filter((w) => w !== first)) : null
  const model = `${first}${second ? ' ' + second : ''} ${String(year).slice(2)}`
  const priceBase = { driver: 620, irons: 1900, wedges: 640, putter: 480, ball: 900 }[slot] || 700
  const price = Math.round((priceBase * (1 + Math.max(0, tech - baseline) * 0.09)) / 10) * 10
  return {
    id: `${slot}_${brand}_${model}`.replace(/\s+/g, '_'),
    slot,
    brand,
    model,
    year,
    tech,
    price,
  }
}

/** The new-release catalogue shown each offseason. */
export function generateEquipmentCatalog(rng, yearsElapsed, year) {
  const catalog = {}
  for (const slot of EQUIP_SLOTS) {
    catalog[slot.id] = Array.from({ length: 4 }, () => makeEquipItem(rng, slot.id, yearsElapsed, year))
    catalog[slot.id].sort((a, b) => b.tech - a.tech)
  }
  return catalog
}

export function starterBag(rng, yearsElapsed, year) {
  const bag = {}
  for (const slot of EQUIP_SLOTS) {
    const item = makeEquipItem(rng, slot.id, yearsElapsed - 3, year - 3)
    item.tech = Math.round((item.tech - 4) * 10) / 10
    // You have been hitting these for years. Nothing to bed in.
    item.addedAt = -99
    bag[slot.id] = item
  }
  return bag
}

/**
 * How many competitive starts it takes to trust a club.
 *
 * Nobody puts a new putter in the bag on Tuesday and holes everything on
 * Thursday. The feel clubs take longest — a putter and a set of irons are
 * judged on eighth-of-an-inch differences you only learn under pressure — and
 * a ball change moves every flight and spin number you have in your head. A
 * driver is the easiest thing in the bag to swap: tee it up and hit it.
 */
const SETTLE_STARTS = { putter: 7, irons: 6, ball: 5, wedges: 4, driver: 2 }

/**
 * What the adjustment costs while it is happening, in rating points at the
 * moment of the switch. Sized so that a marginal upgrade is not worth taking
 * mid-career, and a real one still is.
 */
const DISRUPTION = { putter: 1.1, irons: 1.0, ball: 0.8, wedges: 0.7, driver: 0.45 }

/** What an empty slot is worth, on the same scale as a club's tech edge. */
const EMPTY_SLOT_EDGE = -1.6 / 1.35

/**
 * Stamp an item as it goes into the bag: when it arrived, and what came out,
 * so the bonus can ramp from one to the other while it beds in.
 */
export function equipItem(item, slotId, prevBag, starts) {
  const prev = prevBag?.[slotId]
  return { ...item, addedAt: starts, prevTech: prev ? prev.tech : null }
}

/** What switching this slot costs you, in words, for the shop screen. */
export const SETTLE_LABEL = Object.fromEntries(
  Object.entries(SETTLE_STARTS).map(([slot, n]) => [slot, `${n} starts to bed in`]),
)

/**
 * 0 while the club is brand new, 1 once it is bedded in. `starts` is the
 * player's career start count, which is what the item's `addedAt` is stamped
 * with, so this measures tournaments played with it rather than weeks elapsed
 * — an offseason purchase is not bedded in by January.
 */
export function settledFraction(item, slotId, starts) {
  if (!item || item.addedAt === undefined || item.addedAt === null) return 1
  const need = SETTLE_STARTS[slotId] || 4
  return clamp((starts - item.addedAt) / need, 0, 1)
}

/** Competitive starts still needed before this club is trusted. */
export function startsToSettle(item, slotId, starts) {
  if (!item || item.addedAt === undefined || item.addedAt === null) return 0
  return Math.max(0, (SETTLE_STARTS[slotId] || 4) - (starts - item.addedAt))
}

/**
 * Rating bonus from the current bag, relative to what everybody else is
 * playing this season. Old gear is a real (small) handicap, and gear you only
 * just put in the bag is a temporary one.
 */
export function equipmentBonus(bag, yearsElapsed, starts = Infinity) {
  const baseline = techBaseline(yearsElapsed)
  const bonus = {}
  const techEdge = (tech) => clamp((tech - baseline) * 0.13, -1.6, 1.3)
  for (const slot of EQUIP_SLOTS) {
    const item = bag?.[slot.id]
    if (!item) {
      // Playing without proper gear for that slot is a meaningful loss.
      for (const [attr, w] of Object.entries(slot.attrs)) bonus[attr] = (bonus[attr] || 0) - 1.6 * w
      continue
    }
    const settled = settledFraction(item, slot.id, starts)
    // On the first tee with a new club you still play roughly the golf the old
    // one gave you — minus what the adjustment is costing. The technology
    // arrives as you learn it, and the cost fades out at the same rate.
    //
    // Ramping from the club that came out, rather than from nothing, is what
    // makes this behave: replacing a five-year-old putter with a new one is a
    // small setback, and it has to be, or "upgrade from junk" would read as an
    // instant improvement while "upgrade from good" read as a loss.
    const to = techEdge(item.tech)
    const from = item.prevTech === undefined || item.prevTech === null ? EMPTY_SLOT_EDGE : techEdge(item.prevTech)
    const edge = from + (to - from) * settled - (DISRUPTION[slot.id] || 0.8) * (1 - settled)
    for (const [attr, w] of Object.entries(slot.attrs)) bonus[attr] = (bonus[attr] || 0) + edge * w * 1.35
  }
  // Keep the whole bag inside a sane band — measured as the net effect on
  // overall, not as the sum of the absolute swings.
  //
  // Summing absolute values meant the cap bound on gear that was merely a few
  // years old, because a bag that is uniformly slightly behind still moves six
  // attributes. Everything past that point was flattened to the same number,
  // which is why turning up with no clubs at all used to score the same as
  // turning up with a five-year-old set.
  let net = 0
  for (const [k, v] of Object.entries(bonus)) net += v * (OVERALL_WEIGHTS[k] || 0)
  if (Math.abs(net) > EQUIP_MAX_BONUS) {
    const scale = EQUIP_MAX_BONUS / Math.abs(net)
    for (const k of Object.keys(bonus)) bonus[k] *= scale
  }
  return bonus
}

export function bagTech(bag) {
  const items = EQUIP_SLOTS.map((s) => bag?.[s.id]).filter(Boolean)
  if (!items.length) return 0
  return items.reduce((a, b) => a + b.tech, 0) / items.length
}

export function bagAge(bag, year) {
  const items = EQUIP_SLOTS.map((s) => bag?.[s.id]).filter(Boolean)
  if (!items.length) return 0
  return year - items.reduce((a, b) => a + b.year, 0) / items.length
}

/**
 * Free gear from an equipment sponsor, at that brand's tech level.
 *
 * `startedAt` stamps the whole bag as new, which is the point: signing a gear
 * deal replaces fourteen clubs at once, and the year after a big equipment
 * switch is a well-known place for a career to wobble.
 */
export function sponsorGear(rng, brand, quality, yearsElapsed, year, startedAt = 0, prevBag = null) {
  const bag = {}
  for (const slot of EQUIP_SLOTS) {
    const item = makeEquipItem(rng, slot.id, yearsElapsed, year, brand)
    item.tech = Math.round((techBaseline(yearsElapsed) + (quality - 0.5) * 7 + rng.gauss(0, 1.2)) * 10) / 10
    item.price = 0
    item.sponsored = true
    bag[slot.id] = equipItem(item, slot.id, prevBag, startedAt)
  }
  return bag
}

/** Everything in the bag that is still being learned. */
export function beddingIn(bag, starts) {
  const out = []
  for (const slot of EQUIP_SLOTS) {
    const left = startsToSettle(bag?.[slot.id], slot.id, starts)
    if (left > 0) out.push({ slot: slot.id, name: slot.name, startsLeft: left })
  }
  return out
}
