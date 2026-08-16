import { makeRatings, overall, progressYear, jigglePotential } from './ratings.js'
import { makeName, randomRegion, maybeNickname } from './names.js'
import { clamp } from './rng.js'
import { SENIOR_AGE, PLAYSTYLES } from './constants.js'
import { residualDamage, rollSetback } from './injuries.js'

export const POOL_TARGET = {
  domestic: 190,
  intl: 165,
  asian: 105,
  emerging: 140,
  amateur: 100, // mini-tour and regional players; the pond you start in
  // The Senior Circuit was never given a population of its own — it was
  // entirely whoever happened to survive to fifty out of the aging tail of
  // everyone else, which came to about twenty-five players for a tour that
  // advertises seventy-eight-man fields. Some worlds produced twenty, and then
  // events were run with seventeen people in them.
  senior: 95,
}

export const RANK_DECAY = 0.9885 // weekly; ~60-week half life

let nextPid = 1

export function resetPidCounter(v) {
  nextPid = v
}

export function makeAiPlayer(rng, opts = {}) {
  const { age = rng.int(20, 24), talent = null, homeCircuit = 'emerging', taken, year = 0 } = opts
  const region = randomRegion(rng)
  const name = makeName(rng, region.id, taken)
  const t = talent === null ? clamp(rng.gauss(0.44, 0.17), 0.02, 0.99) : talent
  const { ratings, potential } = makeRatings(rng, age, t)
  const p = {
    pid: nextPid++,
    name: name.full,
    first: name.first,
    last: name.last,
    region: region.id,
    flag: region.flag,
    age,
    birthYear: year - age,
    ratings,
    potential,
    playstyle: rng.pickWeighted(PLAYSTYLES, (s) => (s.id === 'balanced' ? 3 : 1)).id,
    form: rng.gauss(0, 1.6),
    fatigue: 0,
    injury: null,
    ailments: {},
    homeCircuit,
    propensity: clamp(rng.gauss(0.66, 0.12), 0.35, 0.92),
    rankPoints: 0,
    asianPoints: 0,
    seniorPoints: 0,
    rank: 999,
    wins: 0,
    majors: 0,
    seniorWins: 0,
    top10s: 0,
    starts: 0,
    cutsMade: 0,
    careerEarnings: 0,
    peakOvr: overall(ratings),
    season: newSeasonStats(),
    retired: false,
    retiredYear: null,
    isUser: false,
    nickname: null,
  }
  p.nickname = maybeNickname(rng, p)
  return p
}

export function newSeasonStats() {
  return { starts: 0, wins: 0, majors: 0, top10s: 0, cuts: 0, earnings: 0, points: 0, bestFinish: null }
}

/** Deterministically build the professional world at career start. */
export function createWorld(rng, year) {
  const taken = new Set()
  const players = []
  const spread = [
    { circuit: 'domestic', count: POOL_TARGET.domestic, talent: [0.56, 0.13] },
    { circuit: 'intl', count: POOL_TARGET.intl, talent: [0.5, 0.13] },
    { circuit: 'asian', count: POOL_TARGET.asian, talent: [0.38, 0.14] },
    { circuit: 'emerging', count: POOL_TARGET.emerging, talent: [0.3, 0.13] },
    { circuit: 'amateur', count: POOL_TARGET.amateur, talent: [0.2, 0.11] },
    { circuit: 'senior', count: POOL_TARGET.senior, talent: [0.44, 0.14] },
  ]
  for (const grp of spread) {
    for (let i = 0; i < grp.count; i++) {
      const age =
        grp.circuit === 'amateur'
          ? clamp(Math.round(rng.gauss(24, 3.5)), 18, 34)
          : grp.circuit === 'senior'
            ? clamp(Math.round(rng.gauss(56, 4.5)), SENIOR_AGE, 68)
            : clamp(Math.round(rng.gauss(32, 8.5)), 20, 52)
      const talent = clamp(rng.gauss(grp.talent[0], grp.talent[1]), 0.03, 0.99)
      const p = makeAiPlayer(rng, { age, talent, homeCircuit: grp.circuit, taken, year })
      // Seed a plausible career already in progress.
      seedHistory(p, rng)
      players.push(p)
    }
  }
  // A handful of true superstars so the top of the ranking has real names.
  for (let i = 0; i < 6; i++) {
    const p = makeAiPlayer(rng, {
      age: clamp(Math.round(rng.gauss(30, 4)), 24, 38),
      talent: clamp(rng.gauss(0.9, 0.05), 0.75, 0.99),
      homeCircuit: 'domestic',
      taken,
      year,
    })
    seedHistory(p, rng, 2.4)
    players.push(p)
  }
  return { players, taken: Array.from(taken), legends: createLegends(rng, year) }
}

