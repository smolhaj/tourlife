import { Rng, clamp } from './rng.js'
import {
  ATTR_KEYS,
  CIRCUITS,
  GAME_VERSION,
  SENIOR_AGE,
  TRAINING_OPTIONS,
  lifestyleById,
} from './constants.js'
import { makeRatings, overall, progressYear, jigglePotential } from './ratings.js'
import { regionById } from './names.js'
import {
  createFixtures,
  buildSeason,
  PLAYING_WEEKS,
  MAJOR_WEEKS,
} from './schedule.js'
import {
  createWorld,
  decayRankings,
  recomputeRanks,
  updateRankOf,
  driftForm,
  progressWorld,
  newSeasonStats,
} from './world.js'
import { makeEntrant, simTournament } from './tournament.js'
import {
  emptyStaff,
  generateStaffMarket,
  annualStaffCost,
  agentCut,
  sponsorMultiplier,
  staffMatchdayEffect,
  coachTrainingBonus,
  staffQuality,
} from './staff.js'
import {
  starterBag,
  generateEquipmentCatalog,
  equipmentBonus,
  sponsorGear,
} from './equipment.js'
import {
  generateOffers,
  sponsorIncome,
  rollSponsors,
  sponsorBonusesFor,
  marketability,
  negotiate,
} from './sponsors.js'
import { rollSetback, ailmentPenalty, residualDamage, AILMENTS } from './injuries.js'
import {
  splitPrize,
  netEndorsement,
  annualExpenses,
  investmentReturn,
  coastStatus,
  fmtMoney,
} from './finance.js'
import {
  makeHighlight,
  winLine,
  missedCutLine,
  offWeekLine,
  careerPhase,
  legacyScore,
  LIFE_EVENTS,
} from './narrative.js'
import {
  emptyCards,
  checkEligibility,
  resolveCards,
  runQSchool,
  cardStatus,
  Q_SCHOOL_FEE,
  EMERGING_ENTRY_FEE,
} from './eligibility.js'

const AI_SUPPORT_BONUS = 1.15
const MAX_LOG = 400

// ------------------------------------------------------------------ new game

export function newGame(opts = {}) {
  const {
    name = 'Alex Morgan',
    regionId = 'usa',
    age = 21,
    talent = 0.5,
    playstyle = 'balanced',
    seed = Math.floor(Math.random() * 2 ** 31),
    startYear = 2026,
    difficulty = 'normal',
  } = opts

  const rng = new Rng(seed)
  const world = createWorld(rng, startYear)
  const region = regionById(regionId)
  const talentAdj = { easy: 0.12, normal: 0, hard: -0.1 }[difficulty] || 0
  const { ratings, potential } = makeRatings(rng, age, clamp(talent + talentAdj, 0.02, 0.99))

  const parts = String(name).trim().split(/\s+/)
  const player = {
    pid: 0,
    isUser: true,
    name: name.trim() || 'Alex Morgan',
    first: parts[0] || 'Alex',
    last: parts.slice(1).join(' ') || 'Morgan',
    region: region.id,
    flag: region.flag,
    age,
    birthYear: startYear - age,
    ratings,
    potential,
    playstyle,
    form: 0,
    fatigue: 0,
    morale: 62,
    injury: null,
    status: 'amateur',
    proYears: 0,
    homeCircuit: 'amateur',
    rank: 999,
    rankPoints: 0,
    asianPoints: 0,
    seniorPoints: 0,
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
    nickname: null,
  }
  world.players.unshift(player)

  const fixtures = createFixtures(rng)

  const state = {
    version: GAME_VERSION,
    seed,
    rngState: rng.s,
    difficulty,
    createdAt: new Date().toISOString(),
    startYear,
    year: startYear,
    yearsElapsed: 0,
    week: 1,
    phase: 'offseason',
    firstOffseason: true,
    player,
    world,
    fixtures,
    season: [],
    nextSeason: buildSeason(fixtures, 0, rng),
    entered: {},
    nextEntered: {},
    seasonResults: {},
    seasonLog: [],
    seasonTotals: emptySeasonTotals(),
    cards: emptyCards(),
    majorExemptUntil: 0,
    tourWinExemptUntil: 0,
    asianOMExemptUntil: 0,
    career: {
      wins: 0,
      majors: 0,
      seniorWins: 0,
      seniorMajors: 0,
      top10s: 0,
      starts: 0,
      cutsMade: 0,
      careerEarnings: 0,
      careerGross: 0,
      endorsementTotal: 0,
      bestRank: null,
      weeksAtNo1: 0,
      weeksTop10: 0,
      seasonsTop10: 0,
      majorWins: [],
      winsList: [],
      allResults: [],
      amateurWins: 0,
      highlights: [],
      seasons: [],
      h2h: {},
      rivals: [],
      venueWins: {},
      lastMajorWinYear: null,
      firstWinYear: null,
      asianOrderOfMeritWins: 0,
    },
    finance: {
      cash: 24000,
      lifestyle: 'modest',
      dependents: 0,
      seasonPrizeGross: 0,
      seasonPrizeNet: 0,
      seasonEndorse: 0,
      passiveIncome: 0,
      history: [],
    },
    staff: emptyStaff(),
    staffMarket: null,
    bag: starterBag(rng, 0, startYear),
    equipCatalog: null,
    sponsors: { deals: [], offers: [] },
    training: { choice: 'balanced', second: null },
    qSchool: null,
    log: [],
    news: [],
    offseason: null,
    settings: { autoAdvance: true },
  }

  refreshDerived(state)
  prepareOffseason(state, true, rng)
  state.rngState = rng.s
  return state
}

function emptySeasonTotals() {
  return {
    starts: 0,
    wins: 0,
    majors: 0,
    top10s: 0,
    cuts: 0,
    missedCuts: 0,
    prizeGross: 0,
    prizeNet: 0,
    points: 0,
    moneyByCircuit: {},
    startsByCircuit: {},
    bestFinish: null,
    weeksAtNo1: 0,
  }
}

// ------------------------------------------------------------- derived stats

/** Ratings actually used on the course: base + gear − whatever is wrong with you. */
export function computeEffRatings(state) {
  const base = state.player.ratings
  const gear = equipmentBonus(state.bag, state.yearsElapsed)
  const hurt = ailmentPenalty(state.player.injury)
  const out = {}
  for (const k of ATTR_KEYS) {
    out[k] = clamp(Math.round(((base[k] || 0) + (gear[k] || 0) + (hurt[k] || 0)) * 10) / 10, 1, 99)
  }
  return out
}

export function refreshDerived(state) {
  state.effRatings = computeEffRatings(state)
  state.ovr = Math.round(overall(state.effRatings) * 10) / 10
  state.baseOvr = Math.round(overall(state.player.ratings) * 10) / 10
  return state
}

/** The calendar year of the season about to be played. */
export function upcomingYear(state) {
  if (state.phase !== 'offseason') return state.year
  return state.year + (state.offseason?.isFirst ? 0 : 1)
}

export function currentBurn(state) {
  const startsByCircuit = state.seasonTotals.startsByCircuit
  return annualExpenses({
    lifestyleId: state.finance.lifestyle,
    staffCost: annualStaffCost(state.staff),
    startsByCircuit,
    yearsElapsed: state.yearsElapsed,
    dependents: state.finance.dependents,
    amateur: state.player.status === 'amateur',
  }).total
}

// ------------------------------------------------------------ field building

const CIRCUIT_LADDER = { amateur: -1, emerging: 0, asian: 1, intl: 2, domestic: 3 }

/** Nobody plays 44 weeks. This is how many starts an AI will make in a year. */
function startsBudget(p) {
  const base = p.age >= SENIOR_AGE ? 13 : p.homeCircuit === 'amateur' ? 14 : 16
  const span = p.age >= SENIOR_AGE ? 12 : 17
  const old = p.age > 42 ? (p.age - 42) * 0.6 : 0
  return Math.max(8, Math.round(base + p.propensity * span - old))
}

function aiPlayable(p, event) {
  if (p.retired) return false
  if (p.injury && p.injury.out) return false
  // Majors are the exception — nobody sits one out to manage their schedule.
  if (!event.isMajor && p.season.starts >= startsBudget(p)) return false
  if (event.circuit === 'senior') return p.age >= SENIOR_AGE
  if (p.age >= SENIOR_AGE) return false
  if (event.circuit === 'amateur') return p.homeCircuit === 'amateur'
  if (p.homeCircuit === 'amateur') return event.circuit === 'emerging'
  return true
}

