import { clamp } from './rng.js'
import { courseSkill } from './ratings.js'

/**
 * The team weeks.
 *
 * Golf is an individual game fifty-one weeks a year and then, for one week, it
 * is not — and that week is the one players talk about for the rest of their
 * lives despite it paying nothing. There was no version of it here: a career
 * was a list of stroke-play finishes and a bank balance, with no caps, no
 * captain's pick to sweat, and no team room.
 *
 * Two cups alternate, which is how the real calendar handles the fact that
 * only two continents can fill a Ryder Cup. The Americas play every year; the
 * rest of the world takes turns.
 */

export const CUP_WEEK = 38

const AMERICAS = ['usa', 'can', 'arg']
const EUROPE = ['eng', 'sco', 'irl', 'esp', 'swe', 'ger', 'fra']
const INTERNATIONAL = ['aus', 'rsa', 'jpn', 'kor', 'ind', 'tha']

export const CUPS = {
  continental: {
    id: 'continental',
    name: 'The Continental Cup',
    short: 'Continental Cup',
    blurb: 'Twelve a side, three days, no prize money and no ranking points. Ask anyone who has played in one.',
    home: { id: 'americas', name: 'The Americas', short: 'Americas', regions: AMERICAS },
    away: { id: 'europe', name: 'Europe', short: 'Europe', regions: EUROPE },
  },
  pacific: {
    id: 'pacific',
    name: 'The Pacific Cup',
    short: 'Pacific Cup',
    blurb: 'The other one. Same format, same week, the half of the world the Continental Cup leaves out.',
    home: { id: 'americas', name: 'The Americas', short: 'Americas', regions: AMERICAS },
    away: { id: 'international', name: 'International', short: 'International', regions: INTERNATIONAL },
  },
}

/** Which cup is played in a given season. They alternate. */
export function cupForYear(year) {
  return year % 2 === 0 ? CUPS.continental : CUPS.pacific
}

export const TEAM_SIZE = 12
/** Ten qualify on ranking; the captain picks the last two. */
const AUTO_PICKS = 10
/** 16 points from the pairs sessions, 12 from the singles. Half of 28 plus one. */
export const POINTS_TO_WIN = 14.5

export function eligibleTeamFor(cup, region) {
  if (cup.home.regions.includes(region)) return cup.home
  if (cup.away.regions.includes(region)) return cup.away
  return null
}

/**
 * Pick a side. Ten on merit off the world ranking, two on the captain's nerve
 * — which is where form, and a player just outside the automatic places, comes
 * in. Returns the twelve in selection order.
 */
export function selectTeam(players, side, rng) {
  const pool = players
    .filter((p) => !p.retired && side.regions.includes(p.region) && (p.rank || 9999) < 9999)
    .sort((a, b) => (a.rank || 9999) - (b.rank || 9999))
  const auto = pool.slice(0, AUTO_PICKS).map((p) => ({ player: p, pick: false }))
  const rest = pool.slice(AUTO_PICKS, AUTO_PICKS + 24)
  const picks = []
  // A captain picks on how somebody is playing now, not on where they finished
  // the season before last.
  const weight = (p) => Math.exp((p.form || 0) * 0.55) * Math.exp(-((p.rank || 300) - AUTO_PICKS) / 90)
  const bag = rest.slice()
  while (picks.length < TEAM_SIZE - auto.length && bag.length) {
    const chosen = rng.pickWeighted(bag, weight)
    bag.splice(bag.indexOf(chosen), 1)
    picks.push({ player: chosen, pick: true })
  }
  return [...auto, ...picks].slice(0, TEAM_SIZE)
}

/** Match-play strength. Course fit still matters; a bad week matters more. */
function matchQuality(p, ratings, courseType) {
  return courseSkill(ratings, courseType) + (p.form || 0) * 1.6 - Math.pow(clamp(p.fatigue, 0, 100) / 100, 1.4) * 5
}

/**
 * One match. Match play throws away the size of a beating, so a weaker player
 * beats a stronger one far more often than eighteen holes of stroke play would
 * suggest — which is the entire reason these weeks are worth watching.
 */
