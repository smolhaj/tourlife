// Scenario tests: play the game the way people will, and assert the things
// that should always be true. `node scripts/scenarios.mjs`
//
// This is not a unit-test suite — it drives whole careers through the public
// engine API and checks invariants after every season.

import * as E from '../src/game/engine.js'
import { ATTR_KEYS, SENIOR_AGE, TRAINING_OPTIONS, CIRCUITS, COURSE_TYPES, PAYOUT_PCT, SPONSOR_CATEGORIES, STAFF_ROLES, TRAVEL_ZONE, zoneGap } from '../src/game/constants.js'
import { overall, progressYear, emptyRatings } from '../src/game/ratings.js'
import { simTournament, makeEntrant } from '../src/game/tournament.js'
import { coachTrainingBonus, staffMatchdayEffect, qualityEffect, qualityOf, effectiveQ, rapport } from '../src/game/staff.js'
import { exportSave, importSave, cloneState } from '../src/game/save.js'
import { checkEligibility, cardStatus } from '../src/game/eligibility.js'
import { fmtMoney, debtInterest, backerOffer, splitPrize } from '../src/game/finance.js'
import { dealValue, generateOffers, MAX_CONCURRENT_DEALS } from '../src/game/sponsors.js'
import { Rng, clamp } from '../src/game/rng.js'
import { conditionsLabel, rollConditions, seasonPhase, NORMAL_WIND } from '../src/game/weather.js'
import { venueEdge, familiarityLabel } from '../src/game/venue.js'
import { beddingIn, equipmentBonus, equipItem, startsToSettle, sponsorGear } from '../src/game/equipment.js'
import { CUPS, CUP_WEEK, cupForYear, recordText, selectTeam, simCup } from '../src/game/teamcup.js'
import { REGIONS } from '../src/game/names.js'

const tourAvgOvr = (s) => {
  const a = s.world.players.filter((p) => !p.retired && !p.isUser)
  return a.reduce((x, p) => x + overall(p.ratings), 0) / Math.max(1, a.length)
}

const COURSE_TYPE_LIST = Object.keys(COURSE_TYPES)
const clamp01to99 = (v) => clamp(v, 1, 99)

let pass = 0
let fail = 0
const failures = []

function check(name, cond, detail) {
  if (cond) {
    pass++
  } else {
    fail++
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`   ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(t) {
  console.log(`\n=== ${t} ===`)
}

/** Walk the whole state looking for NaN/undefined numerics that would render as junk. */
function findBadNumbers(obj, path = '', seen = new Set(), out = []) {
  if (out.length > 6 || obj === null || typeof obj !== 'object') return out
  if (seen.has(obj)) return out
  seen.add(obj)
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) out.push(`${p}=${v}`)
    } else if (typeof v === 'object') {
      findBadNumbers(v, p, seen, out)
    }
  }
  return out
}

function invariants(s, label) {
  const bad = findBadNumbers(s)
  check(`${label}: no NaN/Infinity in state`, bad.length === 0, bad.join(', '))

  for (const k of ATTR_KEYS) {
    const v = s.player.ratings[k]
    check(`${label}: ${k} in range`, v >= 1 && v <= 99, `${k}=${v}`)
  }

  const c = s.career
  const seasonStarts = c.seasons.reduce((a, r) => a + r.starts, 0)
  check(
    `${label}: season starts sum to career starts`,
    seasonStarts <= c.starts,
    `seasons=${seasonStarts} career=${c.starts}`,
  )
  check(
    `${label}: every start recorded in allResults`,
    c.allResults.length === c.starts,
    `allResults=${c.allResults.length} starts=${c.starts}`,
  )
  const winRows = c.allResults.filter((r) => r.pos === 1 && r.circuit !== 'amateur' && r.circuit !== 'senior')
  check(
    `${label}: win count matches win log`,
    winRows.length === c.wins && c.winsList.filter((w) => w.circuit !== 'amateur' && w.circuit !== 'senior').length === c.wins,
    `results=${winRows.length} career.wins=${c.wins} list=${c.winsList.length}`,
  )
  const majorRows = c.allResults.filter((r) => r.pos === 1 && r.isMajor)
  check(`${label}: majors match`, majorRows.length === c.majors, `results=${majorRows.length} career=${c.majors}`)
  check(`${label}: cuts never exceed starts`, c.cutsMade <= c.starts)
  check(`${label}: top10s never exceed cuts`, c.top10s <= c.cutsMade)
  if (!s.player.retired) {
    check(`${label}: has a world ranking`, s.player.rank >= 1, `rank=${s.player.rank}`)
  }
}

/** Hire the best staff the bank can stand — what the offseason UI steers you to. */
function hireBest(s) {
  for (const role of ['coach', 'caddie', 'physio', 'psych', 'agent']) {
    const cur = s.staff[role]
    for (const c of s.staffMarket?.[role] || []) {
      if (cur && c.q <= cur.q) continue
      if ((c.salary || 0) > Math.max(60000, s.finance.cash * 0.25)) continue
      E.hireStaff(s, role, c.id)
      break
    }
  }
}

function weakestTraining(s) {
  let worst = 'balanced'
  let gap = -Infinity
  for (const k of ATTR_KEYS) {
    const g = s.player.potential[k] - s.player.ratings[k]
    if (g > gap) { gap = g; worst = k }
  }
  return worst
}

// ---------------------------------------------------------------------------
section('SCENARIO 1 — the intended ladder, played deliberately')
// An amateur who turns pro, goes to Q-School, and grinds up. No auto-offseason:
// every decision made explicitly, the way a player would.
{
  const s = E.newGame({ name: 'Ladder Test', seed: 20260814, talent: 0.66, age: 21 })
  check('starts as an amateur', s.player.status === 'amateur')
  check('starts in the offseason', s.phase === 'offseason')
  check('has a schedule to build', s.nextSeason.length > 100, `${s.nextSeason.length} events`)

  // Season 1: amateur.
  E.autoFillSchedule(s, 20)
  const amCount = Object.keys(s.nextEntered).length
  check('amateur can fill a schedule', amCount >= 10, `${amCount} entered`)
  const amOnly = Object.keys(s.nextEntered).every((id) => {
    const ev = s.nextSeason.find((e) => e.id === id)
    return ev.circuit === 'amateur' || ev.circuit === 'emerging'
  })
  check('amateur only enters events open to amateurs', amOnly)

  E.setTraining(s, 'irons')
  E.startSeason(s)
  check('season 1 begins in season phase', s.phase === 'season')
  E.simToOffseason(s)
  check('season 1 completed', s.phase === 'offseason')
  check('amateur earned no prize money', s.finance.seasonPrizeGross === 0, fmtMoney(s.finance.seasonPrizeGross))
  invariants(s, 'after amateur season')

  // Turn pro and go to Q-School.
  E.turnPro(s)
  const q = E.enterQSchool(s)
  check('Q-School returns an outcome', !!q.tier, JSON.stringify(q.tier))
  hireBest(s)
  E.autoFillSchedule(s, 26)
  E.startSeason(s)
  check('is now a professional', s.player.status === 'pro')

  // Grind to 34, deciding everything explicitly each year.
  let sawEmerging = false
  let sawDomestic = false
  let sawMajor = false
  while (s.player.age < 34 && !s.player.retired) {
    E.simToOffseason(s)
    for (const r of s.seasonLog) {
      if (r.circuit === 'emerging') sawEmerging = true
      if (r.circuit === 'domestic') sawDomestic = true
      if (r.isMajor) sawMajor = true
    }
    invariants(s, `age ${s.player.age}`)
    E.setTraining(s, weakestTraining(s))
    for (const o of s.sponsors.offers.slice()) E.acceptOffer(s, o.id)
    hireBest(s)
    E.autoFillSchedule(s, 26)
    E.startSeason(s)
  }
  console.log(
    `   played to ${s.player.age}: rank #${s.player.rank}, ${s.career.wins} wins, ` +
      `${s.career.majors} majors, ${fmtMoney(s.finance.cash, { compact: true })} bank`,
  )
  check('reached the Emerging Circuit', sawEmerging)
  check('climbed to the Domestic Tour', sawDomestic, `cards=${JSON.stringify(s.cards.domestic)}`)
  check('never stranded with nowhere to play', s.career.starts > 200, `${s.career.starts} starts`)

  // Whether one particular career cracks the major exemption is close to a coin
  // flip at this talent level, so ask the ladder the question it is actually
  // meant to answer: does managing a good prospect well get you to the majors,
  // generally? A single seed made this assertion pass or fail on luck.
  let sawMajorIn = 0
  const MAJOR_SEEDS = 8
  for (let seed = 0; seed < MAJOR_SEEDS; seed++) {
    const m = E.newGame({ name: 'Ladder Majors', seed: 20260814 + seed * 1013, talent: 0.66, age: 21 })
    E.autoFillSchedule(m, 20)
    E.startSeason(m)
    E.simToOffseason(m)
    E.turnPro(m)
    E.enterQSchool(m)
    hireBest(m)
    E.autoFillSchedule(m, 26)
    E.startSeason(m)
    let hit = false
    while (m.player.age < 34 && !m.player.retired) {
      E.simToOffseason(m)
      for (const r of m.seasonLog) if (r.isMajor) hit = true
      E.setTraining(m, weakestTraining(m))
      for (const o of m.sponsors.offers.slice()) E.acceptOffer(m, o.id)
      hireBest(m)
      E.autoFillSchedule(m, 26)
      E.startSeason(m)
    }
    if (hit) sawMajorIn += 1
  }
  // Measured rate is 10 in 12, so 5 of 8 leaves plenty of headroom for noise
  // while still collapsing if the ladder itself breaks.
  check('a well-managed prospect reaches the majors', sawMajorIn >= 5,
    `only ${sawMajorIn}/${MAJOR_SEEDS} careers played one`)

  // The same prospect, same seed, managed badly: no staff, one attribute
  // trained forever. It should still be a playable career, and clearly worse.
  const bad = E.newGame({ name: 'Ladder Test', seed: 20260814, talent: 0.66, age: 21 })
  E.autoFillSchedule(bad, 20)
  E.startSeason(bad)
  E.simToOffseason(bad)
  E.turnPro(bad)
  E.enterQSchool(bad)
  E.autoFillSchedule(bad, 26)
  E.startSeason(bad)
  while (bad.player.age < 34 && !bad.player.retired) {
    E.simToOffseason(bad)
    E.setTraining(bad, 'putting')
    E.autoFillSchedule(bad, 26)
    E.startSeason(bad)
  }
  console.log(`   same prospect managed badly: rank #${bad.player.rank}, ${bad.career.wins} wins, ` +
    `${fmtMoney(bad.finance.cash, { compact: true })} (vs #${s.player.rank}, ${s.career.wins} wins, ` +
    `${fmtMoney(s.finance.cash, { compact: true })} managed well)`)
  check('bad management is still a playable career', bad.career.starts > 150 && !bad.player.retired,
    `${bad.career.starts} starts`)

  // Managing a career well beats neglecting it — but on any single seed it is a
  // coin flip often enough to matter, and this pair is the one seed in ten
  // where neglect happens to come out ahead. Ask it of six pairs instead.
  // (Measured over ten: the managed career wins 9 times on both counts.)
  let betterRank = 0
  let betterCash = 0
  const PAIRS = 6
  for (let i = 0; i < PAIRS; i++) {
    const seed = 20260814 + i * 1013
    const g = E.newGame({ name: 'Managed', seed, talent: 0.66, age: 21 })
    const n = E.newGame({ name: 'Neglected', seed, talent: 0.66, age: 21 })
    for (const [c, managed] of [[g, true], [n, false]]) {
      E.autoFillSchedule(c, 20)
      E.startSeason(c)
      E.simToOffseason(c)
      E.turnPro(c)
      E.enterQSchool(c)
      if (managed) hireBest(c)
      E.autoFillSchedule(c, 26)
      E.startSeason(c)
      while (c.player.age < 34 && !c.player.retired) {
        E.simToOffseason(c)
        E.setTraining(c, managed ? weakestTraining(c) : 'putting')
        if (managed) {
          for (const o of c.sponsors.offers.slice()) E.acceptOffer(c, o.id)
          hireBest(c)
        }
        E.autoFillSchedule(c, 26)
        E.startSeason(c)
      }
    }
    if (g.player.rank <= n.player.rank) betterRank += 1
    if (g.finance.cash >= n.finance.cash) betterCash += 1
  }
  check('good management usually produces a better ranking', betterRank >= 4, `${betterRank}/${PAIRS}`)
  check('good management usually produces more money', betterCash >= 4, `${betterCash}/${PAIRS}`)
  console.log(`   managed beat neglected on ranking ${betterRank}/${PAIRS}, on money ${betterCash}/${PAIRS}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 2 — no dead ends for a weak player')
{
  const s = E.newGame({ name: 'Journeyman', seed: 5150, talent: 0.3, age: 22 })
  let emptySeasons = 0
  let seasonsPlayed = 0
  for (let i = 0; i < 12 && !s.player.retired; i++) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    E.simToOffseason(s)
    seasonsPlayed++
    if (s.seasonTotals.starts === 0) emptySeasons++
  }
  check('a weak player always has somewhere to tee it up', emptySeasons === 0, `${emptySeasons} blank seasons`)
  check('and got a real run at it', seasonsPlayed >= 3, `${seasonsPlayed} seasons played`)
  // A career can now end at the bank, which is not the same as being stranded.
  // The thing worth guarding is that nobody is ever left with a live career and
  // nothing to enter.
  if (s.player.retired) {
    check('a career that ended did so for a reason, not for lack of events', !!s.player.foldedBroke,
      `retired at ${s.player.age} with ${fmtMoney(s.finance.cash)}`)
    console.log(`   weak player's career ended at ${s.player.age}: ${s.player.foldedBroke ? 'the money ran out' : 'retired'}`)
  } else {
    const eligibleNow = s.nextSeason.filter((e) => checkEligibility({ ...s, year: s.year + 1 }, e).ok).length
    check('still has eligible events after a bad decade', eligibleNow > 0, `${eligibleNow} eligible`)
  }
  console.log(`   ${s.career.starts} starts, ${s.career.wins} wins, ${fmtMoney(s.finance.cash, { compact: true })} bank`)
  invariants(s, 'weak player')
}