function affinity(p, event) {
  const c = event.circuit
  if (c === 'major' || c === 'senior') return 1
  if (p.homeCircuit === c) return 1
  const a = CIRCUIT_LADDER[p.homeCircuit]
  const b = CIRCUIT_LADDER[c]
  if (a === undefined || b === undefined) return 0.02
  const gap = Math.abs(a - b)
  if (gap === 1) return 0.05
  if (gap === 2) return 0.012
  return 0.003
}

/**
 * Circuit-eligible candidates for this week. The caller passes a cache holding
 * the week's non-retired roster so each event filters a smaller list rather
 * than rescanning every player who ever turned pro.
 */
function circuitPool(state, event, cache) {
  let active = cache.get('#active')
  if (!active) {
    active = state.world.players.filter((p) => !p.isUser && !p.retired)
    cache.set('#active', active)
  }
  let pool = cache.get(event.circuit)
  if (!pool) {
    pool = active.filter((p) => aiPlayable(p, event))
    cache.set(event.circuit, pool)
  }
  return pool
}

/**
 * Affinity below this is "the occasional crossover entry". Rather than scoring
 * every one of several hundred such players for every event, we sample them in
 * proportion to their affinity and give the survivors the threshold weight —
 * same expected field composition, a fraction of the work.
 */
const THIN_AFFINITY = 0.2

/**
 * Pick who shows up. Majors force in the world's best; ordinary events lean on
 * tour membership plus a bit of crossover. Fields for events the player is not
 * in are trimmed — nobody sees them, and it keeps 30-year skips fast.
 */
function selectField(state, event, rng, includeUser, cache) {
  const size = includeUser
    ? event.fieldSize
    : Math.min(event.fieldSize, event.isMajor ? 96 : 64)
  const pool = circuitPool(state, event, cache)
  const chosen = []
  const used = new Set()

  if (event.isMajor || event.flagship) {
    const byRank = pool
      .slice()
      .sort((a, b) => b.rankPoints - a.rankPoints)
      .slice(0, Math.floor(size * (event.isMajor ? 0.55 : 0.3)))
    for (const p of byRank) {
      chosen.push(p)
      used.add(p.pid)
    }
  }

  // Weighted reservoir (exponential-race form) for the rest of the field.
  const need = size - chosen.length - (includeUser ? 1 : 0)
  if (need <= 0) return chosen

  const remaining = []
  for (const p of pool) {
    if (used.size && used.has(p.pid)) continue
    let aff = affinity(p, event)
    if (aff <= 0) continue
    if (aff < THIN_AFFINITY) {
      if (rng.next() * THIN_AFFINITY > aff) continue
      aff = THIN_AFFINITY
    }
    const w = aff * p.propensity * (1 + clamp(p.rankPoints / 120, 0, 1.4))
    remaining.push({ p, key: -Math.log(rng.next() + 1e-12) / w })
  }
  remaining.sort((a, b) => a.key - b.key)
  for (let i = 0; i < need && i < remaining.length; i++) chosen.push(remaining[i].p)

  return chosen
}

function aiEffRatings(p) {
  if (!p.injury) return p.ratings
  const hurt = ailmentPenalty(p.injury)
  const out = {}
  for (const k of ATTR_KEYS) out[k] = clamp((p.ratings[k] || 0) + (hurt[k] || 0), 1, 99)
  return out
}

// ----------------------------------------------------------- event execution

function runEvent(state, event, rng, { userPlays = false, detailed = false, cache, byPid } = {}) {
  const field = selectField(state, event, rng, userPlays, cache || new Map())
  const entrants = field.map((p) =>
    makeEntrant(p, aiEffRatings(p), event, { qualityBonus: AI_SUPPORT_BONUS }),
  )

  if (userPlays) {
    const p = state.player
    const support = staffMatchdayEffect(state.staff, event)
    const moraleEdge = (p.morale - 55) * 0.018
    const e = makeEntrant(p, state.effRatings, event, {
      qualityBonus: support.quality + moraleEdge + (state.godBoost || 0),
    })
    e.sigma *= support.sigmaMult
    if (state.godBoost) state.godBoost = 0
    entrants.push(e)
  }

  const scaledEvent = userPlays
    ? event
    : { ...event, cutSize: Math.round(event.cutSize * (entrants.length / event.fieldSize)) }

  const outcome = simTournament(scaledEvent, entrants, rng, {
    detailed: detailed || userPlays,
    detailRows: userPlays ? 20 : 3,
  })

  // Apply to everyone in the field.
  const lookup = byPid || new Map(field.map((p) => [p.pid, p]))
  for (const r of outcome.results) {
    const p = r.isUser ? state.player : lookup.get(r.pid)
    if (!p) continue
    p.starts += 1
    p.season.starts += 1
    p.fatigue = clamp(p.fatigue + fatigueCost(state, event, p), 0, 100)
    if (r.madeCut) {
      p.cutsMade += 1
      p.season.cuts += 1
      p.rankPoints += r.points
      p.season.points += r.points
      if (event.circuit === 'asian') p.asianPoints += r.points
      if (event.circuit === 'senior') p.seniorPoints += r.points
      if (r.pos <= 10) {
        p.top10s += 1
        p.season.top10s += 1
      }
      if (r.pos === 1) {
        if (event.circuit === 'senior') p.seniorWins = (p.seniorWins || 0) + 1
        else p.wins += 1
        p.season.wins += 1
        if (event.isMajor) {
          p.majors += 1
          p.season.majors += 1
        }
      }
      p.careerEarnings += r.money
      p.season.earnings += r.money
      if (p.season.bestFinish === null || r.pos < p.season.bestFinish) p.season.bestFinish = r.pos
    }
    // A good week lifts you; a bad one does not linger as long.
    if (!r.isUser) {
      const delta = r.madeCut ? clamp((25 - r.pos) / 22, -0.7, 1.5) : -0.55
      p.form = clamp(p.form + delta, -5.5, 5.5)
    }
  }

  return outcome
}

function fatigueCost(state, event, p) {
  const base = { amateur: 6, emerging: 8, asian: 12, intl: 12, domestic: 10, major: 13, senior: 8 }[event.circuit] || 10
  let cost = base
  if (p.isUser) {
    const last = state.lastCircuitPlayed
    if (last && last !== event.circuit) cost += 7 // circuit hopping is brutal
    cost *= 1 - staffQuality(state.staff, 'physio') * 0.28
    cost *= 1 + (lifestyleById(state.finance.lifestyle).burnout || 0)
    if (p.age > 40) cost *= 1 + (p.age - 40) * 0.03
  } else if (p.age > 40) {
    cost *= 1 + (p.age - 40) * 0.02
  }
  return cost
}

// --------------------------------------------------------- user result hooks