function seedHistory(p, rng, boost = 1) {
  const proYears = Math.max(0, p.age - 23)
  const ovr = overall(p.ratings)
  const quality = clamp((ovr - 48) / 30, 0, 1.4) * boost
  p.starts = Math.round(proYears * rng.float(18, 26))
  p.cutsMade = Math.round(p.starts * clamp(0.4 + quality * 0.4, 0.25, 0.92))
  p.top10s = Math.round(p.cutsMade * clamp(0.06 + quality * 0.22, 0.02, 0.42))
  p.wins = Math.max(0, Math.round(p.top10s * clamp(0.06 + quality * 0.14, 0, 0.3) * rng.float(0.5, 1.6)))
  p.majors = p.wins > 3 && rng.chance(0.35 * quality) ? rng.int(1, Math.min(4, Math.ceil(p.wins / 4))) : 0
  p.careerEarnings = Math.round(p.cutsMade * rng.float(50000, 130000) * (0.4 + quality))
  // Ranking points consistent with that record.
  p.rankPoints = Math.max(0.2, quality * rng.float(60, 190) + p.wins * 8 + p.majors * 25)
  p.peakOvr = Math.max(p.peakOvr, ovr + (p.age > 34 ? rng.float(1, 6) : 0))
}

/** Historical all-time greats, purely for the comparison leaderboard. */
function createLegends(rng, year) {
  const taken = new Set()
  const out = []
  const tiers = [
    { n: 3, majors: [11, 18], wins: [60, 92], ovr: [88, 94] },
    { n: 6, majors: [6, 10], wins: [35, 62], ovr: [84, 89] },
    { n: 10, majors: [3, 5], wins: [18, 38], ovr: [80, 86] },
    { n: 14, majors: [1, 2], wins: [8, 22], ovr: [76, 83] },
  ]
  for (const t of tiers) {
    for (let i = 0; i < t.n; i++) {
      const region = randomRegion(rng)
      const name = makeName(rng, region.id, taken)
      const wins = rng.int(t.wins[0], t.wins[1])
      const majors = rng.int(t.majors[0], t.majors[1])
      const era = year - rng.int(8, 55)
      out.push({
        pid: -out.length - 1,
        name: name.full,
        flag: region.flag,
        wins,
        majors,
        peakOvr: Math.round(rng.float(t.ovr[0], t.ovr[1]) * 10) / 10,
        careerEarnings: Math.round(wins * rng.float(1.6e6, 3.4e6) + majors * 4e6),
        eraEnd: era,
        legend: true,
      })
    }
  }
  return out.sort((a, b) => b.majors - a.majors || b.wins - a.wins)
}

// ------------------------------------------------------------------ ranking

export function decayRankings(players) {
  for (const p of players) {
    if (p.retired) continue
    p.rankPoints *= RANK_DECAY
    p.asianPoints *= RANK_DECAY
    p.seniorPoints *= RANK_DECAY
  }
}

export function recomputeRanks(players, deep = false) {
  const active = players.filter((p) => !p.retired)
  active.sort((a, b) => b.rankPoints - a.rankPoints)
  active.forEach((p, i) => {
    p.rank = i + 1
  })
  for (const p of players) {
    if (p.retired) p.rank = null
  }
  // The regional order-of-merit tables only matter between seasons.
  if (!deep) return active
  const asian = active.filter((p) => p.homeCircuit === 'asian' || p.asianPoints > 0)
  asian.sort((a, b) => b.asianPoints - a.asianPoints)
  asian.forEach((p, i) => {
    p.asianRank = i + 1
  })
  const senior = active.filter((p) => p.age >= SENIOR_AGE)
  senior.sort((a, b) => b.seniorPoints - a.seniorPoints)
  senior.forEach((p, i) => {
    p.seniorRank = i + 1
  })
  return active
}

/**
 * Cheap weekly rank refresh for one player — a full sort of the pool every
 * week is the single most expensive thing in a long sim.
 */
export function updateRankOf(player, players) {
  let better = 1
  for (const p of players) {
    if (p.retired || p === player) continue
    if (p.rankPoints > player.rankPoints) better++
  }
  player.rank = better
  return better
}

