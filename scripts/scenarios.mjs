// Scenario tests: play the game the way people will, and assert the things
// that should always be true. `node scripts/scenarios.mjs`
//
// This is not a unit-test suite — it drives whole careers through the public
// engine API and checks invariants after every season.

import * as E from '../src/game/engine.js'
import { ATTR_KEYS, SENIOR_AGE, TRAINING_OPTIONS, CIRCUITS, COURSE_TYPES, PAYOUT_PCT, SPONSOR_CATEGORIES } from '../src/game/constants.js'
import { overall, progressYear, emptyRatings } from '../src/game/ratings.js'
import { simTournament, makeEntrant } from '../src/game/tournament.js'
import { coachTrainingBonus, staffMatchdayEffect, qualityEffect, qualityOf } from '../src/game/staff.js'
import { exportSave, importSave, cloneState } from '../src/game/save.js'
import { checkEligibility, cardStatus } from '../src/game/eligibility.js'
import { fmtMoney, debtInterest, backerOffer, splitPrize } from '../src/game/finance.js'
import { dealValue, generateOffers, MAX_CONCURRENT_DEALS } from '../src/game/sponsors.js'
import { Rng, clamp } from '../src/game/rng.js'
import { conditionsLabel, rollConditions, NORMAL_WIND } from '../src/game/weather.js'

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
  const q = 0.62
  const coach = { coach: { q, trait: 'putting', traitAttr: 'putting' }, caddie: null, psych: null, physio: null, agent: null }
  check('coach: quality x 0.85 outside their specialty',
    Math.abs(coachTrainingBonus(coach, 'irons') - q * 0.85) < 1e-9,
    `${coachTrainingBonus(coach, 'irons')} vs ${q * 0.85}`)
  check('coach: +0.55 more inside it',
    Math.abs(coachTrainingBonus(coach, 'putting') - (q * 0.85 + 0.55)) < 1e-9,
    `${coachTrainingBonus(coach, 'putting')} vs ${q * 0.85 + 0.55}`)

  const ordinary = { isMajor: false, flagship: false }
  const cad = staffMatchdayEffect({ caddie: { q, trait: 'none' }, psych: null }, ordinary)
  check('caddie: quality x 0.8 in playing quality', Math.abs(cad.quality - q * 0.8) < 1e-9, `${cad.quality} vs ${q * 0.8}`)
  check('caddie: variance cut by quality x 7%', Math.abs(cad.sigmaMult - (1 - q * 0.07)) < 1e-9,
    `${cad.sigmaMult} vs ${1 - q * 0.07}`)

  const psy = staffMatchdayEffect({ caddie: null, psych: { q, trait: 'none' } }, ordinary)
  check('psych: quality x 0.5 on an ordinary week', Math.abs(psy.quality - q * 0.5) < 1e-9, `${psy.quality} vs ${q * 0.5}`)
  const psyMajor = staffMatchdayEffect({ caddie: null, psych: { q, trait: 'none' } }, { isMajor: true, flagship: false })
  check('psych: 1.8x that in a major', Math.abs(psyMajor.quality - q * 0.5 * 1.8) < 1e-9,
    `${psyMajor.quality} vs ${q * 0.5 * 1.8}`)

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
    for (let seed = 0; seed < 5; seed++) {
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
    console.log(`   ${t.label.padEnd(11)} ${broke}/5 ran out of money, ${everInDebt}/5 were in debt at some point, ended at ${meanAge.toFixed(0)}`)
    if (t.expectBroke) {
      check(`${t.label}: mostly ends at the bank`, broke >= 3, `only ${broke}/5 went broke`)
      check(`${t.label}: but not instantly`, meanAge >= 25, `folded at a mean age of ${meanAge.toFixed(1)}`)
    } else if (t.mayStruggle) {
      // Since the cut moved to 36 holes a median player really can fail —
      // measured at about three in ten — but it must not be the usual outcome.
      check(`${t.label}: usually survives`, broke <= 2, `${broke}/5 went broke`)
    } else {
      check(`${t.label}: does not go broke`, broke === 0, `${broke}/5 went broke`)
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
  let worst = null
  for (let seed = 0; seed < 4; seed++) {
    const s = E.newGame({ name: 'Great', seed: 6100 + seed * 401, talent: 0.86, age: 21 })
    while (!s.player.retired && s.player.age < 46) {
      E.autoOffseason(s)
      if (s.player.retired) break
      E.startSeason(s)
      E.simToOffseason(s)
    }
    if (!worst || s.finance.cash > worst.cash) worst = { cash: s.finance.cash, majors: s.career.majors, wins: s.career.wins }
  }
  // Tiger's lifetime net worth is about $1bn off 15 majors. Ours may exceed it
  // for a career that exceeds his, but not by an order of magnitude.
  const ceiling = 400_000_000 + worst.majors * 120_000_000
  check('the richest career is not absurd', worst.cash < ceiling,
    `${fmtMoney(worst.cash)} off ${worst.majors} majors and ${worst.wins} wins`)
  console.log(`   richest of four elite careers: ${fmtMoney(worst.cash, { compact: true })} off ${worst.majors} majors, ${worst.wins} wins`)
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

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`)
console.log(`${pass} passed, ${fail} failed`)
if (fail) {
  console.log('\nFAILURES:')
  failures.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
}