function recordUserResult(state, event, outcome, rng, byPid) {
  const row = outcome.results.find((r) => r.isUser)
  if (!row) return null
  const p = state.player
  const st = state.seasonTotals

  const isAmateurEvent = event.circuit === 'amateur' || p.status === 'amateur'
  const gross = isAmateurEvent ? 0 : row.money
  const split = splitPrize(gross, {
    pos: row.pos || 999,
    madeCut: row.madeCut,
    hasCaddie: !!state.staff.caddie,
    agentCut: agentCut(state.staff),
  })

  // Open-entry mini-tour events cost you money to tee up in.
  if (event.circuit === 'emerging' && cardStatus(state, 'emerging') === 'none') {
    state.finance.cash -= EMERGING_ENTRY_FEE
  }

  state.finance.cash += split.net
  state.finance.seasonPrizeGross += split.gross
  state.finance.seasonPrizeNet += split.net
  state.career.careerGross += split.gross
  state.career.careerEarnings += split.net

  st.starts += 1
  st.startsByCircuit[event.circuit] = (st.startsByCircuit[event.circuit] || 0) + 1
  st.moneyByCircuit[event.circuit] = (st.moneyByCircuit[event.circuit] || 0) + split.gross
  st.prizeGross += split.gross
  st.prizeNet += split.net
  st.points += row.points
  state.career.starts += 1

  if (row.madeCut) {
    st.cuts += 1
    state.career.cutsMade += 1
    if (st.bestFinish === null || row.pos < st.bestFinish) st.bestFinish = row.pos
    if (row.pos <= 10) {
      st.top10s += 1
      state.career.top10s += 1
    }
    if (row.pos === 1 && event.circuit !== 'amateur') {
      st.wins += 1
      if (event.isMajor) st.majors += 1
    }
  } else {
    st.missedCuts += 1
  }

  // Morale and form respond to the week you just had. Form uses the same
  // scale as the AI pool — it is a hot streak, not a permanent bonus.
  if (row.madeCut) {
    const delta = clamp((25 - row.pos) / 22, -0.7, 1.5)
    p.form = clamp(p.form + delta, -5.5, 5.5)
    p.morale = clamp(p.morale + clamp((22 - row.pos) / 6, -3, 6), 0, 100)
  } else {
    p.form = clamp(p.form - 0.55, -5.5, 5.5)
    p.morale = clamp(p.morale - 3.5, 0, 100)
  }

  const won = row.madeCut && row.pos === 1
  if (won) handleUserWin(state, event, outcome, row, rng)

  // Sponsor performance bonuses.
  if (!isAmateurEvent && (won || (event.isMajor && row.pos <= 3))) {
    const bonus = sponsorBonusesFor(state.sponsors.deals, { win: won, major: won && event.isMajor })
    if (bonus > 0) {
      const net = netEndorsement(bonus, agentCut(state.staff)).net
      state.finance.cash += net
      state.finance.seasonEndorse += net
      state.career.endorsementTotal += net
      pushNews(state, `Contract bonuses from your sponsors: ${fmtMoney(net)} after fees.`, 'money')
    }
  }

  updateH2H(state, outcome, row, byPid)

  const logRow = {
    eventId: event.id,
    name: event.name,
    shortName: event.shortName || event.name,
    circuit: event.circuit,
    week: event.week,
    venue: event.venue,
    courseType: event.courseType,
    isMajor: event.isMajor,
    flagship: event.flagship,
    pos: row.pos,
    tied: row.tied,
    madeCut: row.madeCut,
    toPar: row.toPar,
    rounds: row.rounds || null,
    gross: split.gross,
    net: split.net,
    points: row.points,
    purse: event.purse,
    winner: outcome.winner,
    cutLine: outcome.cutLine,
    fieldSize: outcome.fieldSize,
    amateur: isAmateurEvent,
  }
  state.seasonLog.push(logRow)
  state.career.allResults.push({
    year: state.year,
    week: event.week,
    circuit: event.circuit,
    name: event.name,
    pos: row.pos,
    tied: row.tied,
    madeCut: row.madeCut,
    toPar: row.toPar,
    net: split.net,
    isMajor: !!event.isMajor,
  })
  state.lastCircuitPlayed = event.circuit
  state.lastResult = { ...logRow, leaderboard: outcome.results.slice(0, 20) }

  const posText = row.madeCut ? (row.pos === 1 ? 'WON' : `${row.tied ? 'T' : ''}${row.pos}`) : 'MC'
  pushLog(state, {
    week: event.week,
    year: state.year,
    kind: won ? 'win' : row.madeCut ? 'result' : 'mc',
    text: `${event.name} — ${posText}${row.madeCut ? ` (${row.toPar > 0 ? '+' : ''}${row.toPar})` : ''}${
      split.net > 0 ? ` · ${fmtMoney(split.net, { compact: true })}` : ''
    }`,
    detail: row.madeCut ? null : missedCutLine(rng),
  })

  return logRow
}

function handleUserWin(state, event, outcome, row, rng) {
  const p = state.player
  const c = state.career
  const second = outcome.results.find((r) => r.pos === 2)
  const margin = second ? second.toPar - row.toPar : 1

  if (event.circuit === 'senior') {
    c.seniorWins += 1
    if (event.seniorMajor) c.seniorMajors += 1
  } else if (event.circuit === 'amateur') {
    c.amateurWins = (c.amateurWins || 0) + 1
  } else {
    c.wins += 1
    state.tourWinExemptUntil = Math.max(state.tourWinExemptUntil, state.year + 1)
  }
  c.venueWins[event.venue] = (c.venueWins[event.venue] || 0) + 1
  c.winsList.push({
    year: state.year,
    eventId: event.id,
    name: event.name,
    circuit: event.circuit,
    toPar: row.toPar,
    margin,
    purse: event.purse,
    isMajor: !!event.isMajor,
  })
  p.morale = clamp(p.morale + 12, 0, 100)

  if (event.circuit === 'amateur') {
    if (!c.firstAmateurWinYear) {
      c.firstAmateurWinYear = state.year
      addHighlight(state, 'amWin', {
        title: `Won ${eventTitle(event.name)}`,
        text: 'An amateur title, no cheque, and the first time it occurred to you that this might actually work.',
        importance: 2,
        eventName: event.name,
      })
    }
  } else if (!c.firstWinYear) {
    c.firstWinYear = state.year
    addHighlight(state, 'firstWin', {
      title: 'First professional win',
      text: `${event.name}. ${winLine(rng, event, margin)} Nobody can take the first one away.`,
      importance: 4,
      eventName: event.name,
    })
  }

  if (event.isMajor) {
    c.majors += 1
    c.majorWins.push({ year: state.year, eventId: event.id, name: event.name, toPar: row.toPar, margin })
    state.majorExemptUntil = state.year + 5
    const droughtYears = c.lastMajorWinYear ? state.year - c.lastMajorWinYear : null
    c.lastMajorWinYear = state.year
    addHighlight(state, 'major', {
      title: c.majors === 1 ? `Major champion — ${event.name}` : `${ordinal(c.majors)} major — ${event.name}`,
      text:
        c.majors === 1
          ? `${winLine(rng, event, margin)} You are a major champion, and that sentence is now permanent.`
          : droughtYears && droughtYears >= 5
            ? `After ${droughtYears} years without one, you got back to the top of a major. ${winLine(rng, event, margin)}`
            : winLine(rng, event, margin),
      importance: 6,
      eventName: event.name,
    })
  } else if (event.seniorMajor) {
    addHighlight(state, 'seniorMajor', {
      title: `Senior major — ${event.name}`,
      text: `${winLine(rng, event, margin)} It still counts. It still feels good.`,
      importance: 3,
      eventName: event.name,
    })
  } else if (event.flagship) {
    addHighlight(state, 'bigWin', {
      title: `Won ${eventTitle(event.name)}`,
      text: winLine(rng, event, margin),
      importance: 3,
      eventName: event.name,
    })
  } else if (c.wins % 5 === 0 && c.wins > 0) {
    addHighlight(state, 'milestone', {
      title: `Career win No. ${c.wins}`,
      text: `${event.name}. The wins are stacking up.`,
      importance: 2,
      eventName: event.name,
    })
  }
}

/** Event names often start with "The"; do not print it twice. */
function eventTitle(name) {
  return /^the\s/i.test(name) ? name : `the ${name}`
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function updateH2H(state, outcome, userRow, byPid) {
  const h2h = state.career.h2h
  const userScore = userRow.madeCut ? userRow.pos : 999
  const lookup = byPid || new Map(state.world.players.map((p) => [p.pid, p]))
  for (const r of outcome.results) {
    if (r.isUser) continue
    const p = lookup.get(r.pid)
    if (!p) continue
    const tracked = h2h[r.pid]
    const notable = (p.rank && p.rank <= 80) || (r.madeCut && r.pos <= 25)
    if (!tracked && !notable) continue
    const rec = tracked || { name: p.name, flag: p.flag, beat: 0, lost: 0, meetings: 0, wins: p.wins }
    rec.meetings += 1
    const theirScore = r.madeCut ? r.pos : 999
    if (userScore < theirScore) rec.beat += 1
    else if (theirScore < userScore) rec.lost += 1
    rec.name = p.name
    rec.flag = p.flag
    rec.wins = p.wins
    rec.majors = p.majors
    rec.age = p.age
    h2h[r.pid] = rec
  }
  // Keep the table from growing without limit.
  const keys = Object.keys(h2h)
  if (keys.length > 160) {
    keys
      .map((k) => [k, h2h[k]])
      .sort((a, b) => a[1].meetings - b[1].meetings)
      .slice(0, keys.length - 120)
      .forEach(([k]) => delete h2h[k])
  }
}

// ---------------------------------------------------------------- log & news

export function pushLog(state, entry) {
  state.log.push({ id: state.log.length, ...entry })
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG)
}

export function pushNews(state, text, kind = 'info') {
  state.news.unshift({ year: state.year, week: state.week, text, kind })
  if (state.news.length > 60) state.news.length = 60
}

export function addHighlight(state, type, payload) {
  state.career.highlights.push(
    makeHighlight(type, { year: state.year, week: state.week, ...payload }),
  )
  pushNews(state, payload.title, 'highlight')
}

// ------------------------------------------------------------- weekly update

