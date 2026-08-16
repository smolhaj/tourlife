import { clamp } from './rng.js'

/**
 * Course knowledge.
 *
 * Tour players talk about "horses for courses" more than they talk about
 * almost anything else, and it is not superstition: knowing which side of the
 * fairway to miss on, where the pins go on Sunday, and how a green releases is
 * worth real strokes. Somebody teeing it up at a place for the first time is
 * guessing at all three.
 *
 * The scale is deliberately small — half a shot a week, not two — and it is
 * measured against a tour-typical amount of familiarity rather than against
 * zero, so the mechanic existing does not hand the player a free edge over a
 * field that is not tracked. A rookie somewhere new is below the baseline; a
 * veteran on their eighth visit is above it.
 */

/** Visits after which you know a place as well as you are going to. */
const KNOWN_AT = 8

/** How far either side of a tour regular's knowledge you can get, in rating points. */
const BASELINE = 1.5

/**
 * How quickly it is learned. Most of what a practice round and a competitive
 * week teach you, you learn the first two times; the rest is pin positions in a
 * wind you have not seen yet. A straight line would also have made the average
 * player on tour permanently below the baseline, because the long tail of
 * courses anybody plays is full of places they went once.
 */
const LEARN_RATE = 2.2

/** Extra for a place that owes you something, capped so it cannot stack. */
const PER_WIN = 0.5
const MAX_WIN_BONUS = 1.5

/**
 * Rating-point adjustment for playing this venue with this much history.
 * Ranges from -1.5 (never seen it) to +3.0 (know it, and have won on it).
 */
export function venueEdge(starts = 0, wins = 0) {
  const learned = 1 - Math.exp(-Math.max(0, starts) / LEARN_RATE)
  const ceiling = 1 - Math.exp(-KNOWN_AT / LEARN_RATE)
  const known = clamp((learned / ceiling) * (BASELINE * 2) - BASELINE, -BASELINE, BASELINE)
  return known + Math.min(MAX_WIN_BONUS, (wins || 0) * PER_WIN)
}

/** Player-facing description of how well they know a course. */
export function familiarityLabel(starts = 0, wins = 0) {
  if (wins > 0) return starts >= KNOWN_AT ? 'Owns this place' : 'Won here'
  if (starts === 0) return 'Never played here'
  if (starts === 1) return 'Played here once'
  if (starts >= KNOWN_AT) return 'Knows every blade'
  return `Played here ${starts}×`
}

export function venueStartsOf(career, venue) {
  return (career?.venueStarts && career.venueStarts[venue]) || 0
}

export function venueWinsOf(career, venue) {
  return (career?.venueWins && career.venueWins[venue]) || 0
}

export function venueEdgeFor(career, venue) {
  return venueEdge(venueStartsOf(career, venue), venueWinsOf(career, venue))
}

/** Visits' worth of knowledge a week of proper preparation is worth. */
export const PREP_VISITS = 2

/**
 * What arriving on Monday and actually walking the place buys you.
 *
 * Expressed as extra visits rather than a flat bonus, which makes it self-
 * limiting in the right way: a course you have never seen is transformed by
 * three days of practice rounds, and one you have played eight times has
 * nothing left to teach you. Course knowledge was otherwise entirely passive —
 * it accrued or it did not, and there was nothing to do about it.
 */
export function prepEdgeFor(career, venue) {
  const starts = venueStartsOf(career, venue)
  const wins = venueWinsOf(career, venue)
  return venueEdge(starts + PREP_VISITS, wins) - venueEdge(starts, wins)
}
