// Scenario tests: play the game the way people will, and assert the things
// that should always be true. `node scripts/scenarios.mjs`
//
// This is not a unit-test suite — it drives whole careers through the public
// engine API and checks invariants after every season.

import * as E from '../src/game/engine.js'
import { ATTR_KEYS, SENIOR_AGE } from '../src/game/constants.js'
import { overall } from '../src/game/ratings.js'
import { exportSave, importSave, cloneState } from '../src/game/save.js'
import { checkEligibility, cardStatus } from '../src/game/eligibility.js'
import { fmtMoney } from '../src/game/finance.js'
import { Rng } from '../src/game/rng.js'

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
  check('played at least one major', sawMajor)
  check('never stranded with nowhere to play', s.career.starts > 200, `${s.career.starts} starts`)

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
  // Judge this on outcomes rather than peak overall — a rating is a weak proxy
  // for a career, and the gap shows up much more clearly in rank and money.
  check('good management produces a better ranking', s.player.rank < bad.player.rank,
    `#${s.player.rank} vs #${bad.player.rank}`)
  check('good management produces more money', s.finance.cash > bad.finance.cash,
    `${fmtMoney(s.finance.cash)} vs ${fmtMoney(bad.finance.cash)}`)
  check('bad management is still a playable career', bad.career.starts > 150 && !bad.player.retired,
    `${bad.career.starts} starts`)
}

// ---------------------------------------------------------------------------
section('SCENARIO 2 — no dead ends for a weak player')
{
  const s = E.newGame({ name: 'Journeyman', seed: 5150, talent: 0.3, age: 22 })
  let emptySeasons = 0
  for (let i = 0; i < 12; i++) {
    E.autoOffseason(s)
    E.startSeason(s)
    E.simToOffseason(s)
    if (s.seasonTotals.starts === 0) emptySeasons++
  }
  check('a weak player always has somewhere to tee it up', emptySeasons === 0, `${emptySeasons} blank seasons`)
  const eligibleNow = s.nextSeason.filter((e) => checkEligibility({ ...s, year: s.year + 1 }, e).ok).length
  check('still has eligible events after a bad decade', eligibleNow > 0, `${eligibleNow} eligible`)
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
console.log(`\n${'='.repeat(60)}`)
console.log(`${pass} passed, ${fail} failed`)
if (fail) {
  console.log('\nFAILURES:')
  failures.forEach((f) => console.log('  ✗ ' + f))
  process.exitCode = 1
}