function weeklyPlayerUpdate(state, rng, playedThisWeek) {
  const p = state.player
  const physio = staffQuality(state.staff, 'physio')
  const psych = staffQuality(state.staff, 'psych')

  // Form always decays toward neutral, the same way it does for everyone else.
  p.form = p.form * 0.86 + rng.gauss(0, 0.55)

  if (!playedThisWeek) {
    const recovery = 13 + physio * 9 + (state.training.choice === 'rest' ? 6 : 0)
    p.fatigue = clamp(p.fatigue - recovery, 0, 100)
    p.morale = clamp(p.morale + 0.6, 0, 100)
  }

  if (p.injury) {
    p.injury.weeksLeft -= 1
    if (p.injury.weeksLeft <= 0) {
      const residual = residualDamage(p.injury, rng, physio)
      const lostBits = []
      for (const [k, v] of Object.entries(residual)) {
        p.ratings[k] = clamp(p.ratings[k] + v, 5, 99)
        lostBits.push(`${k} ${v}`)
      }
      pushLog(state, {
        week: state.week,
        year: state.year,
        kind: 'recovery',
        text: `Cleared to play again after ${p.injury.weeksTotal} weeks out (${p.injury.name}).`,
        detail: lostBits.length ? 'You are not quite the same player who went down.' : 'No lasting damage.',
      })
      if (p.injury.weeksTotal >= 12) {
        addHighlight(state, 'comeback', {
          title: `Back from ${p.injury.name.toLowerCase()}`,
          text: `${p.injury.weeksTotal} weeks away. Now you find out what is left.`,
          importance: 3,
        })
      }
      p.injury = null
      p.morale = clamp(p.morale + 5, 0, 100)
      refreshDerived(state)
    }
  } else {
    const setback = rollSetback(rng, p, { physio, psych, playedThisWeek })
    if (setback) {
      setback.startedWeek = state.week
      p.injury = setback
      p.morale = clamp(p.morale - (setback.out ? 12 : 8), 0, 100)
      pushLog(state, {
        week: state.week,
        year: state.year,
        kind: setback.out ? 'injury' : 'slump',
        text: `${setback.name} — ${setback.weeksTotal} weeks.`,
        detail: setback.text,
      })
      pushNews(state, `${setback.name}: out for roughly ${setback.weeksTotal} weeks.`, 'bad')
      if (setback.weeksTotal >= 12) {
        addHighlight(state, 'injury', {
          title: setback.name,
          text: setback.text,
          importance: 3,
        })
      }
      refreshDerived(state)
    }
  }

  // Burnout pressure from a relentless schedule.
  if (p.fatigue > 80) p.morale = clamp(p.morale - 1.2, 0, 100)
  if (p.morale < 25 && rng.chance(0.05)) {
    pushNews(state, 'You are not enjoying this. Something has to change.', 'bad')
  }
}

function trackRanking(state) {
  const p = state.player
  if (p.rank === 1) {
    state.career.weeksAtNo1 += 1
    state.seasonTotals.weeksAtNo1 += 1
  }
  if (p.rank <= 10) state.career.weeksTop10 += 1
  if (!state.career.bestRank || (p.rank && p.rank < state.career.bestRank)) {
    const prev = state.career.bestRank
    state.career.bestRank = p.rank
    if (p.rank === 1 && prev !== 1) {
      addHighlight(state, 'rank1', {
        title: 'World number one',
        text: 'For the first time, there is nobody above you on the list.',
        importance: 5,
      })
    } else if (p.rank <= 10 && (!prev || prev > 10)) {
      addHighlight(state, 'rank10', {
        title: 'Into the world top 10',
        text: `Ranked #${p.rank}. The invitations start arriving on their own now.`,
        importance: 3,
      })
    } else if (p.rank <= 50 && (!prev || prev > 50)) {
      addHighlight(state, 'rank50', {
        title: 'World top 50',
        text: `#${p.rank}. That number is the difference between playing majors and watching them.`,
        importance: 2,
      })
    }
  }
}

/**
 * Advance exactly one week. Returns a small summary of what happened so the
 * UI can decide whether to stop a multi-week sim.
 */
export function advanceOneWeek(state, rng) {
  if (state.phase !== 'season') return { stop: true, reason: 'not-in-season' }

  const week = state.week
  const weekEvents = state.season.filter((e) => e.week === week)
  const userEventId = Object.keys(state.entered).find((id) => {
    if (!state.entered[id]) return false
    const ev = state.season.find((e) => e.id === id)
    return ev && ev.week === week
  })
  let userEvent = userEventId ? state.season.find((e) => e.id === userEventId) : null
  const p = state.player

  // An injury that keeps you out withdraws you from the week's event.
  let withdrew = false
  if (userEvent && p.injury && p.injury.out) {
    withdrew = true
    pushLog(state, {
      week,
      year: state.year,
      kind: 'wd',
      text: `Withdrew from the ${userEvent.name} — ${p.injury.name}.`,
    })
    userEvent = null
  }

  let userResult = null
  const cache = new Map()
  const byPid = new Map()
  for (const wp of state.world.players) byPid.set(wp.pid, wp)
  for (const event of weekEvents) {
    const isUserEvent = userEvent && event.id === userEvent.id
    if (!isUserEvent && event.circuit === 'amateur') continue // amateur fields do not move the needle
    const outcome = runEvent(state, event, rng, { userPlays: isUserEvent, cache, byPid })
    // A circuit can run dry — e.g. a senior event in a year with no seniors.
    if (!outcome || !outcome.winner) continue
    const summary = {
      eventId: event.id,
      name: event.name,
      circuit: event.circuit,
      winner: outcome.winner,
      cutLine: outcome.cutLine,
      top: outcome.results.slice(0, isUserEvent ? 20 : 3).map(trimResult),
      isMajor: event.isMajor,
      week,
    }
    state.seasonResults[event.id] = summary
    if (isUserEvent) userResult = recordUserResult(state, event, outcome, rng, byPid)
    else if (event.isMajor) {
      pushNews(state, `${outcome.winner.name} wins the ${event.name} at ${fmtToPar(outcome.winner.toPar)}.`, 'major')
    }
  }

  if (!userEvent) {
    if (!withdrew && !p.injury) {
      pushLog(state, { week, year: state.year, kind: 'off', text: 'Week off.', detail: offWeekLine(rng) })
    } else if (p.injury) {
      pushLog(state, {
        week,
        year: state.year,
        kind: 'rehab',
        text: `Rehab — ${p.injury.name} (${p.injury.weeksLeft} weeks to go).`,
      })
    }
  }

  weeklyPlayerUpdate(state, rng, !!userEvent)
  driftForm(state.world.players, rng)
  decayRankings(state.world.players)
  // The player's own rank is refreshed every week; re-sorting the entire
  // world is only worth doing periodically.
  if (week % 4 === 0) recomputeRanks(state.world.players)
  else updateRankOf(p, state.world.players)
  trackRanking(state)
  refreshDerived(state)

  state.week += 1
  const seasonOver = state.week > PLAYING_WEEKS
  if (seasonOver) {
    endSeason(state, rng)
  }

  return {
    stop: seasonOver,
    userResult,
    seasonOver,
    playedEvent: !!userEvent,
    eventWasMajor: !!(userEvent && userEvent.isMajor),
  }
}

function trimResult(r) {
  return {
    pid: r.pid,
    name: r.name,
    flag: r.flag,
    pos: r.pos,
    tied: r.tied,
    toPar: r.toPar,
    madeCut: r.madeCut,
    money: r.money,
    points: r.points,
    isUser: r.isUser,
    rounds: r.rounds || null,
  }
}

function fmtToPar(v) {
  return v === 0 ? 'even par' : v > 0 ? `+${v}` : `${v}`
}

// ------------------------------------------------------------- season change

