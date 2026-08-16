import { PLAYING_WEEKS } from './constants.js'

/**
 * The season race.
 *
 * Keeping a card ran entirely off invisible money thresholds resolved in the
 * offseason, so there was nothing to watch all year: no table you were
 * climbing, no week where a top-fifteen would save your season, and no reason
 * for week forty-two to matter when you were a hundred and eighteenth. That
 * standings table is the most-followed structure in professional golf and the
 * whole reason the back half of a season is worth playing.
 *
 * It runs off the ranking points every event already awards, which are already
 * weighted by circuit prestige and field strength — so a race position means
 * "how good a season have you had", across every tour you played.
 */

/** The season finale falls on the last week of the year. */
export const FINALE_WEEK = PLAYING_WEEKS
export const FINALE_ID = 'race_finale'

/** How many make it to the finale. */
export const FINALE_FIELD = 40

/**
 * How many are paid out of the bonus pool. Everybody who reached the finale
 * gets something — a season good enough to be there is a season worth paying
 * for, and paying only ten of forty meant a player could make the field eight
 * times and bank nothing for it.
 */
export const BONUS_PLACES = FINALE_FIELD

/**
 * The pool, in today's money before inflation. Real season-race bonus pools
 * are enormous — comparable to several majors — because they are funded by the
 * whole season's sponsorship rather than one week's.
 */
export const BONUS_POOL = 40_000_000

/** Steeply top-heavy, normalised so the pool is paid out exactly. */
const BONUS_SHARE = (() => {
  const raw = Array.from({ length: BONUS_PLACES }, (_, i) => 1 / Math.pow(i + 1.35, 1.35))
  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map((v) => v / total)
})()

/**
 * This season's standings, best first. Everyone who has earned a point is in
 * it, so a player's position is real rather than a slice of a leaderboard.
 */
export function raceStandings(state, limit = 0) {
  const rows = []
  for (const p of state.world.players) {
    if (p.retired || p.isUser) continue
    const pts = p.season?.points || 0
    if (pts <= 0) continue
    rows.push({ pid: p.pid, name: p.name, flag: p.flag, points: pts, starts: p.season.starts, wins: p.season.wins })
  }
  const me = state.player
  const myPoints = state.seasonTotals?.points || 0
  if (!me.retired && myPoints > 0) {
    rows.push({
      pid: me.pid,
      name: me.name,
      flag: me.flag,
      points: myPoints,
      starts: state.seasonTotals.starts,
      wins: state.seasonTotals.wins,
      isUser: true,
    })
  }
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins)
  rows.forEach((r, i) => {
    r.pos = i + 1
  })
  return limit > 0 ? rows.slice(0, limit) : rows
}

/** Where the player stands, or null before they have scored. */
export function racePosition(state) {
  const rows = raceStandings(state)
  const mine = rows.find((r) => r.isUser)
  if (!mine) return null
  const cutoff = rows[FINALE_FIELD - 1]
  return {
    pos: mine.pos,
    points: mine.points,
    total: rows.length,
    inFinale: mine.pos <= FINALE_FIELD,
    // What the fortieth man has, which is the number anybody outside is watching.
    cutoffPoints: cutoff ? cutoff.points : 0,
    pointsShort: cutoff ? Math.max(0, cutoff.points - mine.points) : 0,
  }
}

/** Bonus money for finishing this high in the final standings. */
export function bonusFor(pos, inflationMult = 1) {
  if (!pos || pos > BONUS_PLACES) return 0
  // Rounded to a thousand rather than ten thousand: at the bottom of the table
  // the gaps between places are small enough that a coarser step made
  // consecutive finishes pay exactly the same.
  return Math.round((BONUS_POOL * BONUS_SHARE[pos - 1] * inflationMult) / 1000) * 1000
}

export function raceTitle(year) {
  return `${year} Order of Merit`
}
