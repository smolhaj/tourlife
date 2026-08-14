import { ATTR_KEYS, OVERALL_WEIGHTS, COURSE_TYPES } from './constants.js'
import { clamp } from './rng.js'

/**
 * Per-attribute development curves.
 *  grow          – how fast the attribute climbs when young and below potential
 *  peak          – last age at which growth is still possible
 *  declineStart  – age at which age-related loss begins
 *  declineRate   – points lost in the first declining year (accelerates after)
 */
export const CURVES = {
  power: { grow: 3.8, peak: 26, declineStart: 29, declineRate: 1.15 },
  accuracy: { grow: 3.1, peak: 30, declineStart: 35, declineRate: 0.7 },
  irons: { grow: 3.3, peak: 30, declineStart: 34, declineRate: 0.8 },
  shortGame: { grow: 3.0, peak: 32, declineStart: 37, declineRate: 0.6 },
  putting: { grow: 2.9, peak: 31, declineStart: 36, declineRate: 0.75 },
  consistency: { grow: 2.4, peak: 34, declineStart: 41, declineRate: 0.5 },
  mental: { grow: 2.2, peak: 38, declineStart: 46, declineRate: 0.3 },
}

export function overall(ratings) {
  let sum = 0
  for (const k of ATTR_KEYS) sum += (ratings[k] || 0) * OVERALL_WEIGHTS[k]
  return sum
}

export function potentialOverall(potential) {
  return overall(potential)
}

/** How good this player is at this specific course archetype (0..100-ish). */
export function courseSkill(ratings, courseType) {
  const w = COURSE_TYPES[courseType]?.w || COURSE_TYPES.classic.w
  let sum = 0
  for (const k of Object.keys(w)) sum += (ratings[k] || 0) * w[k]
  // Mental is never in the course weights; it is a flat small contributor.
  return sum + (ratings.mental - 50) * 0.05
}

/**
 * How much better (or worse) this course archetype is for you than the
 * average course on tour. Comparing against the mean of every archetype is
 * what makes the number meaningful — comparing against a flat average of your
 * ratings just measures how unusual the weighting is.
 */
export function courseFit(ratings, courseType) {
  const keys = Object.keys(COURSE_TYPES)
  let total = 0
  for (const k of keys) total += courseSkill(ratings, k)
  return courseSkill(ratings, courseType) - total / keys.length
}

export function emptyRatings(value = 0) {
  const r = {}
  for (const k of ATTR_KEYS) r[k] = value
  return r
}

/**
 * Generate a starting rating/potential pair.
 * `talent` 0..1 shifts the whole distribution — 1.0 is a generational prospect.
 */
export function makeRatings(rng, age, talent) {
  const ratings = {}
  const potential = {}
  const centre = 26 + talent * 44 // 26..70 current at age ~20
  const potCentre = 46 + talent * 46
  for (const k of ATTR_KEYS) {
    const spread = k === 'mental' || k === 'consistency' ? 9 : 12
    let cur = rng.gaussClamped(centre, spread)
    let pot = rng.gaussClamped(potCentre, 5)
    // Older starters have already converted some potential into ability.
    const matured = clamp((age - 20) / 10, 0, 1)
    cur = cur + (pot - cur) * matured * 0.55
    ratings[k] = clamp(Math.round(cur), 5, 92)
    potential[k] = clamp(Math.round(Math.max(pot, ratings[k] + rng.int(0, 6))), 20, 99)
  }
  return { ratings, potential }
}

/**
 * One year of development. Mutates nothing; returns the new ratings plus a
 * per-attribute delta map for the UI.
 *
 * mods:
 *   trainingAttr  – attribute focused in the offseason ('all' spreads it)
 *   trainingPower – 0..~1.8 strength of that focus
 *   coach         – 0..1 coach quality
 *   physio        – 0..1 physio quality
 *   psych         – 0..1 psychologist quality
 *   wear          – accumulated career mileage penalty (0..1+)
 *   injuryDrag    – extra loss from a bad injury year
 */
export function progressYear(ratings, potential, age, rng, mods = {}) {
  const {
    trainingAttr = null,
    trainingPower = 0,
    coach = 0,
    physio = 0,
    psych = 0,
    wear = 0,
    injuryDrag = 0,
    luck = 0,
  } = mods

  const next = {}
  const deltas = {}
  for (const k of ATTR_KEYS) {
    const c = CURVES[k]
    const cur = ratings[k]
    const pot = potential[k]
    let delta = 0

    if (age <= c.peak) {
      const room = clamp((pot - cur) / 16, -0.4, 1.6)
      const youth = clamp((c.peak - age + 3) / (c.peak - 14), 0.08, 1)
      delta += c.grow * Math.pow(youth, 0.75) * room
    }

    if (age > c.declineStart) {
      const years = age - c.declineStart
      const physical = k === 'power' ? 1.25 : k === 'accuracy' || k === 'irons' ? 1.0 : 0.8
      // Physios push the decline back; mental work barely cares about the body.
      const shield = k === 'mental' || k === 'consistency' ? 0.35 : 1
      delta -= c.declineRate * (1 + Math.min(years, 12) * 0.08) * physical * (1 - physio * 0.42 * shield)
    }

    // Coaching keeps you improving where nature would not — but only while
    // there is still headroom for your age. Nobody gets better at 42.
    if (age <= c.peak + 3) delta += coach * 0.85 * clamp((pot + 4 - cur) / 22, 0, 1.1)
    if (k === 'mental') delta += psych * 1.1 * clamp((pot + 8 - cur) / 20, 0, 1.2)
    if (k === 'consistency') delta += psych * 0.4

    // Work still pays after your peak, just not as much.
    const trainScale = age <= c.peak + 4 ? 1 : clamp(1 - (age - c.peak - 4) * 0.08, 0.3, 1)
    if (trainingAttr === k) delta += trainingPower * trainScale
    else if (trainingAttr === 'all') delta += trainingPower * 0.34 * trainScale

    delta -= wear * (k === 'power' ? 1.2 : 0.7)
    delta -= injuryDrag * (k === 'power' || k === 'irons' ? 1.1 : 0.75)
    delta += luck
    delta += rng.gauss(0, 0.85)

    const val = clamp(Math.round(cur + delta), 5, 99)
    deltas[k] = val - cur
    next[k] = val
  }

  // A rare late technical breakthrough — the "he found something at 34" arc.
  return { ratings: next, deltas }
}

/** Chance a player's ceiling quietly moves. Called once per offseason. */
export function jigglePotential(potential, ratings, age, rng) {
  const out = { ...potential }
  for (const k of ATTR_KEYS) {
    let p = out[k]
    if (age < 26 && rng.chance(0.1)) p += rng.int(1, 5)
    if (age < 24 && rng.chance(0.05)) p -= rng.int(1, 4)
    // Potential can never sit below what you have already achieved.
    out[k] = clamp(Math.max(p, ratings[k]), 20, 99)
  }
  return out
}

export function ratingColor(v) {
  if (v >= 85) return 'r-elite'
  if (v >= 72) return 'r-great'
  if (v >= 60) return 'r-good'
  if (v >= 45) return 'r-ok'
  return 'r-poor'
}

export function overallLabel(ovr) {
  if (ovr >= 84) return 'Generational'
  if (ovr >= 77) return 'Superstar'
  if (ovr >= 70) return 'Elite'
  if (ovr >= 63) return 'Very good'
  if (ovr >= 56) return 'Solid tour pro'
  if (ovr >= 48) return 'Fringe pro'
  if (ovr >= 38) return 'Developmental'
  return 'Amateur'
}