function endSeason(state, rng) {
  const p = state.player
  const st = state.seasonTotals

  // Money in, money out.
  const endorseGross = sponsorIncome(state.sponsors.deals)
  const endorse = netEndorsement(endorseGross, agentCut(state.staff))
  state.finance.cash += endorse.net
  state.finance.seasonEndorse += endorse.net
  state.career.endorsementTotal += endorse.net

  const expenses = annualExpenses({
    lifestyleId: state.finance.lifestyle,
    staffCost: annualStaffCost(state.staff),
    startsByCircuit: st.startsByCircuit,
    yearsElapsed: state.yearsElapsed,
    dependents: state.finance.dependents,
    amateur: state.player.status === 'amateur',
  })
  state.finance.cash -= expenses.total
  if (state.finance.passiveIncome) state.finance.cash += state.finance.passiveIncome

  const invest = investmentReturn(rng, Math.max(0, state.finance.cash))
  state.finance.cash += invest

  recomputeRanks(state.world.players, true)
  const seasonRow = {
    year: state.year,
    age: p.age,
    starts: st.starts,
    wins: st.wins,
    majors: st.majors,
    top10s: st.top10s,
    cuts: st.cuts,
    missedCuts: st.missedCuts,
    prizeGross: st.prizeGross,
    prizeNet: st.prizeNet,
    endorse: endorse.net,
    expenses: expenses.total,
    invest,
    cashEnd: Math.round(state.finance.cash),
    points: Math.round(st.points),
    rankEnd: p.rank,
    ovr: Math.round(overall(p.ratings) * 10) / 10,
    bestFinish: st.bestFinish,
    weeksAtNo1: st.weeksAtNo1,
    status: p.status,
  }
  state.career.seasons.push(seasonRow)
  if (p.rank && p.rank <= 10) state.career.seasonsTop10 += 1

  if (state.finance.cash < 0) {
    pushNews(state, 'You finished the year in the red. Something has to give.', 'bad')
    p.morale = clamp(p.morale - 8, 0, 100)
  }

  // A long major drought is a story in itself.
  if (state.career.majors > 0 && state.career.lastMajorWinYear && state.year - state.career.lastMajorWinYear === 8) {
    addHighlight(state, 'drought', {
      title: 'Eight years without a major',
      text: 'The questions in press conferences have changed. They all start the same way now.',
      importance: 3,
    })
  }

  prepareOffseason(state, false, rng)
}

/** Everything the player is asked to decide between seasons. */
function prepareOffseason(state, isFirst, rng) {
  state.phase = 'offseason'
  state.week = PLAYING_WEEKS + 1

  const cardNotes = isFirst ? [] : resolveCards(state, rng)

  // Sponsors roll over; underperformance costs deals.
  let sponsorNotes = []
  if (!isFirst) {
    const rolled = rollSponsors(rng, state.sponsors.deals, state.player, state.career)
    state.sponsors.deals = rolled.deals
    sponsorNotes = [
      ...rolled.expired.map((d) => `${d.brand} (${d.categoryName}) contract expired.`),
      ...rolled.dropped.map((d) => `${d.brand} dropped you after a poor season.`),
    ]
    for (const d of rolled.deals) {
      if (d.raised) sponsorNotes.push(`${d.brand} bumped your deal to ${fmtMoney(d.annual, { compact: true })}/yr.`)
    }
  }

  const rep = clamp(
    (state.career.majors * 0.14 + state.career.wins * 0.03 + (state.player.rank ? Math.max(0, 1 - Math.log10(state.player.rank) / 2.4) : 0)) * 1.1,
    0,
    1,
  )
  const taken = new Set(state.world.players.map((x) => x.name))
  state.staffMarket = generateStaffMarket(rng, rep, taken)
  state.equipCatalog = generateEquipmentCatalog(rng, state.yearsElapsed + 1, state.year + 1)
  state.sponsors.offers = generateOffers(
    rng,
    state.player,
    state.career,
    state.staff,
    state.sponsors.deals,
    state.yearsElapsed + 1,
    sponsorMultiplier(state.staff),
  )

  // Next season's fixtures, so the schedule can be built now.
  state.nextSeason = buildSeason(state.fixtures, state.yearsElapsed + 1, rng)
  state.nextEntered = {}
  state.qSchool = null

  state.career.rivals = pickRivals(state)

  state.offseason = {
    isFirst,
    cardNotes,
    sponsorNotes,
    lifeEvent: null,
    trainingLocked: false,
    reviewed: false,
    seasonBest: state.seasonLog
      .filter((r) => r.madeCut)
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .slice(0, 6),
  }

  // A life event, occasionally.
  if (!isFirst && rng.chance(0.22)) {
    const pool = LIFE_EVENTS.filter((e) => state.player.age >= e.minAge)
    const ev = rng.pick(pool)
    applyLifeEvent(state, ev)
    state.offseason.lifeEvent = ev
  }

  refreshDerived(state)
}

function applyLifeEvent(state, ev) {
  const e = ev.effect || {}
  if (e.morale) state.player.morale = clamp(state.player.morale + e.morale, 0, 100)
  if (e.dependents) state.finance.dependents += e.dependents
  if (e.cash) state.finance.cash += e.cash
  if (e.cashPct) state.finance.cash = Math.round(state.finance.cash * (1 + e.cashPct))
  if (e.income) state.finance.passiveIncome = (state.finance.passiveIncome || 0) + e.income
  if (e.mental) state.player.ratings.mental = clamp(state.player.ratings.mental + e.mental, 5, 99)
  pushNews(state, ev.text, 'life')
}

/** Commit the offseason and tee up the new year. */
export function startSeason(state) {
  const rng = Rng.from(state.rngState)
  const p = state.player
  const wasFirst = state.offseason?.isFirst

  if (!wasFirst) {
    // Age everyone, develop everyone.
    p.age += 1
    if (p.status === 'pro') p.proYears += 1
    const training = TRAINING_OPTIONS.find((t) => t.id === state.training.choice) || TRAINING_OPTIONS[8]
    const coachQ = staffQuality(state.staff, 'coach')
    const trainingPower = training.attr
      ? (1.15 + coachTrainingBonus(state.staff, training.attr)) * (0.75 + p.morale / 220)
      : 0
    const { ratings, deltas } = progressYear(p.ratings, p.potential, p.age, rng, {
      trainingAttr: training.attr,
      trainingPower,
      coach: coachQ,
      physio: staffQuality(state.staff, 'physio'),
      psych: staffQuality(state.staff, 'psych'),
      wear: clamp((p.starts - 340) / 850, 0, 0.8),
      injuryDrag: state.seasonTotals.injuryWeeks ? state.seasonTotals.injuryWeeks / 30 : 0,
    })
    p.ratings = ratings
    p.potential = jigglePotential(p.potential, ratings, p.age, rng)
    state.lastProgression = deltas
    const ovr = overall(ratings)
    const prevPeak = p.peakOvr
    p.peakOvr = Math.max(p.peakOvr, ovr)
    p.fatigue = clamp(p.fatigue + (training.fatigue || 0), 0, 100)
    if (training.healing) p.morale = clamp(p.morale + 8, 0, 100)

    if (ovr < prevPeak - 8 && !state.career.declineNoted) {
      state.career.declineNoted = true
      addHighlight(state, 'decline', {
        title: 'The decline starts here',
        text: 'The numbers say what your body has been saying for two years. You can still play. You just cannot do that any more.',
        importance: 3,
      })
    }
    if (ovr > prevPeak && p.age >= 33) {
      addHighlight(state, 'resurgence', {
        title: 'Best you have ever been — at ' + p.age,
        text: 'Nobody expected another gear at this age. You found one anyway.',
        importance: 4,
      })
    }

    progressWorld(state.world, rng, state.year)
    recomputeRanks(state.world.players, true)
    state.year += 1
    state.yearsElapsed += 1
  }

  // At some point the decision is made for you.
  if (p.age >= 66) {
    retire(state, 'ran out of years')
    state.rngState = rng.s
    return state
  }

  // Turning pro.
  if (p.status === 'amateur' && (state.pendingTurnPro || p.age >= 24)) {
    p.status = 'pro'
    p.homeCircuit = 'emerging'
    state.pendingTurnPro = false
    addHighlight(state, 'turnPro', {
      title: 'Turned professional',
      text: 'No more amateur status. From here, every cheque is yours and every week costs money.',
      importance: 3,
    })
  }

  state.season = state.nextSeason
  state.entered = { ...state.nextEntered }
  state.nextSeason = []
  state.nextEntered = {}
  state.seasonResults = {}
  state.seasonLog = []
  state.seasonTotals = emptySeasonTotals()
  state.finance.seasonPrizeGross = 0
  state.finance.seasonPrizeNet = 0
  state.finance.seasonEndorse = 0
  p.season = newSeasonStats()
  state.week = 1
  state.phase = 'season'
  state.offseason = null
  state.lastResult = null
  state.lastCircuitPlayed = null

  // Equipment sponsors keep you in their gear.
  const gearDeal = state.sponsors.deals.find((d) => d.providesGear && d.yearsLeft > 0)
  if (gearDeal) {
    state.bag = sponsorGear(rng, gearDeal.brand, gearDeal.gearQuality, state.yearsElapsed, state.year)
    pushNews(state, `${gearDeal.brand} shipped your new bag for the season.`, 'info')
  }

  pushLog(state, { week: 1, year: state.year, kind: 'season', text: `${state.year} season begins. Age ${p.age}.` })
  state.rngState = rng.s
  refreshDerived(state)
  recomputeRanks(state.world.players)
  return state
}

