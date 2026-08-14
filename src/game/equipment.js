import { EQUIP_SLOTS, EQUIP_BRANDS, EQUIP_MAX_BONUS } from './constants.js'
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
    bag[slot.id] = item
  }
  return bag
}

/**
 * Rating bonus from the current bag, relative to what everybody else is
 * playing this season. Old gear is a real (small) handicap.
 */
export function equipmentBonus(bag, yearsElapsed) {
  const baseline = techBaseline(yearsElapsed)
  const bonus = {}
  for (const slot of EQUIP_SLOTS) {
    const item = bag?.[slot.id]
    if (!item) {
      // Playing without proper gear for that slot is a meaningful loss.
      for (const [attr, w] of Object.entries(slot.attrs)) bonus[attr] = (bonus[attr] || 0) - 1.6 * w
      continue
    }
    const edge = clamp((item.tech - baseline) * 0.13, -1.6, 1.3)
    for (const [attr, w] of Object.entries(slot.attrs)) bonus[attr] = (bonus[attr] || 0) + edge * w * 1.35
  }
  // Keep the whole bag inside a sane band.
  let total = 0
  for (const v of Object.values(bonus)) total += Math.abs(v)
  if (total > EQUIP_MAX_BONUS * 1.6) {
    const scale = (EQUIP_MAX_BONUS * 1.6) / total
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

/** Free gear from an equipment sponsor, at that brand's tech level. */
export function sponsorGear(rng, brand, quality, yearsElapsed, year) {
  const bag = {}
  for (const slot of EQUIP_SLOTS) {
    const item = makeEquipItem(rng, slot.id, yearsElapsed, year, brand)
    item.tech = Math.round((techBaseline(yearsElapsed) + (quality - 0.5) * 7 + rng.gauss(0, 1.2)) * 10) / 10
    item.price = 0
    item.sponsored = true
    bag[slot.id] = item
  }
  return bag
}