export function worldRankingList(players, limit = 100) {
  return players
    .filter((p) => !p.retired)
    .slice()
    .sort((a, b) => b.rankPoints - a.rankPoints)
    .slice(0, limit)
}

// --------------------------------------------------------------- progression

/**
 * How much medical and psychological support a player can buy, from how well
 * they are playing. The same curve the offseason uses for development — a tour
 * winner has a physio on retainer and a mini-tour player has a foam roller.
 */
function supportLevel(p) {
  return 0.15 + clamp((overall(p.ratings) - 48) / 34, 0, 1) * 0.48
}

/**
 * Weekly drift of hot/cold form for every AI player, and whatever goes wrong.
 *
 * The rest of the world used to be indestructible. This function decremented
 * `weeksLeft` and cleared the ailment at zero, and `aiEligible` already refused
 * to put an injured player in a field, but nothing anywhere ever *gave* an AI
 * player an injury — so the world number one teed it up forty-four weeks a year
 * for thirty years, nobody ever lost a season to a back, and nobody ever came
 * back diminished. The top of the rankings was far more stable than the real
 * thing, where any five-year stretch is partly a story about who got hurt.
 */
export function driftForm(players, rng) {
  for (const p of players) {
    if (p.retired || p.isUser) continue
    p.form = p.form * 0.86 + rng.gauss(0, 0.9)
    p.fatigue = Math.max(0, p.fatigue - 6)
    if (p.injury) {
      p.injury.weeksLeft -= 1
      if (p.injury.weeksLeft <= 0) {
        // Not every comeback is complete. This is what puts a former world
        // number one in the middle of the field at thirty-four and leaves them
        // there — the thing a ratings curve alone can never produce.
        const lasting = residualDamage(p.injury, rng, supportLevel(p))
        for (const [k, v] of Object.entries(lasting)) {
          p.ratings[k] = clamp((p.ratings[k] || 0) + v, 1, 99)
        }
        if (!p.ailments) p.ailments = {}
        p.ailments[p.injury.id] = (p.ailments[p.injury.id] || 0) + 1
        p.injury = null
      }
      continue
    }
    // `playedThisWeek` is left false rather than tracked: an AI plays roughly
    // three weeks in five, and carrying that through the whole pool costs a
    // random draw per player per week for a change of a third of a percent.
    const care = supportLevel(p)
    const setback = rollSetback(rng, p, { physio: care, psych: care * 0.8, history: p.ailments })
    if (setback) p.injury = setback
  }
}