// ------------------------------------------------------------- sim commands

const MAX_WEEKS_GUARD = 5000

/** Run weeks until `predicate(state, summary)` says stop, or the season ends. */
export function simUntil(state, predicate, opts = {}) {
  const rng = Rng.from(state.rngState)
  let weeks = 0
  const events = []
  while (weeks < (opts.maxWeeks || MAX_WEEKS_GUARD)) {
    if (state.phase !== 'season') break
    const summary = advanceOneWeek(state, rng)
    weeks += 1
    if (summary.userResult) events.push(summary.userResult)
    if (summary.seasonOver) break
    if (predicate(state, summary)) break
  }
  state.rngState = rng.s
  refreshDerived(state)
  return { weeks, events }
}

export function simWeek(state) {
  return simUntil(state, () => true, { maxWeeks: 1 })
}

export function simNextEvent(state) {
  return simUntil(state, (_s, sum) => sum.playedEvent)
}

export function simToNextMajor(state) {
  return simUntil(state, (s, sum) => {
    if (sum.eventWasMajor) return true
    // Otherwise stop on the doorstep of the major week, entered or not, so the
    // player can still decide to try to qualify.
    return MAJOR_WEEKS.includes(s.week)
  })
}

export function simToOffseason(state) {
  return simUntil(state, () => false)
}

export function simSeason(state) {
  return simToOffseason(state)
}

export function findEnteredEventInWeek(state, week) {
  for (const id of Object.keys(state.entered)) {
    if (!state.entered[id]) continue
    const ev = state.season.find((e) => e.id === id)
    if (ev && ev.week === week) return ev
  }
  return null
}

export function nextEnteredEvent(state) {
  if (state.phase !== 'season') return null
  const candidates = state.season
    .filter((e) => state.entered[e.id] && e.week >= state.week)
    .sort((a, b) => a.week - b.week)
  return candidates[0] || null
}

export function nextMajor(state) {
  const list = state.phase === 'season' ? state.season : state.nextSeason
  const from = state.phase === 'season' ? state.week : 0
  return list.filter((e) => e.isMajor && e.week >= from).sort((a, b) => a.week - b.week)[0] || null
}

/**
 * Multi-year skip. Auto-fills schedules and auto-picks reasonable offseason
 * choices so long jumps do not stall on decisions.
 */
export function simYears(state, targetYear, opts = {}) {
  let guard = 0
  const out = { seasons: 0 }
  while (state.year < targetYear && !state.player.retired && guard++ < 60) {
    if (state.phase === 'offseason') {
      autoOffseason(state, opts)
      startSeason(state)
    }
    simToOffseason(state)
    out.seasons += 1
    if (state.player.retired) break
  }
  return out
}

export function simToAge(state, targetAge, opts = {}) {
  const years = targetAge - state.player.age
  if (years <= 0) return { seasons: 0 }
  return simYears(state, state.year + years, opts)
}

/** Sensible defaults so "sim 10 years" does something reasonable. */
export function autoOffseason(state, opts = {}) {
  const rng = Rng.from(state.rngState)
  state.rngState = rng.s
  if (state.player.status === 'amateur' && state.player.age >= 21) state.pendingTurnPro = true
  // No card and no exemption means Q-School, every year, until it works.
  const hasCard = ['domestic', 'intl', 'asian', 'emerging'].some((c) => cardStatus(state, c) === 'full')
  const goingPro = state.player.status === 'pro' || state.pendingTurnPro
  if (!hasCard && goingPro && !state.qSchool) enterQSchool(state)
  // Re-evaluate every year — a focus chosen five seasons ago is rarely still
  // the right one.
  state.training.choice = pickAutoTraining(state)
  // Take the best sponsorship offers that are on the table.
  for (const offer of state.sponsors.offers.slice()) {
    acceptOffer(state, offer.id)
  }
  autoBudget(state)
  autoHireStaff(state)
  autoBuyEquipment(state)
  autoFillSchedule(state, opts.targetStarts)
}

/** Live within your means — what a sensible person would do between seasons. */
function autoBudget(state) {
  const burn = currentBurn(state)
  const cash = state.finance.cash
  const runway = burn > 0 ? cash / burn : 99
  const tiers = ['spartan', 'modest', 'comfortable', 'luxury', 'superstar']
  let target
  if (runway < 1) target = 'spartan'
  else if (runway < 3) target = 'modest'
  else if (runway < 12) target = 'comfortable'
  else if (runway < 40) target = 'luxury'
  else target = 'superstar'
  state.finance.lifestyle = tiers.includes(target) ? target : 'modest'
  if (runway < 1) {
    // Cut the staff you cannot pay for.
    for (const role of ['psych', 'physio', 'coach']) {
      if (state.staff[role] && state.finance.cash < burn * 0.5) fireStaff(state, role)
    }
  }
}

function pickAutoTraining(state) {
  const p = state.player
  if (p.fatigue > 62 || p.morale < 32) return 'rest'
  let worst = null
  let gap = -Infinity
  for (const k of ATTR_KEYS) {
    const g = p.potential[k] - p.ratings[k]
    if (g > gap) {
      gap = g
      worst = k
    }
  }
  const opt = TRAINING_OPTIONS.find((t) => t.attr === worst)
  return opt ? opt.id : 'balanced'
}

function autoHireStaff(state) {
  const budget = Math.max(0, state.finance.cash * 0.22 + state.finance.seasonEndorse * 0.3)
  let spent = annualStaffCost(state.staff)
  const priority = ['caddie', 'coach', 'physio', 'psych', 'agent']
  for (const role of priority) {
    const market = state.staffMarket?.[role] || []
    const current = state.staff[role]
    for (const cand of market) {
      if (current && cand.q <= current.q + 0.06) continue
      const extra = (cand.salary || 0) - (current?.salary || 0)
      if (spent + extra > budget) continue
      state.staff[role] = { ...cand, yearsWithYou: 0 }
      spent += extra
      break
    }
  }
}

function autoBuyEquipment(state) {
  const gearDeal = state.sponsors.deals.find((d) => d.providesGear && d.yearsLeft > 0)
  if (gearDeal) return
  const budget = state.finance.cash * 0.03
  let spent = 0
  for (const slot of Object.keys(state.equipCatalog || {})) {
    const best = state.equipCatalog[slot][0]
    const cur = state.bag[slot]
    if (best && (!cur || best.tech > cur.tech + 1) && spent + best.price <= budget) {
      state.bag[slot] = { ...best }
      spent += best.price
    }
  }
  state.finance.cash -= spent
}

// ------------------------------------------------- offseason player commands

export function setTraining(state, id) {
  state.training.choice = id
  return state
}

export function setPlaystyle(state, id) {
  state.player.playstyle = id
  return state
}

export function setLifestyle(state, id) {
  state.finance.lifestyle = id
  return state
}

export function hireStaff(state, role, candidateId) {
  const cand = (state.staffMarket?.[role] || []).find((c) => c.id === candidateId)
  if (!cand) return state
  state.staff[role] = { ...cand, yearsWithYou: 0 }
  pushNews(state, `Hired ${cand.name} as your ${role}.`, 'info')
  return state
}

export function fireStaff(state, role) {
  const s = state.staff[role]
  if (!s) return state
  // Paying someone off mid-contract costs a quarter of their salary.
  state.finance.cash -= Math.round((s.salary || 0) * 0.25)
  state.staff[role] = null
  pushNews(state, `Let ${s.name} go.`, 'info')
  return state
}

export function buyEquipment(state, slot, itemId) {
  const item = (state.equipCatalog?.[slot] || []).find((i) => i.id === itemId)
  if (!item) return state
  if (state.finance.cash < item.price) return state
  state.finance.cash -= item.price
  state.bag[slot] = { ...item }
  refreshDerived(state)
  return state
}

