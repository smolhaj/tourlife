import { clamp } from './rng.js'
import { eraStrength } from './era.js'

/**
 * Performance statistics.
 *
 * Golf is the most statistically drenched sport there is — scoring average is
 * the single most-quoted number about any player, and every tour publishes
 * driving distance, fairways hit, greens in regulation and putts per round for
 * everybody in it. The sim generated all the raw material for the first of
 * those and threw it away, and had no notion at all of the rest.
 *
 * Two different kinds of number live here, and the difference matters:
 *
 *   - Scoring average is *measured*. Every round the player plays is counted,
 *     strokes and all, so it moves with form, weather, injuries, the courses
 *     they chose and how they actually played. It is the real one.
 *
 *   - The rest are *derived* from ratings, because the sim does not model
 *     individual shots and inventing fake shot data to aggregate back into the
 *     same ratings would be a lie with extra steps. They are honest readouts of
 *     the same attributes in the units the sport quotes them in — which is
 *     genuinely what a tour statistic mostly is.
 */

/** Par for a course of this setup. Matches the tournament sim exactly. */
export function parFor(event) {
  return event.difficulty > 1.25 ? 70 : 71
}

/**
 * Driving distance in yards. Anchored so a tour average power rating lands on
 * a tour average drive, and the extremes reach the extremes: the longest
 * hitters carry it past 320, the shortest are down around 270 and getting by
 * on everything else.
 *
 * Drifts with the era, because that is what the arms race was.
 */
export function drivingDistance(ratings, yearsElapsed = 0) {
  const base = 272 + ((ratings.power || 50) - 50) * 0.95
  return Math.round(base + eraStrength(yearsElapsed) * 26)
}

/** Percentage of fairways found. */
export function drivingAccuracy(ratings) {
  return Math.round(clamp(46 + ((ratings.accuracy || 50) - 50) * 0.42, 34, 78) * 10) / 10
}

/** Greens in regulation. Mostly irons, with a little help from length. */
export function greensInRegulation(ratings) {
  const v = 62 + ((ratings.irons || 50) - 50) * 0.34 + ((ratings.power || 50) - 50) * 0.06
  return Math.round(clamp(v, 48, 78) * 10) / 10
}

/** Putts per round. Lower is better, so the rating runs the other way. */
export function puttsPerRound(ratings) {
  const v = 29.4 - ((ratings.putting || 50) - 50) * 0.026
  return Math.round(clamp(v, 27.2, 31.6) * 10) / 10
}

/** Up and down from off the green, as a percentage. */
export function scrambling(ratings) {
  const v = 58 + ((ratings.shortGame || 50) - 50) * 0.32
  return Math.round(clamp(v, 40, 76) * 10) / 10
}

/** Rounds under par, as a share — a rough proxy for how often you are going low. */
export function birdieRate(ratings) {
  const v = 3.4 + ((ratings.putting || 50) - 50) * 0.014 + ((ratings.irons || 50) - 50) * 0.016
  return Math.round(clamp(v, 2.1, 5.2) * 100) / 100
}

/**
 * The statistics a tour publishes, for one player. `lower` marks the ones
 * where a smaller number is better, so ranking code does not have to know.
 */
export const STAT_DEFS = [
  { key: 'scoring', name: 'Scoring average', lower: true, decimals: 2, measured: true },
  { key: 'distance', name: 'Driving distance', unit: ' yds', decimals: 0, fn: drivingDistance, era: true },
  { key: 'accuracy', name: 'Driving accuracy', unit: '%', decimals: 1, fn: drivingAccuracy },
  { key: 'gir', name: 'Greens in regulation', unit: '%', decimals: 1, fn: greensInRegulation },
  { key: 'putts', name: 'Putts per round', lower: true, decimals: 1, fn: puttsPerRound },
  { key: 'scrambling', name: 'Scrambling', unit: '%', decimals: 1, fn: scrambling },
  { key: 'birdies', name: 'Birdies per round', decimals: 2, fn: birdieRate },
]

/** Every derived statistic for one set of ratings. */
export function statLine(ratings, yearsElapsed = 0) {
  const out = {}
  for (const d of STAT_DEFS) {
    if (!d.fn) continue
    out[d.key] = d.era ? d.fn(ratings, yearsElapsed) : d.fn(ratings)
  }
  return out
}

/** Scoring average from strokes actually played. Null before a round is played. */
export function scoringAverage(totals) {
  if (!totals || !totals.rounds) return null
  return Math.round((totals.strokes / totals.rounds) * 100) / 100
}

/**
 * Where the player sits on tour in each statistic, out of everyone who could
 * plausibly be on the same list. Scoring average is ranked on the same derived
 * basis as the rest, because AI players do not carry a measured one — the
 * player's own figure is the measured one and is shown beside it.
 */
export function statRanks(playerRatings, worldPlayers, yearsElapsed = 0) {
  const field = worldPlayers.filter((p) => !p.retired && !p.isUser)
  const mine = statLine(playerRatings, yearsElapsed)
  const ranks = {}
  for (const d of STAT_DEFS) {
    if (!d.fn) continue
    let better = 1
    for (const p of field) {
      const v = d.era ? d.fn(p.ratings, yearsElapsed) : d.fn(p.ratings)
      if (d.lower ? v < mine[d.key] : v > mine[d.key]) better += 1
    }
    ranks[d.key] = { value: mine[d.key], rank: better, of: field.length + 1 }
  }
  return ranks
}

/** Tour averages for the same statistics, for context beside the player's. */
export function tourStatAverages(worldPlayers, yearsElapsed = 0) {
  const field = worldPlayers.filter((p) => !p.retired && !p.isUser)
  if (!field.length) return {}
  const out = {}
  for (const d of STAT_DEFS) {
    if (!d.fn) continue
    let sum = 0
    for (const p of field) sum += d.era ? d.fn(p.ratings, yearsElapsed) : d.fn(p.ratings)
    out[d.key] = Math.round((sum / field.length) * 100) / 100
  }
  return out
}

export function formatStat(def, value) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(def.decimals)}${def.unit || ''}`
}