function playMatch(a, b, rng) {
  const d = a - b
  const pHalf = 0.09
  const pA = (1 - pHalf) / (1 + Math.exp(-d * 0.16))
  const roll = rng.next()
  if (roll < pA) return 1
  if (roll < pA + pHalf) return 0.5
  return 0
}

/**
 * Play the cup out: four pairs sessions of four matches, then twelve singles.
 * 28 points, 14.5 to win it, and the holders keep it on a tie.
 */
export function simCup(cup, homeTeam, awayTeam, courseType, rng, holder = null) {
  const strength = (entry) => matchQuality(entry.player, entry.ratings || entry.player.ratings, courseType)
  const home = homeTeam.map((e) => ({ ...e, q: strength(e), w: 0, l: 0, h: 0, played: 0 }))
  const away = awayTeam.map((e) => ({ ...e, q: strength(e), w: 0, l: 0, h: 0, played: 0 }))

  let homePts = 0
  let awayPts = 0
  const sessions = []

  const record = (side, res) => {
    for (const m of side) {
      m.played += 1
      if (res === 1) m.w += 1
      else if (res === 0.5) m.h += 1
      else m.l += 1
    }
  }

  // A cup needs two sides. A region can be short of fit professionals in the
  // early years of a career or after a wave of retirements, so this degrades
  // to a smaller cup rather than reading past the end of a team.
  const perSide = Math.min(home.length, away.length)
  const pairMatches = Math.floor(Math.min(8, perSide) / 2)

  // Four pairs sessions. Eight of the twelve play each one, and the captain
  // leans on whoever is going well — which is how a pick can end up with more
  // matches than an automatic qualifier.
  for (let s = 0; s < 4 && pairMatches > 0; s++) {
    const pickEight = (team) =>
      rng
        .shuffle(team.slice())
        .sort((a, b) => b.q + rng.gauss(0, 6) - (a.q + rng.gauss(0, 6)))
        .slice(0, 8)
    const hs = pickEight(home)
    const as = pickEight(away)
    const matches = []
    for (let i = 0; i < pairMatches; i++) {
      const hp = [hs[i * 2], hs[i * 2 + 1]]
      const ap = [as[i * 2], as[i * 2 + 1]]
      const res = playMatch((hp[0].q + hp[1].q) / 2, (ap[0].q + ap[1].q) / 2, rng)
      homePts += res
      awayPts += 1 - res
      record(hp, res)
      record(ap, 1 - res)
      matches.push({ home: hp.map((m) => m.player.name), away: ap.map((m) => m.player.name), result: res })
    }
    sessions.push({ name: s % 2 === 0 ? 'Foursomes' : 'Fourballs', matches })
  }

  // Singles: everybody plays, strongest against strongest.
  const hOrder = [...home].sort((a, b) => b.q - a.q)
  const aOrder = [...away].sort((a, b) => b.q - a.q)
  const singles = []
  for (let i = 0; i < perSide; i++) {
    const res = playMatch(hOrder[i].q, aOrder[i].q, rng)
    homePts += res
    awayPts += 1 - res
    record([hOrder[i]], res)
    record([aOrder[i]], 1 - res)
    singles.push({ home: hOrder[i].player.name, away: aOrder[i].player.name, result: res })
  }
  if (singles.length) sessions.push({ name: 'Singles', matches: singles })

  const tied = homePts === awayPts
  let winner
  if (tied) winner = holder === cup.away.id ? cup.away.id : cup.home.id
  else winner = homePts > awayPts ? cup.home.id : cup.away.id

  return {
    cupId: cup.id,
    name: cup.name,
    homePts,
    awayPts,
    tied,
    winner,
    retained: tied,
    sessions,
    home,
    away,
  }
}

/** "3-1-1" the way a team record is always written. */
export function recordText(r) {
  if (!r) return '0–0–0'
  return `${r.w || 0}–${r.l || 0}–${r.h || 0}`
}

/** Points won from a W–L–H record: a win is one, a half is a half. */
export function recordPoints(r) {
  if (!r) return 0
  return (r.w || 0) + (r.h || 0) * 0.5
}