export function acceptOffer(state, offerId) {
  const offer = state.sponsors.offers.find((o) => o.id === offerId)
  if (!offer) return state
  state.sponsors.offers = state.sponsors.offers.filter((o) => o.id !== offerId)
  const deal = { ...offer, signedYear: state.year + 1 }
  state.sponsors.deals.push(deal)
  if (offer.signingBonus) {
    const net = netEndorsement(offer.signingBonus, agentCut(state.staff)).net
    state.finance.cash += net
    state.career.endorsementTotal += net
  }
  pushNews(state, `Signed with ${offer.brand} — ${fmtMoney(offer.annual, { compact: true })}/yr for ${offer.years} years.`, 'money')
  if (!state.career.firstSponsorYear) {
    state.career.firstSponsorYear = state.year
    addHighlight(state, 'sponsor', {
      title: `First real endorsement — ${offer.brand}`,
      text: `${fmtMoney(offer.annual, { compact: true })} a year, whether you make a cut or not.`,
      importance: 2,
    })
  }
  return state
}

export function declineOffer(state, offerId) {
  state.sponsors.offers = state.sponsors.offers.filter((o) => o.id !== offerId)
  return state
}

export function negotiateOffer(state, offerId) {
  const rng = Rng.from(state.rngState)
  const offer = state.sponsors.offers.find((o) => o.id === offerId)
  if (!offer || offer.negotiated) {
    state.rngState = rng.s
    return { outcome: 'none' }
  }
  const m = marketability(state.player, state.career)
  const res = negotiate(rng, offer, m, state.staff)
  if (res.outcome === 'withdrawn') {
    state.sponsors.offers = state.sponsors.offers.filter((o) => o.id !== offerId)
    pushNews(state, `${offer.brand} walked away from the table.`, 'bad')
  } else {
    state.sponsors.offers = state.sponsors.offers.map((o) => (o.id === offerId ? res.offer : o))
  }
  state.rngState = rng.s
  return res
}

export function enterQSchool(state) {
  if (state.qSchool) return state.qSchool
  const rng = Rng.from(state.rngState)
  state.finance.cash -= Q_SCHOOL_FEE
  const result = runQSchool(state, rng)
  state.qSchool = result
  pushNews(state, result.text, result.tier === 'none' ? 'bad' : 'good')
  if (result.tier === 'domestic') {
    addHighlight(state, 'qschool', {
      title: 'Earned a Domestic Tour card',
      text: 'Six rounds, one week, the whole next decade riding on it. You got through.',
      importance: 4,
    })
  }
  state.rngState = rng.s
  return result
}

export function turnPro(state) {
  state.pendingTurnPro = true
  return state
}

// ------------------------------------------------------------ schedule build

export function toggleEntry(state, eventId) {
  const target = state.phase === 'offseason' ? state.nextEntered : state.entered
  const list = state.phase === 'offseason' ? state.nextSeason : state.season
  const ev = list.find((e) => e.id === eventId)
  if (!ev) return state
  if (target[eventId]) {
    delete target[eventId]
    return state
  }
  // Only one event a week.
  for (const id of Object.keys(target)) {
    const other = list.find((e) => e.id === id)
    if (other && other.week === ev.week) delete target[id]
  }
  target[eventId] = true
  return state
}

export function clearSchedule(state) {
  if (state.phase === 'offseason') state.nextEntered = {}
  else state.entered = {}
  return state
}

/**
 * Greedy schedule builder: best event you are eligible for each week, with
 * rest weeks spaced in so you do not arrive at the majors exhausted.
 */
export function autoFillSchedule(state, targetStarts) {
  const offseason = state.phase === 'offseason'
  const list = offseason ? state.nextSeason : state.season
  const target = offseason ? {} : { ...state.entered }
  const fromWeek = offseason ? 1 : state.week
  const p = state.player
  const desired = targetStarts || defaultTargetStarts(p)

  // Evaluate against next season's projected status.
  const probe = offseason ? { ...state, year: state.year + 1 } : state
  const byWeek = new Map()
  for (const ev of list) {
    if (ev.week < fromWeek) continue
    const elig = checkEligibility(probe, ev)
    if (!elig.ok) continue
    const score = eventAttractiveness(ev, p)
    const cur = byWeek.get(ev.week)
    if (!cur || score > cur.score) byWeek.set(ev.week, { ev, score })
  }

  const ranked = Array.from(byWeek.values()).sort((a, b) => b.score - a.score)
  let count = Object.keys(target).length
  const usedWeeks = new Set(
    Object.keys(target)
      .map((id) => list.find((e) => e.id === id)?.week)
      .filter(Boolean),
  )
  // Majors first, always.
  for (const { ev } of ranked) {
    if (!ev.isMajor) continue
    if (usedWeeks.has(ev.week)) continue
    target[ev.id] = true
    usedWeeks.add(ev.week)
    count++
  }
  for (const { ev } of ranked) {
    if (count >= desired) break
    if (usedWeeks.has(ev.week)) continue
    // Never play more than three weeks in a row.
    if (usedWeeks.has(ev.week - 1) && usedWeeks.has(ev.week - 2) && usedWeeks.has(ev.week - 3)) continue
    target[ev.id] = true
    usedWeeks.add(ev.week)
    count++
  }

  if (offseason) state.nextEntered = target
  else state.entered = target
  return state
}

function defaultTargetStarts(p) {
  if (p.age >= 48) return 20
  if (p.age >= 42) return 22
  if (p.status === 'amateur') return 18
  return 25
}

function eventAttractiveness(ev, p) {
  const prestige = CIRCUITS[ev.circuit].prestige
  const money = Math.log10(Math.max(1, ev.purse)) / 7
  let score = prestige * 2.2 + money * 1.6 + (ev.isMajor ? 6 : 0) + (ev.flagship ? 0.8 : 0)
  // An amateur cannot cash a cheque, so there is no point paying entry fees to
  // play for money you are not allowed to keep.
  if (p.status === 'amateur') {
    if (ev.circuit === 'amateur') score += 4
    else score -= 1.5
  }
  return score
}

/** Godmode / manual entry: play any event in the current week immediately. */
export function playEventNow(state, eventId) {
  if (state.phase !== 'season') return { ok: false, reason: 'Not in season' }
  const ev = state.season.find((e) => e.id === eventId)
  if (!ev) return { ok: false, reason: 'No such event' }
  if (ev.week < state.week) return { ok: false, reason: 'That week has passed' }
  // Jump forward to its week, then make sure the player is entered.
  if (state.week < ev.week) simUntil(state, (s) => s.week >= ev.week)
  if (state.phase !== 'season') return { ok: false, reason: 'Season ended' }
  for (const id of Object.keys(state.entered)) {
    const other = state.season.find((e) => e.id === id)
    if (other && other.week === ev.week) delete state.entered[id]
  }
  state.entered[ev.id] = true
  const res = simWeek(state)
  return { ok: true, ...res }
}

// -------------------------------------------------------------- qualifying

export function attemptQualifier(state, eventId) {
  const rng = Rng.from(state.rngState)
  const list = state.phase === 'offseason' ? state.nextSeason : state.season
  const ev = list.find((e) => e.id === eventId)
  if (!ev) {
    state.rngState = rng.s
    return { ok: false }
  }
  const elig = checkEligibility(state, ev)
  const chance = elig.qualifier || 0
  const success = rng.chance(chance)
  state.finance.cash -= 800
  if (success) {
    const target = state.phase === 'offseason' ? state.nextEntered : state.entered
    for (const id of Object.keys(target)) {
      const other = list.find((e) => e.id === id)
      if (other && other.week === ev.week) delete target[id]
    }
    target[ev.id] = true
    pushNews(state, `Qualified for the ${ev.name}.`, 'good')
  } else {
    pushNews(state, `Missed out in qualifying for the ${ev.name}.`, 'bad')
  }
  state.rngState = rng.s
  return { ok: success, chance }
}

// ------------------------------------------------------------------ retiring

export function retirementPressure(state) {
  const p = state.player
  const burn = currentBurn(state)
  const coast = coastStatus(state.finance.cash, burn)
  const ovrDrop = p.peakOvr - overall(p.ratings)
  const reasons = []
  let pressure = 0

  if (p.age >= 40) {
    pressure += (p.age - 39) * 5
    reasons.push({ label: 'Age', detail: `${p.age} years old`, weight: (p.age - 39) * 5 })
  }
  if (ovrDrop > 6) {
    pressure += ovrDrop * 1.8
    reasons.push({ label: 'Decline', detail: `${ovrDrop.toFixed(1)} below your peak`, weight: ovrDrop * 1.8 })
  }
  if (state.finance.cash < 0) {
    pressure += 22
    reasons.push({ label: 'Money', detail: 'You are in debt', weight: 22 })
  }
  if (coast.reached) {
    pressure += 14
    reasons.push({ label: coast.reached.label, detail: coast.reached.blurb, weight: 14 })
  }
  if (p.morale < 35) {
    pressure += (35 - p.morale) * 0.8
    reasons.push({ label: 'Burnout', detail: 'You are not enjoying it', weight: (35 - p.morale) * 0.8 })
  }
  if (p.injury && p.injury.weeksTotal >= 14) {
    pressure += 12
    reasons.push({ label: 'Health', detail: p.injury.name, weight: 12 })
  }
  const chasing = []
  if (state.career.majors === 0 && p.age < 48) {
    chasing.push('You have never won a major.')
    pressure -= 12
  }
  if (state.career.wins === 0) {
    chasing.push('You have never won on tour.')
    pressure -= 8
  }
  if (p.rank && p.rank <= 25) {
    chasing.push(`You are still ranked #${p.rank} in the world.`)
    pressure -= 15
  }
  if (state.career.majors >= 1 && state.career.majors < 4 && p.age < 45) {
    chasing.push('Another major would change how you are remembered.')
    pressure -= 5
  }

  return { pressure: Math.round(clamp(pressure, 0, 100)), reasons, chasing, coast, burn }
}

