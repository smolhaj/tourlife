import { clamp } from './rng.js'
import { PLAYING_WEEKS } from './constants.js'

/**
 * Weather.
 *
 * Golf is the only major sport played in whatever the sky is doing that week,
 * and it is the largest single thing the sim was missing: every tournament was
 * played in identical, permanently benign conditions, so the winning score at a
 * given course was the same every year and accuracy was worth exactly what it
 * was worth on a still morning.
 *
 * Three things move when the weather does:
 *   - the field's scoring average (wind mostly, rain a little)
 *   - the spread of scores (wind blows the field apart)
 *   - who the course suits (wind pays the straight and the steady, and stops
 *     paying the long and the hot putter)
 *
 * Everything here is expressed as a deviation from a normal week, so a normal
 * week is exactly the tournament the sim produced before weather existed and
 * the existing scoring calibration still holds.
 */

/** The conditions the rest of the sim is calibrated against. */
export const NORMAL_WIND = 0.35
export const NORMAL_RAIN = 0.2

/**
 * Typical wind and rain by course archetype. Links are on a coast because that
 * is what links means; desert courses are in deserts. The means across the
 * eight archetypes are NORMAL_WIND and NORMAL_RAIN, so no archetype is
 * systematically harder than the calibration assumes.
 */
const CLIMATE = {
  links: { wind: 0.56, rain: 0.28 },
  mountain: { wind: 0.42, rain: 0.2 },
  desert: { wind: 0.36, rain: 0.06 },
  brutal: { wind: 0.34, rain: 0.22 },
  bomber: { wind: 0.32, rain: 0.22 },
  classic: { wind: 0.3, rain: 0.24 },
  precision: { wind: 0.27, rain: 0.24 },
  resort: { wind: 0.23, rain: 0.14 },
}

export const NEUTRAL = { wind: NORMAL_WIND, rain: NORMAL_RAIN }

/**
 * Where in the year a week falls, -1 at the two ends of the calendar and +1 at
 * the height of summer. Weather was previously identical in week five and week
 * thirty, which made the season a flat run of interchangeable weeks — but the
 * shape of a golf calendar is precisely that it starts cold and wet, dries out
 * and firms up through the middle, and blows itself out in the autumn.
 *
 * A full cosine period, so the average across a season is exactly zero and the
 * scoring calibration that NORMAL_WIND and NORMAL_RAIN rest on is untouched.
 * Northern-hemisphere, like the bulk of the schedule.
 */
export function seasonPhase(week) {
  if (!week) return 0
  const t = (week - 1) / Math.max(1, PLAYING_WEEKS - 1)
  return Math.cos((t - 0.55) * 2 * Math.PI)
}

const SUMMER_WIND = 0.07
const SUMMER_RAIN = 0.1

/**
 * Roll a week's weather: a base for the tournament, then a day for each round.
 * Days vary around the week, which is what lets a Saturday gale rearrange a
 * leaderboard that Thursday's calm had settled.
 */
export function rollConditions(rng, courseType, week = null) {
  const c = CLIMATE[courseType] || { wind: NORMAL_WIND, rain: NORMAL_RAIN }
  const summer = seasonPhase(week)
  const wBase = clamp(rng.gauss(c.wind - summer * SUMMER_WIND, 0.15), 0.02, 1)
  const rBase = clamp(rng.gauss(c.rain - summer * SUMMER_RAIN, 0.16), 0, 1)
  const rounds = []
  for (let i = 0; i < 4; i++) {
    rounds.push({
      wind: clamp(rng.gauss(wBase, 0.12), 0, 1),
      rain: clamp(rng.gauss(rBase, 0.14), 0, 1),
    })
  }
  // The week is reported as what actually happened, not what was forecast.
  let wind = 0
  let rain = 0
  for (const r of rounds) {
    wind += r.wind
    rain += r.rain
  }
  return { wind: wind / 4, rain: rain / 4, rounds }
}

/** Strokes this adds to the field's average for ONE round, versus a normal day. */
export function conditionStrokes(c) {
  return (c.wind - NORMAL_WIND) * 3.4 + (c.rain - NORMAL_RAIN) * 0.8
}

/** How much wider the field's scores spread, versus a normal day. */
export function conditionSigmaMult(c) {
  return clamp(1 + (c.wind - NORMAL_WIND) * 0.34 + (c.rain - NORMAL_RAIN) * 0.1, 0.8, 1.45)
}

/**
 * Per-unit-of-wind quality shift for a player, in rating points.
 *
 * The coefficients sum to zero on purpose: wind changes *who* is good, not how
 * good the field is. Without that, a windy week would quietly become a stronger
 * or weaker field than a calm one and the ranking-points multiplier would drift
 * with the forecast.
 */
export function windEdgeOf(r) {
  const d = (k) => (r[k] || 50) - 50
  return (
    d('accuracy') * 0.09 +
    d('consistency') * 0.08 +
    d('shortGame') * 0.055 +
    d('irons') * 0.02 -
    d('power') * 0.135 -
    d('putting') * 0.11
  )
}

/**
 * Per-unit-of-rain quality shift. Soft and long: the course plays its full
 * length and stops running, which pays the long hitter and takes the greens
 * away from the putter. Also sums to zero.
 */
export function rainEdgeOf(r) {
  const d = (k) => (r[k] || 50) - 50
  return (
    d('power') * 0.06 +
    d('consistency') * 0.045 +
    d('irons') * 0.02 -
    d('shortGame') * 0.05 -
    d('accuracy') * 0.03 -
    d('putting') * 0.045
  )
}

/** Short human description of a week's conditions. */
export function conditionsLabel(c) {
  if (!c) return 'Fair'
  const w = c.wind
  const r = c.rain
  const wet = r > 0.62 ? 'heavy rain' : r > 0.42 ? 'rain' : r > 0.28 ? 'showers' : null
  const blow = w > 0.78 ? 'gale-force wind' : w > 0.6 ? 'strong wind' : w > 0.45 ? 'breezy' : w < 0.14 ? 'dead calm' : null
  if (blow && wet) return cap(`${blow} and ${wet}`)
  if (blow) return cap(blow)
  if (wet) return cap(wet)
  if (w < 0.24 && r < 0.12) return 'Calm and dry'
  return 'Fair'
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