// ---------------------------------------------------------------------------
section('SCENARIO 3 — injury, recovery, and the comeback')
{
  const s = E.newGame({ name: 'Comeback Kid', seed: 909, talent: 0.7, age: 24 })
  E.autoOffseason(s)
  E.startSeason(s)
  E.simUntil(s, (st) => st.week >= 4)

  const before = { ...s.player.ratings }
  E.god.inflict(s, 'back')
  check('injury applied', !!s.player.injury && s.player.injury.id === 'back')
  check('injury reduces effective ratings', s.effRatings.power < before.power, `${s.effRatings.power} vs ${before.power}`)
  const weeks = s.player.injury.weeksTotal
  const startsBefore = s.career.starts
  E.simUntil(s, (st) => !st.player.injury, { maxWeeks: weeks + 6 })
  check('injury eventually clears', !s.player.injury)
  check('withdrew from events while injured', s.career.starts - startsBefore < weeks, 'played through an out injury')
  const highlight = s.career.highlights.some((h) => h.type === 'comeback' || h.type === 'injury')
  check('injury produced a narrative beat', highlight || weeks < 12, 'no highlight for a long injury')
  invariants(s, 'post-injury')

  // A slump you play through should not stop you entering events.
  E.god.inflict(s, 'yips')
  check('slump does not force a withdrawal', s.player.injury && !s.player.injury.out)
  check('putting is tanked by the yips', s.effRatings.putting < s.player.ratings.putting - 5,
    `${s.effRatings.putting} vs base ${s.player.ratings.putting}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 4 — determinism and save round-trip')
{
  const a = E.newGame({ name: 'Twin A', seed: 42424, talent: 0.6, age: 21 })
  const b = E.newGame({ name: 'Twin A', seed: 42424, talent: 0.6, age: 21 })
  for (let i = 0; i < 5; i++) {
    E.autoOffseason(a); E.startSeason(a); E.simToOffseason(a)
    E.autoOffseason(b); E.startSeason(b); E.simToOffseason(b)
  }
  check('same seed produces the same career', a.career.wins === b.career.wins && a.career.careerGross === b.career.careerGross,
    `A ${a.career.wins}w/${a.career.careerGross} vs B ${b.career.wins}w/${b.career.careerGross}`)
  check('same seed produces the same world', a.player.rank === b.player.rank, `${a.player.rank} vs ${b.player.rank}`)

  const round = importSave(exportSave(a))
  check('export/import preserves the career', round.career.careerGross === a.career.careerGross)
  check('export/import preserves the world', round.world.players.length === a.world.players.length)
  check('export/import preserves the rng cursor', round.rngState === a.rngState)
  // And the reloaded save must continue identically.
  E.autoOffseason(a); E.startSeason(a); E.simToOffseason(a)
  E.refreshDerived(round)
  E.autoOffseason(round); E.startSeason(round); E.simToOffseason(round)
  check('a reloaded save continues identically', round.career.careerGross === a.career.careerGross,
    `${round.career.careerGross} vs ${a.career.careerGross}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 5 — undo really rewinds')
{
  const s = E.newGame({ name: 'Save Scummer', seed: 777, talent: 0.7, age: 21 })
  E.autoOffseason(s)
  E.startSeason(s)
  const snapshot = cloneState(s)
  E.simToOffseason(s)
  const after = s.career.careerGross
  const restored = cloneState(snapshot)
  check('snapshot differs from the played season', after !== restored.career.careerGross || after === 0)
  E.refreshDerived(restored)
  E.simToOffseason(restored)
  check('replaying a snapshot reproduces the same season', restored.career.careerGross === after,
    `${restored.career.careerGross} vs ${after}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 6 — the long decline into the senior tour')
{
  const s = E.newGame({ name: 'Old Timer', seed: 31337, talent: 0.75, age: 21 })
  E.simToAge(s, 52)
  check('reached 52 without dying', s.player.age >= 52 || s.player.retired, `age ${s.player.age}`)
  if (!s.player.retired) {
    check('senior status granted at 50+', cardStatus(s, 'senior') !== 'none', JSON.stringify(s.cards.senior))
    const seniorEvents = s.nextSeason.filter((e) => e.circuit === 'senior' && checkEligibility({ ...s, year: s.year + 1 }, e).ok)
    check('senior events are enterable', seniorEvents.length > 0, `${seniorEvents.length} eligible`)
    const regular = s.nextSeason.filter((e) => e.circuit === 'domestic' && checkEligibility({ ...s, year: s.year + 1 }, e).ok)
    console.log(`   age ${s.player.age}: ovr ${overall(s.player.ratings).toFixed(1)}, ` +
      `${seniorEvents.length} senior events, ${regular.length} domestic events still open`)
    const peak = s.player.peakOvr
    check('has declined from peak', overall(s.player.ratings) < peak, `now ${overall(s.player.ratings).toFixed(1)} peak ${peak.toFixed(1)}`)
    check('still competitive enough to play', overall(s.player.ratings) > 30)
  }
  invariants(s, 'senior years')

  // Retirement pressure should be meaningful this late.
  const rp = E.retirementPressure(s)
  check('retirement pressure is computed', rp.pressure >= 0 && rp.pressure <= 100, `${rp.pressure}`)
  check('gives reasons either way', rp.reasons.length + rp.chasing.length > 0)
}

// ---------------------------------------------------------------------------
section('SCENARIO 7 — retire, then change your mind')
{
  const s = E.newGame({ name: 'Quitter', seed: 8080, talent: 0.6, age: 21 })
  for (let i = 0; i < 6; i++) { E.autoOffseason(s); E.startSeason(s); E.simToOffseason(s) }
  E.retire(s, 'decided it was time')
  check('retirement sets the phase', s.phase === 'retired' && s.player.retired)
  check('legacy score computed on retirement', typeof s.career.legacy === 'number')
  check('retirement is a highlight', s.career.highlights.some((h) => h.type === 'retire'))
  E.unretire(s)
  check('un-retiring restores a playable phase', s.phase === 'offseason' || s.phase === 'season', s.phase)
  check('un-retired player is active again', !s.player.retired)
  E.autoOffseason(s)
  E.startSeason(s)
  E.simToOffseason(s)
  check('can play on after un-retiring', s.seasonTotals.starts > 0, `${s.seasonTotals.starts} starts`)
  invariants(s, 'after un-retire')
}

// ---------------------------------------------------------------------------
section('SCENARIO 8 — godmode does what it says')
{
  const s = E.newGame({ name: 'Cheater', seed: 1234, talent: 0.5, age: 25 })
  E.autoOffseason(s)
  E.startSeason(s)

  E.god.addCash(s, 50_000_000)
  check('cash granted', s.finance.cash > 49_000_000)
  E.god.matchPotential(s)
  check('ratings snapped to potential', ATTR_KEYS.every((k) => s.player.ratings[k] === s.player.potential[k]))
  E.god.setCard(s, 'domestic', 'full')
  check('card granted', cardStatus(s, 'domestic') === 'full')

  const before = s.career.starts
  E.god.spawnMajor(s)
  const bonus = s.season.find((e) => e.id.startsWith('god_major'))
  check('bonus major appears on the calendar', !!bonus)
  check('player is auto-entered in it', !!s.entered[bonus.id])
  E.god.forceWin(s)
  check('force-win sets a boost', s.godBoost > 0)
  E.simUntil(s, (st, sum) => sum.playedEvent)
  check('the boosted event was played', s.career.starts > before)
  check('boost is consumed after one event', !s.godBoost)
  const last = s.career.allResults[s.career.allResults.length - 1]
  console.log(`   forced result: ${last.name} → ${last.madeCut ? (last.pos === 1 ? 'WON' : last.pos) : 'MC'}`)
  check('force-win actually wins', last.pos === 1, `finished ${last.pos}`)
  invariants(s, 'godmode')
}

// ---------------------------------------------------------------------------
section('SCENARIO 9 — schedule edge cases')
{
  const s = E.newGame({ name: 'Edge', seed: 606, talent: 0.6, age: 21 })
  E.autoOffseason(s)
  E.startSeason(s)

  // Entering nothing at all should not break the season loop.
  E.clearSchedule(s)
  check('schedule cleared', Object.keys(s.entered).length === 0)
  E.simToOffseason(s)
  check('a season with zero starts still completes', s.phase === 'offseason')
  check('zero starts recorded', s.seasonTotals.starts === 0)
  invariants(s, 'blank season')

  // One event per week, enforced.
  E.autoOffseason(s)
  E.startSeason(s)
  const byWeek = {}
  for (const id of Object.keys(s.entered)) {
    const ev = s.season.find((e) => e.id === id)
    byWeek[ev.week] = (byWeek[ev.week] || 0) + 1
  }
  const doubled = Object.entries(byWeek).filter(([, n]) => n > 1)
  check('never entered twice in one week', doubled.length === 0, JSON.stringify(doubled))

  // A heavy schedule should actually punish you. Fatigue has to be sampled
  // during the season — by the offseason the rest weeks have washed it out.
  E.clearSchedule(s)
  E.autoFillSchedule(s, 34)
  const heavyStarts = Object.keys(s.entered).length
  const weeks = Object.keys(s.entered).map((id) => s.season.find((e) => e.id === id).week).sort((a, b) => a - b)
  let longestRun = 1
  let run = 1
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] === weeks[i - 1] + 1) { run++; longestRun = Math.max(longestRun, run) } else run = 1
  }
  let peakFatigue = 0
  const rng = Rng.from(s.rngState)
  while (s.phase === 'season') {
    E.advanceOneWeek(s, rng)
    peakFatigue = Math.max(peakFatigue, s.player.fatigue)
  }
  s.rngState = rng.s
  console.log(`   heavy: ${heavyStarts} starts, longest run ${longestRun}wk, peak fatigue ${Math.round(peakFatigue)}, end morale ${Math.round(s.player.morale)}`)

  // Fatigue is only meaningful if load drives it, so compare like for like:
  // the same player, same seed, on a light schedule versus a heavy one.
  const peakFor = (target) => {
    const t = E.newGame({ name: 'Load', seed: 31415, talent: 0.68, age: 27 })
    E.autoOffseason(t)
    E.startSeason(t)
    E.clearSchedule(t)
    E.autoFillSchedule(t, target)
    const starts = Object.keys(t.entered).length
    let peak = 0
    const r = Rng.from(t.rngState)
    while (t.phase === 'season') {
      E.advanceOneWeek(t, r)
      peak = Math.max(peak, t.player.fatigue)
    }
    return { peak, starts }
  }
  const light = peakFor(14)
  const heavy = peakFor(40)
  console.log(`   light ${light.starts} starts → peak fatigue ${Math.round(light.peak)} | ` +
    `heavy ${heavy.starts} starts → peak fatigue ${Math.round(heavy.peak)}`)
  check('a heavier schedule means more fatigue', heavy.peak > light.peak + 15,
    `light ${Math.round(light.peak)} heavy ${Math.round(heavy.peak)}`)
  check('a punishing schedule reaches the penalty band', heavy.peak > 60, `peak ${Math.round(heavy.peak)}`)
  // A normal load gets spread out; a deliberately punishing one is allowed to
  // stack up, because that is what the player asked for.
  const spreadProbe = E.newGame({ name: 'Spread', seed: 31415, talent: 0.68, age: 27 })
  E.autoOffseason(spreadProbe)
  E.startSeason(spreadProbe)
  E.clearSchedule(spreadProbe)
  E.autoFillSchedule(spreadProbe, 25)
  const sw = Object.keys(spreadProbe.entered)
    .map((id) => spreadProbe.season.find((e) => e.id === id).week)
    .sort((a, b) => a - b)
  let spreadRun = 1
  let sr = 1
  for (let i = 1; i < sw.length; i++) {
    if (sw[i] === sw[i - 1] + 1) { sr++; spreadRun = Math.max(spreadRun, sr) } else sr = 1
  }
  check('auto-fill spreads a normal load', spreadRun <= 4, `${spreadRun} weeks in a row for 25 starts`)
  void longestRun

  // Morale must not be a one-way ratchet: a normal season should not bottom out.
  const m = E.newGame({ name: 'Mood', seed: 2468, talent: 0.62, age: 26 })
  for (let i = 0; i < 6; i++) { E.autoOffseason(m); E.startSeason(m); E.simToOffseason(m) }
  console.log(`   morale after six auto seasons: ${Math.round(m.player.morale)}`)
  check('morale does not drain to nothing over a career', m.player.morale > 20, `morale ${Math.round(m.player.morale)}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 11 — a tie for the lead goes to a playoff')
{
  const t = E.newGame({ name: 'Playoff', seed: 606060, talent: 0.8, age: 26 })
  let events = 0
  let multiWinner = 0
  let playoffs = 0
  for (let i = 0; i < 6; i++) {
    E.autoOffseason(t)
    E.startSeason(t)
    E.simToOffseason(t)
    for (const res of Object.values(t.seasonResults)) {
      events++
      if ((res.top || []).filter((r) => r.pos === 1).length > 1) multiWinner++
    }
  }
  for (const w of t.career.winsList) if (w.margin === 0) playoffs++
  check('no event ever has two winners', multiWinner === 0, `${multiWinner} of ${events}`)
  console.log(`   ${events} events checked, ${playoffs} of the player's own wins came in a playoff`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 12 — every circuit is reachable')
{
  const reach = new Set()
  for (let seed = 0; seed < 4; seed++) {
    const t = E.newGame({ name: 'Reach', seed: 700 + seed * 97, talent: 0.5 + seed * 0.12, age: 21 })
    while (!t.player.retired && t.player.age < 58) {
      E.autoOffseason(t)
      E.startSeason(t)
      E.simToOffseason(t)
    }
    for (const r of t.career.allResults) reach.add(r.circuit)
  }
  for (const circuit of ['amateur', 'emerging', 'asian', 'intl', 'domestic', 'major', 'senior']) {
    check(`the ${circuit} circuit is actually playable`, reach.has(circuit), 'never entered in any career')
  }
}

// ---------------------------------------------------------------------------
section('SCENARIO 10 — money adds up')
{
  const s = E.newGame({ name: 'Accountant', seed: 4321, talent: 0.72, age: 21 })
  for (let i = 0; i < 10; i++) { E.autoOffseason(s); E.startSeason(s); E.simToOffseason(s) }
  const rows = s.career.seasons
  const netFlow = rows.reduce((a, r) => a + r.prizeNet + r.endorse - r.expenses + r.invest, 0)
  const expected = 24000 + netFlow
  const drift = Math.abs(expected - s.finance.cash)
  // Signing bonuses, entry fees and staff pay-offs land outside the season row,
  // so allow a tolerance — but it should be a small share of the total.
  const scale = Math.max(1, Math.abs(s.finance.cash))
  check('bank balance tracks the season ledger', drift / scale < 0.25,
    `cash ${fmtMoney(s.finance.cash)} vs ledger ${fmtMoney(expected)} (drift ${fmtMoney(drift)})`)
  check('career gross is the sum of season gross',
    Math.abs(rows.reduce((a, r) => a + r.prizeGross, 0) - s.career.careerGross) < 1,
    `${rows.reduce((a, r) => a + r.prizeGross, 0)} vs ${s.career.careerGross}`)
  const negEarn = s.career.allResults.some((r) => r.net < 0)
  check('no negative prize cheques', !negEarn)
  invariants(s, 'money')
}

// ---------------------------------------------------------------------------
section('SCENARIO 13 — closing the tab costs you nothing')
{
  // Two identical careers. One is played straight through; the other is saved
  // and reloaded every offseason, which is how anyone actually plays a browser
  // game. They must end up in exactly the same place.
  const play = (reload) => {
    let s = E.newGame({ name: 'Persistent', seed: 777, talent: 0.7, age: 21 })
    while (s.player.age < 32 && !s.player.retired) {
      if (s.phase === 'offseason') { E.autoFillSchedule(s, 26); E.startSeason(s) }
      E.simToOffseason(s)
      E.autoOffseason(s)
      if (reload) s = importSave(exportSave(s))
    }
    return s
  }
  const straight = play(false)
  const reloaded = play(true)
  const shape = (s) => JSON.stringify({
    ovr: Math.round(overall(s.player.ratings)),
    rank: s.player.rank,
    wins: s.career.wins,
    majors: s.career.majors,
    gross: Math.round(s.career.careerGross),
  })
  check('a career reloaded every year plays out identically', shape(straight) === shape(reloaded),
    `straight ${shape(straight)} vs reloaded ${shape(reloaded)}`)

  // The specific two things that broke it, asserted directly so a regression
  // names itself instead of just moving the numbers.
  const rt = importSave(exportSave(straight))
  check('you are still the same object the world ranks',
    rt.world.players.find((p) => p.pid === rt.player.pid) === rt.player,
    'save round-trip split state.player from its world entry')
  for (const role of ['coach', 'caddie', 'physio', 'psych', 'agent']) {
    const before = straight.staff[role]
    const after = rt.staff[role]
    check(`an empty ${role} slot survives a save as empty`,
      before !== null || after === null,
      `null became ${JSON.stringify(after)} — a truthy slot reads as "you have a ${role}"`)
    check(`a hired ${role} survives a save`,
      before === null || (after && after.name === before.name),
      `${before && before.name} became ${JSON.stringify(after)}`)
  }

  // Mid-season saves must be just as safe as offseason ones.
  const mid = E.newGame({ name: 'Midseason', seed: 606, talent: 0.68, age: 22 })
  E.autoFillSchedule(mid, 26)
  E.startSeason(mid)
  for (let i = 0; i < 9; i++) E.simWeek(mid)
  const direct = cloneState(mid)
  const viaSave = importSave(exportSave(mid))
  for (let i = 0; i < 8; i++) { E.simWeek(direct); E.simWeek(viaSave) }
  const mshape = (s) => JSON.stringify({ w: s.week, r: s.player.rank, st: s.seasonTotals.starts, g: Math.round(s.seasonTotals.prizeGross) })
  check('a mid-season save resumes deterministically', mshape(direct) === mshape(viaSave),
    `${mshape(direct)} vs ${mshape(viaSave)}`)
  invariants(reloaded, 'reloaded career')
}

// ---------------------------------------------------------------------------
section('SCENARIO 14 — the training choice is actually a choice')
{
  // Measured the way the player experiences it: take one state, run the same
  // year under each training option, and compare the overall each produces.
  // No option may win everywhere, or the offseason's most frequent decision
  // collapses into a single right answer.
  const attrs = TRAINING_OPTIONS.filter((t) => t.attr).map((t) => t.attr)

  /**
   * Overall points a year of this training choice is worth, averaged over many
   * RNG draws. Playing a whole season instead would bury a 0.2-point effect
   * under several points of tournament noise.
   */
  const yearValue = (ratings, potential, attr, runs = 300) => {
    let before = overall(ratings)
    let total = 0
    for (let i = 0; i < runs; i++) {
      const r = progressYear(ratings, potential, 26, new Rng(9000 + i), { trainingAttr: attr, trainingPower: 1.2 })
      total += overall(r.ratings) - before
    }
    return total / runs
  }

  const mkPlayer = (gapFor) => {
    const ratings = {}
    const potential = {}
    for (const k of ATTR_KEYS) { ratings[k] = 60; potential[k] = 60 + gapFor(k) }
    return { ratings, potential }
  }

  const SITUATIONS = [
    ['room everywhere', mkPlayer(() => 12)],
    ['one big hole in irons', mkPlayer((k) => (k === 'irons' ? 16 : 1))],
    ['at his ceiling everywhere', mkPlayer(() => 1)],
  ]
  const winners = new Set()
  for (const [label, { ratings, potential }] of SITUATIONS) {
    const scored = [...attrs, 'all']
      .map((a) => ({ a, v: yearValue(ratings, potential, a) }))
      .sort((x, y) => y.v - x.v)
    winners.add(scored[0].a)
    const bal = scored.find((x) => x.a === 'all')
    console.log(`   ${label}: best "${scored[0].a}" ${scored[0].v.toFixed(3)}/yr, balanced ${bal.v.toFixed(3)}/yr`)
  }
  check('no one training option is best in every situation', winners.size > 1,
    `"${[...winners][0]}" won all ${SITUATIONS.length} situations`)

  // And the engine must honour the headroom the offseason screen advertises:
  // training an attribute at its ceiling cannot pay as well as one with room.
  const rng = new Rng(4242)
  const ratings = {}, potential = {}
  for (const k of ATTR_KEYS) { ratings[k] = 60; potential[k] = 60 }
  potential.putting = 85
  const gain = (attr) => {
    let total = 0
    for (let i = 0; i < 200; i++) {
      const r = progressYear(ratings, potential, 26, new Rng(1000 + i), { trainingAttr: attr, trainingPower: 1.2 })
      total += r.deltas[attr]
    }
    return total / 200
  }
  const roomy = gain('putting')   // 25 points of headroom
  const maxed = gain('irons')     // none
  check('training pays more where there is headroom', roomy > maxed + 0.3,
    `putting (25 spare) gained ${roomy.toFixed(2)}/yr vs irons (maxed) ${maxed.toFixed(2)}/yr`)
  console.log(`   headroom check: +25 spare gains ${roomy.toFixed(2)}/yr, at ceiling gains ${maxed.toFixed(2)}/yr`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 15 — you never tee off on your own')
{
  // The senior roster is smaller than a senior field, so everyone played every
  // week, everyone hit their starts budget in the same week, and every senior
  // event after it had a field of one: the player, alone, collecting the
  // winner's cheque and the ranking points. A third of one test career's
  // senior events went that way. Measure the thinnest field on every circuit.
  const worst = {}
  for (let seed = 0; seed < 2; seed++) {
    const s = E.newGame({ name: 'Field Audit', seed: 900 + seed * 311, talent: 0.55 + seed * 0.15, age: 21 })
    while (!s.player.retired && s.player.age < 58) {
      E.autoOffseason(s)
      E.startSeason(s)
      E.simToOffseason(s)
      for (const r of Object.values(s.seasonResults)) {
        // `top` holds 20 rows for the player's own events, so anything shorter
        // means the field itself was short.
        if (!r.top?.some((t) => t.isUser)) continue
        const cur = worst[r.circuit]
        if (!cur || r.top.length < cur.rows) worst[r.circuit] = { rows: r.top.length, where: `${s.year} ${r.name}` }
      }
    }
  }
  const seen = Object.keys(worst)
  check('the audit saw every circuit', seen.length >= 5, `only saw ${seen.join(', ')}`)
  for (const [circuit, w] of Object.entries(worst).sort()) {
    check(`${circuit}: never a near-empty field`, w.rows >= 20, `thinnest was ${w.rows} rows — ${w.where}`)
  }
  console.log(`   thinnest field by circuit: ${Object.entries(worst).sort().map(([c, w]) => `${c} ${w.rows}`).join(', ')}`)

  // And the same guarantee when the roster is gutted underneath you, which is
  // the state the bug actually arose from.
  const s = E.newGame({ name: 'Last Man', seed: 14, talent: 0.7, age: 21 })
  while (!s.player.retired && s.player.age < 52) { E.autoOffseason(s); E.startSeason(s); E.simToOffseason(s) }
  let retiredOff = 0
  for (const p of s.world.players) {
    if (!p.isUser && !p.retired && p.age >= SENIOR_AGE) { p.retired = true; retiredOff += 1 }
  }
  E.autoOffseason(s)
  E.startSeason(s)
  E.simToOffseason(s)
  let alone = 0
  let thinnest = Infinity
  for (const r of Object.values(s.seasonResults)) {
    if (!r.top?.some((t) => t.isUser)) continue
    thinnest = Math.min(thinnest, r.top.length)
    if (r.top.length <= 1) alone += 1
  }
  check('gutting the senior roster still never leaves you alone', alone === 0,
    `${alone} events with a field of one after retiring ${retiredOff} seniors`)
  console.log(`   with ${retiredOff} seniors force-retired, thinnest field was ${thinnest === Infinity ? 'n/a' : thinnest}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 16 — a tournament pays out its purse, no more and no less')
{
  // PAYOUT_PCT is one list of percentages, but cut sizes differ by circuit and
  // ties at the cut push the paid field past its nominal size, so the places
  // actually paid vary from event to event. Left unscaled this ran from 3.5%
  // under the purse to 1.4% over — money quietly created or destroyed on every
  // tournament in the world, for forty years.
  let worst = { err: 0, where: '' }
  const courses = Object.keys(COURSE_TYPES)
  for (const [cid, circuit] of Object.entries(CIRCUITS)) {
    for (let i = 0; i < 12; i++) {
      const rng = new Rng(3000 + i)
      const ev = {
        id: 'x', name: 'X', courseType: courses[i % courses.length], difficulty: 1,
        fieldSize: circuit.fieldSize, cutSize: circuit.cutSize, purse: 6_000_000,
        circuit: cid, isMajor: cid === 'major',
      }
      const field = []
      for (let j = 0; j < ev.fieldSize; j++) {
        field.push(makeEntrant(
          { pid: j, name: `P${j}`, playstyle: 'balanced', form: 0, fatigue: 20 },
          emptyRatings(Math.round(rng.gaussClamped(64, 8))), ev,
        ))
      }
      const res = simTournament(ev, field, new Rng(4000 + i))
      const paid = res.results.reduce((a, r) => a + (r.money || 0), 0)
      const err = Math.abs(paid - ev.purse) / ev.purse
      if (err > worst.err) worst = { err, where: `${cid}: paid ${Math.round(paid).toLocaleString()} of ${ev.purse.toLocaleString()}` }
      // Nobody who made the cut should be sent home with nothing.
      const unpaid = res.results.filter((r) => r.madeCut && r.pos && !(r.money > 0)).length
      check(`${cid}: everyone who made the cut is paid`, unpaid === 0, `${unpaid} finishers on zero`)
    }
  }
  // Rounding to whole dollars across ~70 places is the only slack allowed.
  check('every circuit pays out its purse exactly', worst.err < 0.0001, worst.where)
  console.log(`   worst discrepancy across all circuits: ${(worst.err * 100).toFixed(4)}% (${worst.where})`)

  const total = PAYOUT_PCT.reduce((a, b) => a + b, 0)
  check('the payout table itself sums to 100%', Math.abs(total - 100) < 0.01, `sums to ${total.toFixed(3)}%`)
  const maxCut = Math.max(...Object.values(CIRCUITS).map((c) => c.cutSize))
  check('the payout table covers the largest cut', PAYOUT_PCT.length >= maxCut,
    `${PAYOUT_PCT.length} places for a cut of ${maxCut}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 17 — what the Team screen claims quality buys is true')
{
  // qualityEffect() tells the player, in shots and rating points, what a hire
  // is worth. Those figures are written out as prose, so they can drift away
  // from the functions they describe without anything failing. Pin the
  // identities the wording is built on: if one of these fails, the sentence in
  // staff.js needs rewriting, not the assertion relaxing.
  // The claims are about what somebody is worth to you *today*, which is their
  // rating adjusted for how long they have worked for you — so the identities
  // are pinned against effectiveQ, exactly as the Team screen renders them.
  const q = 0.62
  const years = 4
  const coachMan = { q, trait: 'putting', traitAttr: 'putting', yearsWithYou: years }
  const eq = effectiveQ(coachMan)
  const coach = { coach: coachMan, caddie: null, psych: null, physio: null, agent: null }
  check('coach: quality x 0.85 outside their specialty',
    Math.abs(coachTrainingBonus(coach, 'irons') - eq * 0.85) < 1e-9,
    `${coachTrainingBonus(coach, 'irons')} vs ${eq * 0.85}`)
  check('coach: +0.55 more inside it',
    Math.abs(coachTrainingBonus(coach, 'putting') - (eq * 0.85 + 0.55)) < 1e-9,
    `${coachTrainingBonus(coach, 'putting')} vs ${eq * 0.85 + 0.55}`)

  const ordinary = { isMajor: false, flagship: false }
  const cadMan = { q, trait: 'none', yearsWithYou: years }
  const cad = staffMatchdayEffect({ caddie: cadMan, psych: null }, ordinary)
  check('caddie: quality x 0.8 in playing quality', Math.abs(cad.quality - eq * 0.8) < 1e-9, `${cad.quality} vs ${eq * 0.8}`)
  check('caddie: variance cut by quality x 7%', Math.abs(cad.sigmaMult - (1 - eq * 0.07)) < 1e-9,
    `${cad.sigmaMult} vs ${1 - eq * 0.07}`)

  const psyMan = { q, trait: 'none', yearsWithYou: years }
  const psy = staffMatchdayEffect({ caddie: null, psych: psyMan }, ordinary)
  check('psych: quality x 0.5 on an ordinary week', Math.abs(psy.quality - eq * 0.5) < 1e-9, `${psy.quality} vs ${eq * 0.5}`)
  const psyMajor = staffMatchdayEffect({ caddie: null, psych: psyMan }, { isMajor: true, flagship: false })
  check('psych: 1.8x that in a major', Math.abs(psyMajor.quality - eq * 0.5 * 1.8) < 1e-9,
    `${psyMajor.quality} vs ${eq * 0.5 * 1.8}`)

  // Physio's claim is about progressYear's decline shield, not a staff.js call.
  const ratings = {}
  const potential = {}
  for (const k of ATTR_KEYS) { ratings[k] = 70; potential[k] = 70 }
  const declineAt = (physio) => {
    let total = 0
    for (let i = 0; i < 400; i++) total += progressYear(ratings, potential, 40, new Rng(700 + i), { physio }).ratings.power
    return total / 400
  }
  const shielded = declineAt(q)
  const bare = declineAt(0)
  check('physio: measurably slows the decline', shielded > bare,
    `power at 40 with a physio ${shielded.toFixed(2)} vs without ${bare.toFixed(2)}`)
  console.log(`   physio at quality 62 holds power at ${shielded.toFixed(2)} against ${bare.toFixed(2)} unaided`)

  // And every role must actually produce a sentence.
  for (const role of ['coach', 'caddie', 'physio', 'psych', 'agent']) {
    const text = qualityEffect(role, q)
    check(`${role}: has an explanation on the Team screen`, typeof text === 'string' && text.length > 30, JSON.stringify(text))
    check(`${role}: no NaN or undefined in it`, !/NaN|undefined/.test(text), text)
  }
  check('quality reads out of 100', qualityOf({ q: 0.62 }) === 62, String(qualityOf({ q: 0.62 })))
  check('no staff means no quality', qualityOf(null) === 0)
}

// ---------------------------------------------------------------------------
section('SCENARIO 18 — money decides who gets to keep playing')
{
  // Golf careers end at the bank more often than on the range. The shape this
  // has to produce: the hopeless go broke, the good never come close, and the
  // marginal survive on a shorter schedule and a winter job.
  const tiers = [
    { label: 'no-hoper', talent: 0.24, expectBroke: true },
    { label: 'journeyman', talent: 0.5, expectBroke: false, mayStruggle: true },
    { label: 'star', talent: 0.82, expectBroke: false },
  ]
  for (const t of tiers) {
    let broke = 0
    let everInDebt = 0
    const ages = []
    // Twelve seeds, not five: the mean fold age straddles the threshold, so a
    // five-career sample fails on cascade rather than on anything real.
    const SEEDS = 12
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = E.newGame({ name: t.label, seed: 3300 + seed * 97, talent: t.talent, age: 21 })
      let sawDebt = false
      while (!s.player.retired && s.player.age < 44) {
        E.autoOffseason(s)
        if (s.player.retired) break
        E.startSeason(s)
        E.simToOffseason(s)
        if (s.finance.cash < 0) sawDebt = true
      }
      if (s.player.foldedBroke) broke += 1
      if (sawDebt) everInDebt += 1
      ages.push(s.player.age)
    }
    const meanAge = ages.reduce((a, b) => a + b, 0) / ages.length
    console.log(`   ${t.label.padEnd(11)} ${broke}/${SEEDS} ran out of money, ${everInDebt}/${SEEDS} were in debt at some point, ended at ${meanAge.toFixed(1)}`)
    if (t.expectBroke) {
      check(`${t.label}: mostly ends at the bank`, broke / SEEDS >= 0.6, `only ${broke}/${SEEDS} went broke`)
      check(`${t.label}: but not instantly`, meanAge >= 24, `folded at a mean age of ${meanAge.toFixed(1)}`)
    } else if (t.mayStruggle) {
      // Since the cut moved to 36 holes a median player really can fail —
      // measured at about three in ten — but it must not be the usual outcome.
      check(`${t.label}: usually survives`, broke / SEEDS <= 0.4, `${broke}/${SEEDS} went broke`)
    } else {
      // Not zero: a touted amateur whose ratings land in the bottom of their
      // own distribution and who never develops can still run out of money in
      // three years, and the game is explicitly about that being possible. One
      // in twelve is the tail, not a leak.
      check(`${t.label}: almost never goes broke`, broke / SEEDS <= 0.15, `${broke}/${SEEDS} went broke`)
    }
  }

  // The ceiling scales with what you have proved you can earn.
  const rookie = E.newGame({ name: 'Rookie', seed: 7, talent: 0.5, age: 21 })
  const rookieLimit = E.playerBorrowingLimit(rookie)
  const rich = E.newGame({ name: 'Rich', seed: 7, talent: 0.5, age: 21 })
  rich.career.careerEarnings = 20_000_000
  rich.player.status = 'pro'
  const richLimit = E.playerBorrowingLimit(rich)
  check('an unproven amateur can borrow least', rookieLimit < richLimit / 3,
    `amateur ${fmtMoney(rookieLimit)} vs proven ${fmtMoney(richLimit)}`)
  check('but the ceiling is never unlimited', richLimit < 12_000_000, fmtMoney(richLimit))
  console.log(`   borrowing ceiling: unproven amateur ${fmtMoney(rookieLimit)}, $20m career earner ${fmtMoney(richLimit)}`)

  // Debt costs money every year you carry it.
  check('carrying debt costs interest', debtInterest(-200_000) > 0 && debtInterest(50_000) === 0,
    `${debtInterest(-200_000)} on debt, ${debtInterest(50_000)} in credit`)

  // A schedule has to be payable. Book a huge one with no money and it trims.
  const skint = E.newGame({ name: 'Skint', seed: 91, talent: 0.4, age: 22 })
  E.turnPro(skint)
  skint.finance.cash = -60_000
  E.autoFillSchedule(skint, 34)
  const before = Object.values(skint.nextEntered).filter(Boolean).length
  E.trimScheduleToBudget(skint)
  const after = Object.values(skint.nextEntered).filter(Boolean).length
  check('a schedule you cannot afford is cut back', after < before, `${before} entries, still ${after} after trimming`)
  check('but never to nothing', after >= 6, `${after} left`)
  console.log(`   broke player booking 34 events is trimmed to ${after}`)

  // A backer is offered on promise, not on need.
  const young = backerOffer(new Rng(1), { age: 24, ovr: 62, potentialOvr: 80, rank: 240, needed: 200_000 })
  const old = backerOffer(new Rng(1), { age: 41, ovr: 58, potentialOvr: 59, rank: 620, needed: 200_000 })
  check('a young player with a ceiling gets funded', !!young)
  check('an old journeyman in the same hole does not', old === null)
  if (young) {
    check('the terms are a real price', young.cut >= 0.15 && young.cut <= 0.5, `${young.cut}`)
    console.log(`   backer for a 24-year-old: ${fmtMoney(young.amount)} against ${Math.round(young.cut * 100)}% for ${young.years} years`)
  }

  // And that cut genuinely leaves the player's pocket.
  const withBacker = splitPrize(1_000_000, { pos: 1, madeCut: true, hasCaddie: true, agentCut: 0.05, backerCut: 0.3 })
  const without = splitPrize(1_000_000, { pos: 1, madeCut: true, hasCaddie: true, agentCut: 0.05, backerCut: 0 })
  check('a backer is paid off the top', withBacker.backer === 300_000 && withBacker.net < without.net,
    `${withBacker.net} vs ${without.net}`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 19 — endorsement money is the size it is in real life')
{
  // This used to hand a four-major career $901m in endorsements and finish it
  // with $2.6bn, against Tiger Woods' ~$120m on-course and ~$1bn net worth.
  // Check the ladder against what players at each level are really paid, with
  // a mid-range agent, so the numbers cannot quietly inflate again.
  const order = [...SPONSOR_CATEGORIES].sort((a, b) => b.base - a.base).slice(0, MAX_CONCURRENT_DEALS)
  const portfolio = (m, mult = 1.25) => order.reduce((a, c, i) => a + dealValue(c.id, m, mult, 0, null, i), 0)

  const bands = [
    ['fringe, ~top 250', 0.25, 50_000, 700_000],
    ['card holder, ~top 120', 0.45, 300_000, 2_000_000],
    ['good tour pro, ~top 60', 0.62, 1_000_000, 5_000_000],
    ['elite, top ten', 0.8, 3_000_000, 15_000_000],
    ['generational', 1.25, 15_000_000, 40_000_000],
  ]
  for (const [who, m, lo, hi] of bands) {
    const v = portfolio(m)
    check(`${who}: paid a believable amount`, v >= lo && v <= hi,
      `${fmtMoney(v)} outside ${fmtMoney(lo)}–${fmtMoney(hi)}`)
  }
  console.log(
    '   annual endorsements: ' +
      bands.map(([, m]) => `m${m} ${fmtMoney(portfolio(m), { compact: true })}`).join(', '),
  )

  // The ladder must stay monotonic and steep enough that stardom is worth it.
  for (let i = 1; i < bands.length; i++) {
    check(`${bands[i][0]} out-earns ${bands[i - 1][0]}`, portfolio(bands[i][1]) > portfolio(bands[i - 1][1]))
  }
  check('a generational name is worth many times a good pro', portfolio(1.25) > portfolio(0.62) * 5,
    `${fmtMoney(portfolio(1.25))} vs ${fmtMoney(portfolio(0.62))}`)

  // Nobody carries ten logos. This cap used only to gate new offers once seven
  // were already held, which let a star stack every category in the game.
  const stacked = generateOffers(
    new Rng(5),
    { rank: 1, age: 30, season: { wins: 3 }, status: 'pro' },
    { majors: 5, wins: 40 },
    { agent: { q: 0.95 } },
    SPONSOR_CATEGORIES.slice(0, MAX_CONCURRENT_DEALS).map((c) => ({ category: c.id, yearsLeft: 3 })),
    0,
    2.1,
  )
  check('a full book of logos gets no further offers', stacked.length === 0, `${stacked.length} offered`)

  // And a whole career lands somewhere a person could believe.
  const elite = []
  for (let seed = 0; seed < 4; seed++) {
    const s = E.newGame({ name: 'Great', seed: 6100 + seed * 401, talent: 0.86, age: 21 })
    while (!s.player.retired && s.player.age < 46) {
      E.autoOffseason(s)
      if (s.player.retired) break
      E.startSeason(s)
      E.simToOffseason(s)
    }
    elite.push({
      cash: s.finance.cash,
      majors: s.career.majors,
      wins: s.career.wins,
      bestRank: s.career.bestRank ?? 999,
      endorse: s.career.endorsementTotal,
    })
  }
  const richest = elite.reduce((a, b) => (b.cash > a.cash ? b : a))
  // Not every gifted prospect gets to the top — one of these four usually
  // peaks in the teens. Compare the ones who actually got there.
  const atTheTop = elite.filter((e) => e.bestRank === 1)
  const leanest = atTheTop.length ? atTheTop.reduce((a, b) => (b.cash < a.cash ? b : a)) : richest
  // Tiger's lifetime net worth is about $1bn. A career at world no.1 for a
  // decade may exceed it, but not by an order of magnitude.
  //
  // This used to scale the ceiling with majors, which is the wrong model of
  // the game's own economics: marketability is driven by ranking, so these
  // four careers land within 25% of each other on anything from two majors to
  // seven. Keyed on majors, the test passed or failed on which seed happened
  // to produce the most trophies.
  check('the richest career is not absurd', richest.cash < 1_300_000_000,
    `${fmtMoney(richest.cash)} off ${richest.majors} majors and ${richest.wins} wins`)
  // The old endorsement curve was explosive at the top, so one generational
  // player out-earned an equally decorated peer several times over. Careers
  // this similar must land in the same place.
  // The real guard against an explosive curve is the dealValue ladder above,
  // which is pinned to what athletes are actually paid at a given
  // marketability. What a whole career adds is a rate check: the very best
  // years must stay inside what the very best athletes earn. Ratios between
  // seeds are not the test — one of these four wins ninety times and another
  // wins twenty-four, and those are not the same career.
  const peakYearly = Math.max(...elite.map((e) => e.endorse / 24))
  check('even the best endorsement career averages a believable year', peakYearly < 40_000_000,
    `${fmtMoney(peakYearly)}/yr averaged over a career`)
  check('and the leanest of them is still a rich man', leanest.cash > 40_000_000, fmtMoney(leanest.cash))
  console.log(
    `   four elite careers: ${elite.map((e) => `${fmtMoney(e.cash, { compact: true })}/${e.majors}maj/#${e.bestRank}`).join(', ')}`,
  )
}

// ---------------------------------------------------------------------------
section('SCENARIO 20 — Sunday exists')
{
  // The four rounds on a leaderboard used to be produced by dividing up the
  // final score after the fact, so there was no 54-hole lead to hold, no charge
  // and no collapse — and the mental rating had nothing visible to do. The
  // player's own events now play the rounds out, and the cut falls after 36
  // holes where it belongs.
  const EV = { id: 't', name: 'T', courseType: 'classic', difficulty: 1, fieldSize: 156, cutSize: 65, purse: 8e6, circuit: 'domestic' }
  const fieldFor = (rng, mental) => {
    const mine = emptyRatings(72)
    mine.mental = mental
    const out = [makeEntrant({ pid: 0, name: 'Me', isUser: true, playstyle: 'balanced', form: 0, fatigue: 20 }, mine, EV)]
    for (let j = 1; j < EV.fieldSize; j++) {
      const r = emptyRatings(Math.round(rng.gaussClamped(66, 7)))
      r.mental = 50
      out.push(makeEntrant({ pid: j, name: `P${j}`, playstyle: 'balanced', form: 0, fatigue: 20 }, r, EV))
    }
    return out
  }

  // Rounds are real: four of them, summing to the score on the board.
  const one = simTournament(EV, fieldFor(new Rng(1), 50), new Rng(2), { detailed: true, detailRows: 156 })
  const winner = one.results[0]
  check('a winner played four rounds', winner.rounds?.length === 4, `${winner.rounds?.length} rounds`)
  check('the rounds add up to the score', winner.rounds.reduce((a, r) => a + r.toPar, 0) === winner.toPar,
    `${winner.rounds.map((r) => r.toPar).join('+')} vs ${winner.toPar}`)
  const missed = one.results.find((r) => !r.madeCut && r.rounds)
  if (missed) check('a missed cut played only two', missed.rounds.length === 2, `${missed.rounds.length} rounds`)
  check('everyone has a 54-hole position', one.results.filter((r) => r.madeCut).every((r) => r.pos54 >= 1))

  // The cut falls on 36 holes, so nobody is saved by rounds they never played.
  const madeCount = one.results.filter((r) => r.madeCut).length
  check('the cut is about the right size', madeCount >= 60 && madeCount <= 80, `${madeCount} made it`)

  // Holding the lead is worth something but far from everything.
  let leads = 0
  let converted = 0
  for (let i = 0; i < 400; i++) {
    const res = simTournament(EV, fieldFor(new Rng(4000 + i), 50), new Rng(9000 + i), { detailed: true, detailRows: 156 }).results
    const leader = res.find((r) => r.pos54 === 1)
    if (!leader) continue
    leads += 1
    if (leader.pos === 1) converted += 1
  }
  const rate = (100 * converted) / Math.max(1, leads)
  check('54-hole leaders win often, but lose often too', rate > 25 && rate < 60, `${rate.toFixed(0)}%`)
  console.log(`   54-hole leaders converted ${rate.toFixed(0)}% of the time (real tour is about 45%)`)

  // And nerve is what decides it — the whole point of playing Sunday out.
  const convRate = (mental) => {
    let l = 0
    let w = 0
    for (let i = 0; i < 900; i++) {
      const me = simTournament(EV, fieldFor(new Rng(4000 + i), mental), new Rng(9000 + i), { detailed: true, detailRows: 156 })
        .results.find((x) => x.pid === 0)
      if (me.pos54 === 1) { l += 1; if (me.pos === 1) w += 1 }
    }
    return l ? (100 * w) / l : 0
  }
  const calm = convRate(90)
  const fragile = convRate(25)
  check('a strong mind closes more often than a weak one', calm > fragile + 5,
    `${calm.toFixed(0)}% at mental 90 vs ${fragile.toFixed(0)}% at 25`)
  console.log(`   closing out: ${calm.toFixed(0)}% with a strong mind, ${fragile.toFixed(0)}% with a fragile one`)
}

section('SCENARIO 21 — the weather is playing too')
{
  const EV = { id: 'w', name: 'W', courseType: 'links', difficulty: 1, fieldSize: 144, cutSize: 65, purse: 8e6, circuit: 'domestic' }
  const flat = (wind, rain = 0.2) => ({ wind, rain, rounds: [0, 1, 2, 3].map(() => ({ wind, rain })) })
  const spread = (rng, base) => {
    const r = emptyRatings(0)
    for (const k of ATTR_KEYS) r[k] = clamp01to99(rng.gauss(base, 9))
    return r
  }
  const pack = (rng, extra = []) => {
    const out = extra.slice()
    for (let j = out.length; j < EV.fieldSize; j++) {
      const r = spread(rng, 50)
      out.push(makeEntrant({ pid: 100 + j, name: `P${j}`, playstyle: 'balanced', form: 0, fatigue: 0 }, r, EV))
    }
    return out
  }

  // A gale is harder than a still morning, and everybody feels it.
  const level = (wind) => {
    const rng = new Rng(770)
    let win = 0
    let cut = 0
    let strength = 0
    const N = 260
    for (let i = 0; i < N; i++) {
      const out = simTournament(EV, pack(rng), rng, { conditions: flat(wind) })
      win += out.winner.toPar
      cut += out.cutLine
      strength += out.strengthMult
    }
    return { win: win / N, cut: cut / N, strength: strength / N }
  }
  const calmWeek = level(0.05)
  const galeWeek = level(0.85)
  check('a gale plays harder than a calm morning', galeWeek.win > calmWeek.win + 3,
    `winner ${calmWeek.win.toFixed(1)} calm vs ${galeWeek.win.toFixed(1)} in wind`)
  check('the cut line moves with the weather too', galeWeek.cut > calmWeek.cut + 2,
    `cut ${calmWeek.cut.toFixed(1)} vs ${galeWeek.cut.toFixed(1)}`)
  // If the weather changed how strong the field looked, ranking points would
  // drift with the forecast — a windy major would be worth less than a calm one.
  check('weather does not change how strong the field is',
    Math.abs(galeWeek.strength - calmWeek.strength) < 0.02,
    `${calmWeek.strength.toFixed(3)} calm vs ${galeWeek.strength.toFixed(3)} windy`)
  console.log(`   winning score: ${calmWeek.win.toFixed(1)} dead calm, ${galeWeek.win.toFixed(1)} in a gale`)

  // And it changes who wins. Same two players, same course, different sky.
  const straight = { ...emptyRatings(0), power: 40, accuracy: 78, irons: 66, shortGame: 68, putting: 58, consistency: 76, mental: 60 }
  const bomber = { ...emptyRatings(0), power: 82, accuracy: 50, irons: 66, shortGame: 60, putting: 74, consistency: 54, mental: 60 }
  const headToHead = (cond) => {
    const rng = new Rng(881)
    let sWins = 0
    const N = 900
    for (let i = 0; i < N; i++) {
      const field = pack(rng, [
        makeEntrant({ pid: 1, name: 'Straight', playstyle: 'balanced', form: 0, fatigue: 0 }, straight, EV),
        makeEntrant({ pid: 2, name: 'Bomber', playstyle: 'balanced', form: 0, fatigue: 0 }, bomber, EV),
      ])
      const res = simTournament(EV, field, rng, { conditions: cond }).results
      const a = res.find((r) => r.pid === 1)
      const b = res.find((r) => r.pid === 2)
      if (a.toPar < b.toPar) sWins += 1
    }
    return (100 * sWins) / N
  }
  const inCalm = headToHead(flat(0.05))
  const inWind = headToHead(flat(0.85))
  check('the wind pays the straight hitter', inWind > inCalm + 6,
    `${inCalm.toFixed(0)}% calm vs ${inWind.toFixed(0)}% windy`)
  console.log(`   straight-and-steady beats the bomber ${inCalm.toFixed(0)}% of the time in calm, ${inWind.toFixed(0)}% in a gale`)

  // Whatever the sky is doing, the two simulation paths have to agree, or the
  // player's own events would be scored on a different curve to the world's.
  const cutRate = (detailed, wind) => {
    const rng = new Rng(1717)
    let made = 0
    const N = 420
    for (let i = 0; i < N; i++) {
      const field = pack(rng, [makeEntrant({ pid: 1, name: 'Me', isUser: true, playstyle: 'balanced', form: 0, fatigue: 0 }, straight, EV)])
      const me = simTournament(EV, field, rng, { conditions: flat(wind), detailed }).results.find((r) => r.pid === 1)
      if (me.madeCut) made += 1
    }
    return (100 * made) / N
  }
  for (const wind of [0.05, 0.85]) {
    const cheap = cutRate(false, wind)
    const played = cutRate(true, wind)
    check(`both sim paths agree at wind ${wind}`, Math.abs(cheap - played) < 7,
      `cheap ${cheap.toFixed(0)}% vs played ${played.toFixed(0)}%`)
  }

  // Rounds still add up when each day has its own weather.
  const rng = new Rng(55)
  const mixed = { wind: 0.5, rain: 0.3, rounds: [{ wind: 0.05, rain: 0 }, { wind: 0.95, rain: 0.9 }, { wind: 0.2, rain: 0.1 }, { wind: 0.8, rain: 0.2 }] }
  const played = simTournament(EV, pack(rng), rng, { conditions: mixed, detailed: true, detailRows: 144 })
  const bad = played.results.filter((r) => r.rounds && r.rounds.reduce((a, x) => a + x.toPar, 0) !== r.toPar)
  check('rounds add up on a week of mixed weather', bad.length === 0, `${bad.length} rows do not sum`)
  check('the result reports the conditions', typeof played.conditions?.wind === 'number' && conditionsLabel(played.conditions).length > 0,
    JSON.stringify(played.conditions))

  // Rolled weather stays inside its bounds and averages out to a normal week.
  const wr = new Rng(303)
  let wSum = 0
  let worst = 0
  for (let i = 0; i < 4000; i++) {
    const c = rollConditions(wr, COURSE_TYPE_LIST[i % COURSE_TYPE_LIST.length])
    wSum += c.wind
    worst = Math.max(worst, c.wind)
    if (c.wind < 0 || c.wind > 1 || c.rain < 0 || c.rain > 1) { worst = 99; break }
  }
  check('weather stays inside its bounds', worst <= 1, `max wind ${worst.toFixed(2)}`)
  check('an average week across the tour is a normal one', Math.abs(wSum / 4000 - NORMAL_WIND) < 0.03,
    `mean wind ${(wSum / 4000).toFixed(3)} vs ${NORMAL_WIND}`)
}

section('SCENARIO 22 — horses for courses')
{
  check('a course you have never seen is a disadvantage', venueEdge(0, 0) < 0, `${venueEdge(0, 0)}`)
  check('a course you know is an advantage', venueEdge(8, 0) > 0, `${venueEdge(8, 0)}`)
  check('familiarity stops mattering after a while', venueEdge(8, 0) === venueEdge(40, 0))
  check('winning somewhere helps, but does not stack forever', venueEdge(8, 12) === venueEdge(8, 3))
  // Half a shot a week, not two. This is the sort of number that quietly runs
  // away with a career if it is left uncapped.
  const swing = venueEdge(40, 9) - venueEdge(0, 0)
  check('course knowledge is worth less than a stroke and a half', swing * 0.34 < 1.6, `${(swing * 0.34).toFixed(2)} strokes`)
  console.log(`   never seen it ${venueEdge(0, 0).toFixed(1)} → know it and won on it ${venueEdge(8, 3).toFixed(1)} rating points`)

  // It has to actually accumulate, and survive being saved.
  const s = E.newGame({ name: 'Course Horse', seed: 606, talent: 0.62, age: 22 })
  for (let i = 0; i < 6; i++) {
    E.autoOffseason(s)
    E.startSeason(s)
    E.simToOffseason(s)
  }
  const visits = Object.entries(s.career.venueStarts)
  const totalVisits = visits.reduce((a, [, n]) => a + n, 0)
  check('venue starts are recorded', visits.length > 0 && totalVisits === s.career.starts,
    `${totalVisits} recorded across ${visits.length} courses vs ${s.career.starts} starts`)
  const most = visits.sort((a, b) => b[1] - a[1])[0]
  check('somewhere gets played more than once', most && most[1] > 1, most ? `${most[0]} ${most[1]}×` : 'none')
  const back = importSave(exportSave(s))
  check('course knowledge survives a save', back.career.venueStarts[most[0]] === most[1],
    `${back.career.venueStarts[most[0]]} vs ${most[1]}`)
  console.log(`   after 6 seasons the most familiar course is ${most[0]}, played ${most[1]}×`)

  // And it has to show up on a scorecard.
  const EV = { id: 'v', name: 'V', courseType: 'classic', difficulty: 1, fieldSize: 144, cutSize: 65, purse: 8e6, circuit: 'domestic' }
  const mine = emptyRatings(70)
  const finishAt = (edge) => {
    const rng = new Rng(2468)
    let sum = 0
    const N = 700
    for (let i = 0; i < N; i++) {
      const field = [makeEntrant({ pid: 0, name: 'Me', isUser: true, playstyle: 'balanced', form: 0, fatigue: 0 }, mine, EV, { qualityBonus: edge })]
      for (let j = 1; j < EV.fieldSize; j++) {
        const r = emptyRatings(Math.round(rng.gaussClamped(68, 7)))
        field.push(makeEntrant({ pid: j, name: `P${j}`, playstyle: 'balanced', form: 0, fatigue: 0 }, r, EV))
      }
      sum += simTournament(EV, field, rng, { conditions: { wind: 0.35, rain: 0.2, rounds: [0, 1, 2, 3].map(() => ({ wind: 0.35, rain: 0.2 })) } })
        .results.find((r) => r.pid === 0).toPar
    }
    return sum / N
  }
  const stranger = finishAt(venueEdge(0, 0))
  const regular = finishAt(venueEdge(8, 2))
  check('knowing the course shows up in the score', regular < stranger, `${regular.toFixed(2)} vs ${stranger.toFixed(2)}`)
  console.log(`   same player, same course: ${stranger.toFixed(2)} as a stranger, ${regular.toFixed(2)} as a regular`)
}

section('SCENARIO 23 — a new club has to be earned')
{
  const s = E.newGame({ name: 'Gearhead', seed: 4242, talent: 0.6, age: 22 })
  const yrs = s.yearsElapsed
  const before = { ...s.effRatings }
  check('the bag you have always played needs no bedding in',
    beddingIn(s.bag, s.career.starts).length === 0, JSON.stringify(beddingIn(s.bag, s.career.starts)))

  // Drop a genuinely better putter in the bag mid-career and it costs you first.
  const fresh = equipItem({ ...s.bag.putter, tech: s.bag.putter.tech + 6 }, 'putter', s.bag, s.career.starts)
  s.bag = { ...s.bag, putter: fresh }
  E.refreshDerived(s)
  check('a brand new putter is worse than the one you trusted', s.effRatings.putting < before.putting,
    `${s.effRatings.putting} vs ${before.putting}`)
  const settling = beddingIn(s.bag, s.career.starts)
  check('the game says which club is settling', settling.length === 1 && settling[0].slot === 'putter',
    JSON.stringify(settling))

  // Play enough tournaments with it and it becomes the upgrade it always was.
  s.career.starts += 10
  E.refreshDerived(s)
  check('a bedded-in upgrade is an upgrade', s.effRatings.putting > before.putting,
    `${s.effRatings.putting} vs ${before.putting}`)
  check('and it has stopped settling', beddingIn(s.bag, s.career.starts).length === 0)

  // A marginal upgrade is not worth the disruption; a real one is.
  const bagWith = (delta) => ({ ...s.bag, irons: equipItem({ ...s.bag.irons, tech: s.bag.irons.tech + delta }, 'irons', s.bag, 0) })
  const ironsAt = (bag, starts) => equipmentBonus(bag, yrs, starts).irons || 0
  const settledOld = ironsAt(s.bag, 999)
  check('a one-point upgrade is a loss on the day you make it',
    ironsAt(bagWith(1), 0) < settledOld, `${ironsAt(bagWith(1), 0).toFixed(2)} vs ${settledOld.toFixed(2)}`)
  check('a big upgrade still costs you on the day you make it',
    ironsAt(bagWith(12), 0) < ironsAt(bagWith(12), 999),
    `${ironsAt(bagWith(12), 0).toFixed(2)} vs ${ironsAt(bagWith(12), 999).toFixed(2)}`)
  // The clubs you feel take longer than the one you just hit.
  check('a putter takes longer to trust than a driver',
    startsToSettle({ addedAt: 0 }, 'putter', 3) > startsToSettle({ addedAt: 0 }, 'driver', 3))
  console.log(`   settled irons ${settledOld.toFixed(2)} → brand new +1 tech ${ironsAt(bagWith(1), 0).toFixed(2)} → brand new +12 tech ${ironsAt(bagWith(12), 0).toFixed(2)}`)

  // Signing an equipment deal replaces every club at once, and that is felt.
  const s2 = E.newGame({ name: 'Signed', seed: 909, talent: 0.6, age: 22 })
  s2.career.starts = 60
  E.refreshDerived(s2)
  const settledOvr = s2.ovr
  s2.bag = sponsorGear(new Rng(5), 'Kestrel', 0.9, s2.yearsElapsed, s2.year, s2.career.starts, s2.bag)
  E.refreshDerived(s2)
  const switchedOvr = s2.ovr
  s2.career.starts += 10
  E.refreshDerived(s2)
  check('a whole new bag is a real setback before it is a gain', switchedOvr < settledOvr,
    `${switchedOvr} vs ${settledOvr}`)
  check('and top-end sponsor gear is worth having once you can use it', s2.ovr > settledOvr,
    `${s2.ovr} vs ${settledOvr}`)
  console.log(`   whole-bag switch: ${settledOvr.toFixed(1)} ovr → ${switchedOvr.toFixed(1)} on day one → ${s2.ovr.toFixed(1)} once bedded in`)
}

section('SCENARIO 24 — the week that pays nothing')
{
  // Alternating cups, so every region gets a side every other year.
  const years = [2030, 2031, 2032, 2033]
  check('the two cups alternate', years.map((y) => cupForYear(y).id).join(',') === 'continental,pacific,continental,pacific',
    years.map((y) => cupForYear(y).id).join(','))
  const covered = new Set()
  for (const cup of [CUPS.continental, CUPS.pacific]) {
    for (const side of [cup.home, cup.away]) for (const r of side.regions) covered.add(r)
  }
  check('every region in the game has a side to play for', REGIONS.every((r) => covered.has(r.id)),
    REGIONS.filter((r) => !covered.has(r.id)).map((r) => r.id).join(','))

  // Neither side is structurally favoured. Identical teams must split evenly.
  {
    const rng = new Rng(31)
    const team = (n) =>
      Array.from({ length: 12 }, (_, i) => ({
        player: { pid: n * 100 + i, name: `${n}-${i}`, form: 0, fatigue: 0, ratings: emptyRatings(65) },
        ratings: emptyRatings(65),
        pick: false,
      }))
    let home = 0
    let away = 0
    let pts = 0
    const N = 1200
    for (let i = 0; i < N; i++) {
      const r = simCup(CUPS.continental, team(1), team(2), 'classic', rng, null)
      pts += r.homePts
      if (r.winner === CUPS.continental.home.id) home += 1
      else away += 1
      if (r.homePts + r.awayPts !== 28) { home = -1; break }
    }
    check('a cup is always worth 28 points', home >= 0)
    check('neither side of a cup is favoured', Math.abs(pts / N - 14) < 0.4, `home averages ${(pts / N).toFixed(2)}/28`)
    console.log(`   identical teams: ${home}/${away} and ${(pts / N).toFixed(2)} points a side`)
  }

  // Match play throws away the size of a beating, so an individual underdog
  // wins far more often than eighteen holes of stroke play would allow — but
  // over 28 matches a genuinely better *team* still comes through. Real cup
  // sides are within a point or two of each other, which is why they are
  // close; that is the gap worth testing.
  {
    const rng = new Rng(77)
    const side = (base, r) =>
      Array.from({ length: 12 }, (_, i) => ({
        player: { pid: base + i, name: `p${base + i}`, form: 0, fatigue: 0, ratings: emptyRatings(r) },
        ratings: emptyRatings(r),
        pick: false,
      }))
    const rateFor = (gap) => {
      let strong = 0
      const N = 500
      for (let i = 0; i < N; i++) {
        if (simCup(CUPS.pacific, side(0, 64 + gap), side(50, 64), 'classic', rng, null).winner === CUPS.pacific.home.id)
          strong += 1
      }
      return (100 * strong) / N
    }
    const close = rateFor(2)
    const wide = rateFor(8)
    check('the better side of a close cup usually wins', close > 55, `${close.toFixed(0)}%`)
    check('but a close cup is genuinely close', close < 88, `${close.toFixed(0)}%`)
    check('a mismatch is a mismatch', wide > close + 8, `${wide.toFixed(0)}% vs ${close.toFixed(0)}%`)
    console.log(`   a side two points better wins ${close.toFixed(0)}% of cups; eight points better, ${wide.toFixed(0)}%`)
  }

  // A tie retains: the holder keeps it.
  {
    const tie = simCup(CUPS.continental, [], [], 'classic', new Rng(1), CUPS.continental.away.id)
    check('a 0–0 cup is retained by the holder', tie.winner === CUPS.continental.away.id && tie.retained,
      `${tie.winner}`)
  }

  // And it has to actually happen in a career, with records that add up.
  const s = E.newGame({ name: 'Cap', seed: 5150, talent: 0.82, age: 22, regionId: 'usa' })
  for (let i = 0; i < 12; i++) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    E.simToOffseason(s)
  }
  check('the cups were played every season', s.cupHistory.length === 12, `${s.cupHistory.length} cups`)
  check('every cup was won by somebody', s.cupHistory.every((h) => h.winner), '')
  // The mechanism itself, tested directly rather than through a whole career.
  {
    const rng = new Rng(4001)
    const pool = Array.from({ length: 60 }, (_, i) => ({
      pid: i + 1, name: `R${i}`, region: 'usa', rank: i + 1, form: 0, retired: false,
    }))
    const side = selectTeam(pool, CUPS.continental.home, rng)
    check('a cup side is twelve', side.length === 12, `${side.length}`)
    const autos = side.filter((e) => !e.pick)
    check('the ten best ranked qualify automatically',
      autos.length === 10 && autos.every((e) => e.player.rank <= 10),
      autos.map((e) => e.player.rank).join(','))
    const picks = side.filter((e) => e.pick)
    check("the captain's two picks come from outside those ten",
      picks.length === 2 && picks.every((e) => e.player.rank > 10),
      picks.map((e) => e.player.rank).join(','))
    check('nobody is picked twice', new Set(side.map((e) => e.player.pid)).size === 12)
  }
  const r = s.career.teamRecord
  check('the team record adds up to matches played', r.w + r.l + r.h >= s.career.teamCaps * 4,
    `${recordText(r)} from ${s.career.teamCaps} caps`)
  check('you cannot win more cups than you played in', s.career.teamCupWins <= s.career.teamCaps,
    `${s.career.teamCupWins} of ${s.career.teamCaps}`)
  check('caps are counted against the cups that were played',
    s.career.teamCaps === s.cupHistory.filter((h) => h.played).length,
    `${s.career.teamCaps} vs ${s.cupHistory.filter((h) => h.played).length}`)
  // Cup week is cleared: you cannot be in two places at once.
  const cupWeekStarts = s.career.allResults.filter((x) => x.week === CUP_WEEK).length
  check('you never played a tournament in a cup week you were picked for',
    cupWeekStarts <= s.cupHistory.filter((h) => !h.played).length, `${cupWeekStarts} starts in week ${CUP_WEEK}`)
  const back = importSave(exportSave(s))
  check('caps survive a save', back.career.teamCaps === s.career.teamCaps && back.cupHistory.length === 12)
  console.log(`   ${s.career.teamCaps} caps, ${recordText(s.career.teamRecord)}, ${s.career.teamCupWins} cups won over 12 seasons`)
}

section('SCENARIO 25 — the rest of the world is mortal too')
{
  // `driftForm` decremented weeksLeft and `aiEligible` refused to field an
  // injured player, but nothing ever *gave* an AI player an injury, so the
  // world number one teed it up forty-four weeks a year for thirty years.
  const s = E.newGame({ name: 'Observer', seed: 4242, talent: 0.7, age: 21 })
  const startOvr = tourAvgOvr(s)
  let weeks = 0
  let hurtWeeks = 0
  let outWeeks = 0
  let activeSum = 0
  const spells = new Set()
  let everInAFieldWhileOut = 0

  for (let yr = 0; yr < 12; yr++) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    while (s.phase === 'season') {
      // Snapshot who is already sidelined before the week runs. Checking after
      // would flag anyone who played on Sunday and got hurt on the range that
      // same week, which is not a bug — that is the order things happen in.
      const sidelined = new Set()
      for (const p of s.world.players) if (p.injury && p.injury.out && !p.isUser) sidelined.add(p.pid)
      const playedWeek = s.week
      E.simWeek(s)
      weeks += 1
      let hurt = 0
      let out = 0
      let active = 0
      for (const p of s.world.players) {
        if (p.retired || p.isUser) continue
        active += 1
        if (!p.injury) continue
        hurt += 1
        if (p.injury.out) out += 1
        spells.add(`${p.pid}:${p.injury.id}:${p.injury.weeksTotal}:${p.injury.startedWeek}`)
      }
      hurtWeeks += hurt
      outWeeks += out
      activeSum += active
      // Nobody who was already sidelined on Monday can be on Sunday's board.
      for (const summary of Object.values(s.seasonResults)) {
        if (summary.week !== playedWeek) continue
        for (const r of summary.top || []) if (sidelined.has(r.pid)) everInAFieldWhileOut += 1
      }
    }
  }

  check('the world gets injured at all', spells.size > 0, `${spells.size} spells`)
  const outPct = (100 * outWeeks) / Math.max(1, activeSum)
  const hurtPct = (100 * hurtWeeks) / Math.max(1, activeSum)
  check('a believable share of the tour is sidelined', outPct > 1.5 && outPct < 12, `${outPct.toFixed(1)}% out`)
  check('more are carrying something than are actually out', hurtPct > outPct, `${hurtPct.toFixed(1)}% vs ${outPct.toFixed(1)}%`)
  check('a sidelined player never appears on a leaderboard', everInAFieldWhileOut === 0, `${everInAFieldWhileOut} did`)

  // Nobody gets stuck hurt forever, and comebacks do not grind the tour down.
  const stuck = s.world.players.filter((p) => !p.retired && p.injury && p.injury.weeksLeft > p.injury.weeksTotal)
  check('nobody is injured for longer than their diagnosis', stuck.length === 0, `${stuck.length} stuck`)
  const endOvr = tourAvgOvr(s)
  check('lasting damage does not grind the whole tour down', Math.abs(endOvr - startOvr) < 6,
    `tour average ${startOvr.toFixed(1)} → ${endOvr.toFixed(1)} over ${(weeks / 44).toFixed(0)} seasons`)
  console.log(`   ${outPct.toFixed(1)}% of the tour sidelined at any moment, ${hurtPct.toFixed(1)}% carrying something`)
  console.log(`   tour average overall ${startOvr.toFixed(1)} → ${endOvr.toFixed(1)} across ${(weeks / 44).toFixed(0)} seasons`)
}

section('SCENARIO 26 — the man on the bag knows your misses')
{
  // yearsWithYou was stamped on every hire and read by nothing, so a caddie of
  // ten years was worth exactly what a stranger of the same rating was worth.
  const man = (q, y) => ({ q, yearsWithYou: y, trait: 'none' })
  check('a new hire is worth less than their rating', effectiveQ(man(0.6, 0)) < 0.6, `${effectiveQ(man(0.6, 0))}`)
  check('a long server is worth more', effectiveQ(man(0.6, 8)) > 0.6, `${effectiveQ(man(0.6, 8))}`)
  check('rapport stops growing eventually', effectiveQ(man(0.6, 8)) === effectiveQ(man(0.6, 30)))
  check('rapport is monotonic in tenure',
    [0, 1, 2, 3, 4, 5, 6].every((y, i, a) => i === 0 || effectiveQ(man(0.6, y)) > effectiveQ(man(0.6, a[i - 1]))))
  check('nobody has rapport with a vacancy', effectiveQ(null) === 0 && rapport(null) === 0)

  // The point of it: a modest upgrade on paper is a downgrade on the day.
  const ev = { isMajor: false, flagship: false }
  const settled = staffMatchdayEffect({ caddie: man(0.6, 8), psych: null }, ev).quality
  const poached = staffMatchdayEffect({ caddie: man(0.7, 0), psych: null }, ev).quality
  check('swapping a settled caddie for a better stranger costs you at first', poached < settled,
    `${poached.toFixed(3)} vs ${settled.toFixed(3)}`)
  let overtakeYear = 0
  while (overtakeYear < 20 && staffMatchdayEffect({ caddie: man(0.7, overtakeYear), psych: null }, ev).quality <= settled) {
    overtakeYear += 1
  }
  check('but a genuinely better hire does overtake', overtakeYear < 20, `${overtakeYear}`)
  check('and it takes years, not weeks', overtakeYear >= 2, `${overtakeYear}`)
  console.log(`   a settled 60 beats a fresh 70 for ${overtakeYear} seasons before the swap pays off`)

  // A really big upgrade should still be worth taking immediately.
  const star = staffMatchdayEffect({ caddie: man(0.95, 0), psych: null }, ev).quality
  check('a large upgrade is worth taking straight away', star > settled, `${star.toFixed(3)} vs ${settled.toFixed(3)}`)

  // Tenure has to actually accrue over a career, and survive a save.
  const s = E.newGame({ name: 'Loyal', seed: 8080, talent: 0.68, age: 22 })
  E.autoOffseason(s)
  const firstTeam = STAFF_ROLES.map((r) => s.staff[r.id]).filter(Boolean)
  check('a brand new team starts on zero', firstTeam.every((m) => (m.yearsWithYou || 0) === 0),
    firstTeam.map((m) => m.yearsWithYou).join(','))
  E.startSeason(s)
  E.simToOffseason(s)
  const afterOne = STAFF_ROLES.map((r) => s.staff[r.id]).filter(Boolean)
  check('a season together counts as a season', afterOne.every((m) => (m.yearsWithYou || 0) >= 1),
    afterOne.map((m) => m.yearsWithYou).join(','))
  for (let i = 0; i < 5; i++) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    E.simToOffseason(s)
  }
  const tenures = STAFF_ROLES.map((r) => s.staff[r.id]).filter(Boolean).map((m) => m.yearsWithYou || 0)
  check('somebody has been kept on', tenures.some((t) => t >= 2), tenures.join(','))
  check('nobody has more tenure than seasons played', Math.max(...tenures, 0) <= s.career.seasons.length,
    `${Math.max(...tenures, 0)} vs ${s.career.seasons.length} seasons`)
  const back = importSave(exportSave(s))
  check('tenure survives a save',
    STAFF_ROLES.every((r) => (back.staff[r.id]?.yearsWithYou ?? null) === (s.staff[r.id]?.yearsWithYou ?? null)))
  console.log(`   after ${s.career.seasons.length} seasons the team's tenures are ${tenures.join(', ')}`)
}

section('SCENARIO 27 — the flight in')
{
  // Travel used to cost a flat +7 fatigue for any change of circuit, which
  // charged the drive between two domestic stops what it charged a
  // Florida-to-Kuala-Lumpur redeye.
  check('two events in the same part of the world are not a flight', zoneGap('home', 'home') === 0)
  check('the far side of the world is further than the near side',
    zoneGap('home', 'asia') > zoneGap('home', 'intl'), `${zoneGap('home', 'asia')} vs ${zoneGap('home', 'intl')}`)
  check('distance does not depend on which way you fly',
    zoneGap('home', 'asia') === zoneGap('asia', 'home') && zoneGap('intl', 'asia') === zoneGap('asia', 'intl'))
  check('every circuit is placed somewhere', Object.keys(CIRCUITS).every((c) => TRAVEL_ZONE[c]),
    Object.keys(CIRCUITS).filter((c) => !TRAVEL_ZONE[c]).join(','))

  const lag = (from, to, weeksSince) =>
    E.jetLag({ lastZonePlayed: from, week: 20, lastPlayedWeek: 20 - weeksSince }, { circuit: to, zone: TRAVEL_ZONE[to] })
  check('flying home to Asia costs more than home to Europe', lag('home', 'asian', 1) > lag('home', 'intl', 1),
    `${lag('home', 'asian', 1).toFixed(1)} vs ${lag('home', 'intl', 1).toFixed(1)}`)
  check('driving to the next domestic stop costs nothing', lag('home', 'domestic', 1) === 0)
  check('a week at home helps', lag('home', 'asian', 2) < lag('home', 'asian', 1))
  check('a month at home is a full cure', lag('home', 'asian', 4) === 0, `${lag('home', 'asian', 4)}`)
  check('turning straight round is the worst case',
    lag('home', 'asian', 1) >= lag('home', 'asian', 2) && lag('home', 'asian', 2) >= lag('home', 'asian', 3))
  check('the first event of a career is not jet lag',
    E.jetLag({ lastZonePlayed: null, week: 1, lastPlayedWeek: null }, { circuit: 'asian', zone: 'asia' }) === 0)
  console.log(`   home→Asia back to back costs ${lag('home', 'asian', 1).toFixed(1)} fatigue, ${lag('home', 'asian', 2).toFixed(1)} with a week off, ${lag('home', 'asian', 3).toFixed(1)} with two`)

  // The two overseas majors are actually overseas.
  const s = E.newGame({ name: 'Flyer', seed: 3131, talent: 0.7, age: 22 })
  E.autoOffseason(s)
  E.startSeason(s)
  const links = s.season.find((e) => e.id === 'maj_links')
  const magnolia = s.season.find((e) => e.id === 'maj_magnolia')
  check('the Open Links is abroad', links && links.zone === 'intl', links ? links.zone : 'missing')
  check('Magnolia is not', magnolia && magnolia.zone === 'home', magnolia ? magnolia.zone : 'missing')
  check('every event on the calendar knows where it is', s.season.every((e) => !!e.zone),
    s.season.filter((e) => !e.zone).length + ' without a zone')

  // A season planned across three continents is visibly costlier than one at home.
  const plan = (ids) => {
    const st = E.newGame({ name: 'Planner', seed: 3131, talent: 0.7, age: 22 })
    E.autoOffseason(st)
    E.startSeason(st)
    st.entered = {}
    for (const id of ids) st.entered[id] = true
    return E.longHaulWeeks(st)
  }
  const byWeek = [...s.season].sort((a, b) => a.week - b.week)
  const homeOnly = byWeek.filter((e) => e.circuit === 'domestic').slice(0, 8).map((e) => e.id)
  const globeTrot = []
  for (const z of ['domestic', 'asian', 'domestic', 'asian', 'intl', 'domestic']) {
    const ev = byWeek.find((e) => e.circuit === z && !globeTrot.includes(e.id))
    if (ev) globeTrot.push(ev.id)
  }
  check('a domestic season has no long-haul weeks', plan(homeOnly).length === 0, `${plan(homeOnly).length} flagged`)
  check('a globetrotting season is flagged before you commit to it', plan(globeTrot).length > 0,
    `${plan(globeTrot).length} flagged`)
  console.log(`   a home schedule flags ${plan(homeOnly).length} long-haul weeks; hopping continents flags ${plan(globeTrot).length}`)
}

section('SCENARIO 28 — the calendar has seasons')
{
  // Week five and week thirty used to share a climate, which made the season a
  // flat run of interchangeable weeks.
  check('midsummer is the height of the year', seasonPhase(24) > 0.9, `${seasonPhase(24).toFixed(2)}`)
  check('the two ends of the calendar are the depths',
    seasonPhase(1) < -0.85 && seasonPhase(44) < -0.85, `${seasonPhase(1).toFixed(2)} / ${seasonPhase(44).toFixed(2)}`)
  // A full period, so the season average is the calibrated normal week.
  let phaseSum = 0
  for (let w = 1; w <= 44; w++) phaseSum += seasonPhase(w)
  check('the season averages out to a normal year', Math.abs(phaseSum / 44) < 0.05, `${(phaseSum / 44).toFixed(3)}`)

  const meanFor = (week, type = 'classic') => {
    const rng = new Rng(2200)
    let w = 0
    let r = 0
    const N = 2500
    for (let i = 0; i < N; i++) {
      const c = rollConditions(rng, type, week)
      w += c.wind
      r += c.rain
    }
    return { wind: w / N, rain: r / N }
  }
  const spring = meanFor(3)
  const summer = meanFor(24)
  const autumn = meanFor(42)
  check('summer is drier than spring', summer.rain < spring.rain - 0.08,
    `${summer.rain.toFixed(3)} vs ${spring.rain.toFixed(3)}`)
  check('summer is calmer than autumn', summer.wind < autumn.wind - 0.05,
    `${summer.wind.toFixed(3)} vs ${autumn.wind.toFixed(3)}`)
  check('both ends of the year are alike', Math.abs(spring.wind - autumn.wind) < 0.05,
    `${spring.wind.toFixed(3)} vs ${autumn.wind.toFixed(3)}`)
  console.log(`   wind: ${spring.wind.toFixed(2)} in spring, ${summer.wind.toFixed(2)} midsummer, ${autumn.wind.toFixed(2)} in autumn`)
  console.log(`   rain: ${spring.rain.toFixed(2)} in spring, ${summer.rain.toFixed(2)} midsummer, ${autumn.rain.toFixed(2)} in autumn`)

  // Which has to reach the scorecard: midsummer plays easier than March.
  const EVW = { id: 'sw', name: 'SW', courseType: 'classic', difficulty: 1, fieldSize: 144, cutSize: 65, purse: 8e6, circuit: 'domestic' }
  const winnerAt = (week) => {
    const rng = new Rng(9100)
    let total = 0
    const N = 260
    for (let i = 0; i < N; i++) {
      const field = []
      for (let j = 0; j < EVW.fieldSize; j++) {
        const r = emptyRatings(Math.round(rng.gaussClamped(64, 8)))
        field.push(makeEntrant({ pid: j, name: `P${j}`, playstyle: 'balanced', form: 0, fatigue: 0 }, r, EVW))
      }
      total += simTournament({ ...EVW, week }, field, rng).winner.toPar
    }
    return total / N
  }
  const march = winnerAt(3)
  const july = winnerAt(24)
  check('midsummer scores better than early spring', july < march - 0.8,
    `${july.toFixed(1)} in week 24 vs ${march.toFixed(1)} in week 3`)
  console.log(`   average winning score: ${march.toFixed(1)} in week 3, ${july.toFixed(1)} in week 24`)

  // The archetype still dominates: a links in July is windier than a resort in March.
  check('where you are still matters more than when',
    meanFor(24, 'links').wind > meanFor(3, 'resort').wind,
    `${meanFor(24, 'links').wind.toFixed(2)} vs ${meanFor(3, 'resort').wind.toFixed(2)}`)
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`)
console.log(`${pass} passed, ${fail} failed`)
if (fail) {
  console.log('\nFAILURES:')
  failures.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
}