export function retire(state, reason = 'chose to') {
  const p = state.player
  p.retired = true
  p.retiredYear = state.year
  state.phase = 'retired'
  state.career.retiredYear = state.year
  state.career.retiredAge = p.age
  state.career.legacy = legacyScore(state.career, p)
  addHighlight(state, 'retire', {
    title: `Retired at ${p.age}`,
    text: `${state.career.wins} wins, ${state.career.majors} majors, ${state.career.starts} starts. You ${reason}.`,
    importance: 6,
  })
  pushNews(state, `${p.name} announces retirement at ${p.age}.`, 'major')
  recomputeRanks(state.world.players)
  return state
}

export function unretire(state) {
  state.player.retired = false
  state.player.retiredYear = null
  state.phase = state.season.length && state.week <= PLAYING_WEEKS ? 'season' : 'offseason'
  if (state.phase === 'offseason' && !state.offseason) {
    const rng = Rng.from(state.rngState)
    prepareOffseason(state, false, rng)
    state.rngState = rng.s
  }
  return state
}

// ------------------------------------------------------------------ godmode

export const god = {
  setRating(state, attr, value) {
    state.player.ratings[attr] = clamp(Math.round(value), 1, 99)
    state.player.potential[attr] = Math.max(state.player.potential[attr], state.player.ratings[attr])
    state.player.peakOvr = Math.max(state.player.peakOvr, overall(state.player.ratings))
    refreshDerived(state)
  },
  set(state, key, value) {
    state.player[key] = value
    if (key === 'age') state.player.birthYear = state.year - value
    refreshDerived(state)
  },
  heal(state) {
    state.player.injury = null
    refreshDerived(state)
  },
  inflict(state, ailmentId) {
    const rng = Rng.from(state.rngState)
    const def = AILMENTS.find((a) => a.id === ailmentId)
    if (!def) return
    const weeks = rng.int(def.weeks[0], def.weeks[1])
    state.player.injury = {
      id: def.id,
      name: def.name,
      kind: def.kind,
      out: def.out,
      weeksTotal: weeks,
      weeksLeft: weeks,
      severity: 1,
      pen: def.pen,
      text: def.text,
      startedWeek: state.week,
    }
    state.rngState = rng.s
    refreshDerived(state)
  },
  maxPotential(state) {
    for (const k of ATTR_KEYS) state.player.potential[k] = 99
  },
  matchPotential(state) {
    for (const k of ATTR_KEYS) state.player.ratings[k] = state.player.potential[k]
    state.player.peakOvr = Math.max(state.player.peakOvr, overall(state.player.ratings))
    refreshDerived(state)
  },
  addCash(state, v) {
    state.finance.cash += v
  },
  setCard(state, circuit, status) {
    state.cards[circuit] = { status, until: status === 'none' ? 0 : state.year + 10 }
  },
  majorExempt(state) {
    state.majorExemptUntil = state.year + 5
  },
  fillOffers(state) {
    const rng = Rng.from(state.rngState)
    state.sponsors.offers = generateOffers(
      rng,
      state.player,
      state.career,
      state.staff,
      state.sponsors.deals,
      state.yearsElapsed,
      sponsorMultiplier(state.staff),
    )
    state.rngState = rng.s
  },
  /** A large one-off quality bonus applied to the player's next start. */
  forceWin(state) {
    state.godBoost = 45
    pushNews(state, 'Something has come over you this week.', 'info')
  },
  spawnMajor(state) {
    const week = Math.min(PLAYING_WEEKS, state.week + 1)
    const id = `god_major_${state.year}_${week}_${state.season.length}`
    state.season.push({
      id,
      circuit: 'major',
      name: `The ${state.year} Invitational Major`,
      shortName: 'Bonus Major',
      venue: 'Somewhere Extraordinary',
      city: null,
      week,
      courseType: 'classic',
      difficulty: 1.18,
      purse: 22000000,
      fieldSize: 156,
      cutSize: 60,
      flagship: true,
      isMajor: true,
      seniorMajor: false,
      blurb: 'A fifth major, conjured out of nothing. Nobody is asking questions.',
    })
    for (const eid of Object.keys(state.entered)) {
      const other = state.season.find((e) => e.id === eid)
      if (other && other.week === week) delete state.entered[eid]
    }
    state.entered[id] = true
    pushNews(state, `A fifth major has appeared on the calendar in week ${week}.`, 'major')
  },
}

// ----------------------------------------------------------------- selectors

export function seasonSummary(state) {
  const st = state.seasonTotals
  return {
    ...st,
    remainingEvents: state.season.filter((e) => state.entered[e.id] && e.week >= state.week).length,
    weeksLeft: Math.max(0, PLAYING_WEEKS - state.week + 1),
  }
}

export function upcomingSchedule(state, limit = 8) {
  if (state.phase !== 'season') return []
  return state.season
    .filter((e) => state.entered[e.id] && e.week >= state.week)
    .sort((a, b) => a.week - b.week)
    .slice(0, limit)
}

/**
 * Nominate the two or three players this career is actually measured against:
 * similar age, lots of shared leaderboards, and a close overall record.
 */
export function pickRivals(state) {
  const p = state.player
  const existing = new Map((state.career.rivals || []).map((r) => [r.pid, r]))
  const scored = Object.entries(state.career.h2h)
    .map(([pid, r]) => {
      const decided = r.beat + r.lost
      if (r.meetings < 8 || decided < 5) return null
      const ageGap = Math.abs((r.age || p.age) - p.age)
      const balance = 1 - Math.abs(r.beat - r.lost) / decided
      const score = Math.log10(r.meetings) * 3 + balance * 4 + 3 / (1 + ageGap * 0.6) + (r.majors || 0) * 0.4
      return { pid: Number(pid), name: r.name, flag: r.flag, score, meetings: r.meetings }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return scored.map((r) => ({
    pid: r.pid,
    name: r.name,
    flag: r.flag,
    since: existing.get(r.pid)?.since || state.year,
  }))
}

export function rivalTable(state, limit = 12) {
  const rows = Object.entries(state.career.h2h)
    .map(([pid, r]) => ({ pid: Number(pid), ...r, diff: r.beat - r.lost }))
    .filter((r) => r.meetings >= 4)
  rows.sort((a, b) => b.meetings - a.meetings)
  return rows.slice(0, limit)
}

export function allTimeBoard(state) {
  const fromWorld = state.world.players
    .filter((p) => p.majors > 0 || p.wins >= 8 || p.isUser)
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      flag: p.flag,
      wins: p.wins,
      majors: p.majors,
      peakOvr: Math.round(p.peakOvr * 10) / 10,
      careerEarnings: p.careerEarnings,
      isUser: !!p.isUser,
      active: !p.retired,
    }))
  const legends = state.world.legends.map((l) => ({ ...l, active: false }))
  return [...legends, ...fromWorld].sort((a, b) => b.majors - a.majors || b.wins - a.wins).slice(0, 40)
}

export function tourAverages(state) {
  const pros = state.world.players.filter(
    (p) => !p.retired && !p.isUser && (p.homeCircuit === 'domestic' || p.homeCircuit === 'intl'),
  )
  if (!pros.length) return null
  const avg = {}
  for (const k of ATTR_KEYS) {
    avg[k] = Math.round((pros.reduce((a, p) => a + p.ratings[k], 0) / pros.length) * 10) / 10
  }
  avg.ovr = Math.round((pros.reduce((a, p) => a + overall(p.ratings), 0) / pros.length) * 10) / 10
  return avg
}

export { careerPhase, coastStatus, checkEligibility, cardStatus, legacyScore }
