/**
 * The distance arms race.
 *
 * Equipment technology already crept up about a point and a half a year
 * forever, but nothing else in the world moved with it: courses never got
 * longer, par never got harder to defend, and driving distance was worth
 * exactly the same in a player's thirtieth season as in their first. The last
 * thirty years of professional golf are largely the story of that not being
 * true — courses lengthened four or five hundred yards to hold their scoring
 * average, which squeezed the short hitter out of the game and made carry the
 * most valuable thing a player owned.
 *
 * Modelled the same way weather is: as a shift in *who* the game suits rather
 * than in how hard it is. Courses lengthen precisely so that scoring stays
 * where it was, so the scoring calibration must not move — only the ranking of
 * the players inside it.
 *
 * Sized carefully, and twice. At double this rate it cost a median career a
 * fifth of its earnings, because power is the attribute that declines earliest
 * and fastest — an ageing player loses distance exactly as the game learns to
 * pay for it, against a field continually refreshed with young men who have
 * it. That is a real effect and the arms race genuinely pushed the sport
 * towards youth, but the age curves already carry most of it and a fifth of a
 * career is too much to charge twice.
 *
 * Confining it to championship venues, which is where the lengthening actually
 * happened, turned out to be worse rather than better: those are the events
 * that gate access to the majors, so concentrating it there stopped mid-tier
 * players reaching a major at all. It applies everywhere, at half strength.
 */

/** How much longer courses get per season, in yards, before any rollback. */
const YARDS_PER_YEAR = 19

/** Seasons of creep before the governing bodies finally act. */
export const ROLLBACK_YEAR = 22

/** How much of the accumulated advantage a ball rollback takes back. */
const ROLLBACK_KEEP = 0.4

/** Creep is slower afterwards — the authorities are watching now. */
const RATE_BEFORE = 0.022
const RATE_AFTER = 0.01

/**
 * How far into the arms race a season is, 0 at the start of a career. Not
 * capped at 1; it is a multiplier on a small per-rating-point effect.
 */
export function eraStrength(yearsElapsed) {
  const y = Math.max(0, yearsElapsed || 0)
  if (y < ROLLBACK_YEAR) return y * RATE_BEFORE
  return ROLLBACK_YEAR * RATE_BEFORE * ROLLBACK_KEEP + (y - ROLLBACK_YEAR) * RATE_AFTER
}

/** Did the rollback land this season? */
export function isRollbackYear(yearsElapsed) {
  return yearsElapsed === ROLLBACK_YEAR
}

/** Yards added to a championship setup since a career began, for flavour. */
export function yardsAdded(yearsElapsed) {
  const y = Math.max(0, yearsElapsed || 0)
  if (y < ROLLBACK_YEAR) return Math.round(y * YARDS_PER_YEAR)
  return Math.round(ROLLBACK_YEAR * YARDS_PER_YEAR + (y - ROLLBACK_YEAR) * YARDS_PER_YEAR * 0.35)
}

/**
 * Per-unit-of-era quality shift for a player, in rating points.
 *
 * Coefficients sum to zero, like the weather ones, so a longer golf course
 * reshuffles the order without making the field stronger or weaker than it is
 * — otherwise ranking points would inflate decade on decade.
 */
export function eraEdgeOf(r) {
  const d = (k) => (r[k] || 50) - 50
  return d('power') * 0.09 - d('accuracy') * 0.05 - d('shortGame') * 0.025 - d('consistency') * 0.015
}

export function eraLabel(yearsElapsed) {
  const y = Math.max(0, yearsElapsed || 0)
  if (y < 4) return 'The game as you found it'
  if (y < ROLLBACK_YEAR) return `Courses ${yardsAdded(y)} yards longer than when you turned pro`
  if (y === ROLLBACK_YEAR) return 'The ball has been rolled back'
  return `Post-rollback — courses ${yardsAdded(y)} yards longer than when you started`
}