/** Offseason development for the AI pool, plus retirements and new blood. */
export function progressWorld(world, rng, year) {
  const retiring = []
  for (const p of world.players) {
    if (p.retired || p.isUser) continue
    p.age += 1
    // Successful players can afford the same support the user buys, so their
    // development keeps pace instead of quietly falling behind.
    const standing = clamp((overall(p.ratings) - 48) / 34, 0, 1)
    const support = 0.15 + standing * 0.48
    const focus = weakestAttr(p)
    const { ratings } = progressYear(p.ratings, p.potential, p.age, rng, {
      coach: support,
      physio: 0.2 + standing * 0.5,
      psych: 0.12 + standing * 0.45,
      trainingAttr: focus,
      trainingPower: 0.3 + support * 0.7,
      wear: clamp((p.starts - 380) / 900, 0, 0.7),
    })
    p.ratings = ratings
    p.potential = jigglePotential(p.potential, ratings, p.age, rng)
    const ovr = overall(ratings)
    p.peakOvr = Math.max(p.peakOvr, ovr)
    p.season = newSeasonStats()

    // Golf lets you keep going. Most pros only stop when the body or the
    // money list makes the decision for them — which is what fills the
    // Senior Circuit thirty years into a career.
    let retireChance = 0
    let reason = null
    const bid = (chance, why) => {
      if (chance <= 0) return
      // Whichever reason carries the most weight is the one they give.
      if (chance > (reason ? reason.chance : 0)) reason = { chance, why }
      retireChance += chance
    }
    bid(p.age >= 40 ? (p.age - 39) * 0.006 : 0, 'age')
    bid(ovr < 34 ? 0.25 : 0, 'not good enough')
    bid(p.age >= 44 && ovr < 44 ? 0.05 : 0, 'not good enough')

    /**
     * The reasons golfers actually stop, beyond being old and being bad.
     *
     * Those two were the whole model, and between them they left a hole in the
     * curve exactly where real careers end most often: a player over 34 rated
     * and under 40 years old had essentially no way out at all, so thirty-five
     * to thirty-nine took 21 retirements against 118 in the band below it and
     * 114 in the band above. Nobody in this world ever lost a step at
     * thirty-six and went and did something else.
     */

    // Falling away from what you were. Not being bad in absolute terms — being
    // visibly worse than the player you used to be, which is what tells you it
    // is over, and which is why it can end a career at any age.
    const drop = Math.max(0, p.peakOvr - ovr)
    if (drop > 4 && p.age >= 29) {
      bid(Math.min(0.14, (drop - 4) * 0.011 * (1 + Math.max(0, p.age - 32) * 0.03)), 'not the player you were')
    }

    /**
     * The body. A career of setbacks ends careers, and it ends them young as
     * often as it ends them late — a wrist that never came back at thirty-one
     * is as final as anything on the age curve.
     *
     * Counted against the length of the career rather than as a raw total.
     * Every player accumulates ailments if they play long enough, so a flat
     * threshold made this the single largest cause of retirement in the game
     * at 35% of all of them, and emptied the senior tour by killing everyone
     * before they got to fifty. What ends a career is breaking down *often*.
     */
    const ailments = p.ailments ? Object.values(p.ailments).reduce((a, b) => a + b, 0) : 0
    const proYears = Math.max(1, p.age - 21)
    if (ailments >= 4 && ailments / proYears > 0.35) {
      bid(Math.min(0.12, (ailments - 3) * 0.02), 'the body')
    }
    if (p.injury && p.injury.weeksTotal >= 16) bid(0.06, 'the body')

    // Everything the model does not name: a business, a family, a job offer,
    // or simply not wanting to do it any more. A small hazard on every player
    // old enough to have a life outside it puts a trickle at every age.
    if (p.age >= 28) bid(0.006, 'walked away')

    // And the rare one worth having: a decorated player who stops while they
    // are still good, rather than being pushed.
    if (p.majors >= 2 && p.age >= 33 && drop > 2 && ovr >= 58) bid(0.05, 'went out on top')
    // The old curve emptied the senior tour: almost nobody survived past 62,
    // so a circuit that advertises 78-player fields was running on a pool of
    // about thirty — and once injuries started taking a share of those, fields
    // fell to nineteen. Real senior tours are full because a fifty-five-year-old
    // who can still play has every reason to keep playing.
    bid(p.age >= 58 ? (p.age - 57) * 0.028 : 0, 'age')
    bid(p.age >= 66 ? 0.2 : 0, 'age')
    if (p.age >= 72) {
      retireChance = 1
      reason = { chance: 1, why: 'age' }
    }
    /**
     * Turning fifty is a change of tour, not a retirement. Anybody who can
     * still play goes and plays the Senior Circuit, which is the only reason
     * that circuit has a field at all — it has no pool of its own, it is
     * entirely the tail of everyone else's career.
     *
     * Which means the four years before fifty are load-bearing, and only the
     * far side of the line was protected. Adding real reasons to quit in the
     * forties culled the cohort that becomes the senior tour: the population
     * over fifty fell from 67 to 19 across forty-five seasons and the audit
     * caught it. Somebody who is forty-six and can still play is two years
     * from a payday, and quits at nothing like the rate of somebody the same
     * distance past their peak at thirty-six.
     */
    if (p.age >= 46 && p.age < SENIOR_AGE && ovr >= 42) retireChance = Math.min(retireChance, 0.1)
    if (p.age >= SENIOR_AGE && p.age < 66 && ovr >= 40) retireChance = Math.min(retireChance, 0.06)
    // Mini-tour players give up much sooner than tour pros.
    if (p.homeCircuit === 'amateur') {
      const give = 0.1 + Math.max(0, p.age - 27) * 0.06
      if (give > (reason ? reason.chance : 0)) reason = { chance: give, why: 'never made it' }
      retireChance += give
      if (ovr > 55) retireChance = 0.02
    }
    if (rng.chance(clamp(retireChance, 0, 1))) {
      p.retiredReason = reason ? reason.why : 'age'
      retiring.push(p)
    }
  }

  for (const p of retiring) {
    p.retired = true
    p.retiredYear = year
    p.retiredAge = p.age
    p.rank = null
  }

  // Promotion and relegation between circuits keeps fields honest.
  for (const p of world.players) {
    if (p.retired || p.isUser) continue
    const ovr = overall(p.ratings)
    // Fifty is a change of tour. Doing it here rather than leaving them on a
    // circuit they can no longer enter is what keeps the senior roster in the
    // overflow bookkeeping below, so it holds its size like every other pool.
    if (p.age >= SENIOR_AGE) p.homeCircuit = 'senior'
    else if (p.homeCircuit === 'amateur' && ovr > 50) p.homeCircuit = 'emerging'
    else if (p.homeCircuit === 'emerging' && ovr > 62) p.homeCircuit = rng.chance(0.6) ? 'domestic' : 'intl'
    else if (p.homeCircuit === 'asian' && ovr > 68) p.homeCircuit = 'intl'
    else if (p.homeCircuit === 'intl' && ovr > 72 && rng.chance(0.35)) p.homeCircuit = 'domestic'
    else if (p.homeCircuit === 'domestic' && ovr < 50 && rng.chance(0.5)) p.homeCircuit = 'emerging'
    else if (p.homeCircuit === 'intl' && ovr < 48 && rng.chance(0.5)) p.homeCircuit = 'emerging'
  }

  // Promotion churn tends to pile players up on the development tour; retire
  // the weakest of any overflow so the world does not grow without bound.
  for (const [circuit, target] of Object.entries(POOL_TARGET)) {
    const members = world.players.filter((p) => !p.retired && !p.isUser && p.homeCircuit === circuit)
    const excess = members.length - Math.round(target * 1.15)
    if (excess <= 0) continue
    members.sort((a, b) => overall(a.ratings) - overall(b.ratings))
    for (let i = 0; i < excess; i++) {
      const p = members[i]
      if (p.age < 26 && rng.chance(0.55)) continue // young players get more rope
      p.retired = true
      p.retiredYear = year
      p.retiredAge = p.age
      p.retiredReason = 'squeezed out'
      p.rank = null
      retiring.push(p)
    }
  }

  // Restock each circuit with rookies.
  const taken = new Set(world.players.map((p) => p.name))
  /**
   * Restock each circuit — with players who could plausibly be on it.
   *
   * This table had no entry for the Senior Circuit, so every senior it topped
   * the pool up with was built from `talent: undefined`: a nineteen-year-old
   * whose seven ratings all came out `null` and whose overall was zero. The
   * pool therefore always *reported* its target of 95 while the number of
   * players actually old enough to enter a senior event collapsed underneath
   * it, which is how a tour that advertises 78-player fields ran one with
   * eight people in it. Seniors are restocked at senior ages, from the same
   * distribution the world is seeded with.
   */
  const RESTOCK = {
    domestic: { talent: 0.58, age: [19, 23] },
    intl: { talent: 0.52, age: [19, 23] },
    asian: { talent: 0.42, age: [19, 23] },
    emerging: { talent: 0.33, age: [19, 23] },
    amateur: { talent: 0.2, age: [19, 23] },
    senior: { talent: 0.44, age: [SENIOR_AGE, 58] },
  }
  for (const [circuit, target] of Object.entries(POOL_TARGET)) {
    const have = world.players.filter((p) => !p.retired && p.homeCircuit === circuit).length
    const spec = RESTOCK[circuit] || RESTOCK.emerging
    for (let i = have; i < target; i++) {
      const p = makeAiPlayer(rng, {
        age: rng.int(spec.age[0], spec.age[1]),
        talent: clamp(rng.gauss(spec.talent, 0.16), 0.03, 0.99),
        homeCircuit: circuit,
        taken,
        year,
      })
      // A fifty-four-year-old did not turn up from nowhere; give them the
      // career they must have had, or the all-time lists fill with blanks.
      if (circuit === 'senior') seedHistory(p, rng)
      world.players.push(p)
    }
  }

  // Keep the array from growing without bound across a 40-year career. Only
  // players with a record worth remembering survive the cull.
  world.players = world.players.filter((p) => {
    if (!p.retired || p.isUser) return true
    if (year - (p.retiredYear || year) <= 2) return true
    return p.majors > 0 || p.wins >= 5
  })

  return retiring
}

function weakestAttr(p) {
  let worst = null
  let gap = -Infinity
  for (const k of Object.keys(p.potential)) {
    const g = p.potential[k] - p.ratings[k]
    if (g > gap) {
      gap = g
      worst = k
    }
  }
  return worst
}

export function findPlayer(world, pid) {
  return world.players.find((p) => p.pid === pid)
}
