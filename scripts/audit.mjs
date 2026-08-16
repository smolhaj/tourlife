// Audit: does the game make sane decisions, and do its own numbers agree?
// `npm run audit`
//
// The scenario suite checks invariants — nothing is NaN, money conserves, a
// mechanic moves in the direction it claims. What it cannot see is a game
// working exactly as written and still deciding something absurd. Two bugs got
// past 780 assertions and were only ever visible here:
//
//   - A professional played a whole season of amateur events for no money,
//     because the schedule was built while they were still an amateur and
//     nothing rechecked entry at the tee. A first pro season grossed $5,148.
//   - "Heavy (32)" built a season of twenty-four international starts and no
//     domestic golf at all, because the appearance-fee term in the schedule
//     scorer swamped every purse in the game.
//
// So this audits the output rather than the mechanism: what the auto-manager
// actually chose, whether the numbers behind one screen agree with another,
// whether a forty-five-year world stays the shape it started, and whether the
// same seed still replays identically.

import * as E from '../src/game/engine.js'
import { ATTR_KEYS, SENIOR_AGE, STAFF_ROLES, EQUIP_SLOTS, TRAINING_OPTIONS } from '../src/game/constants.js'
import { overall } from '../src/game/ratings.js'
import { effectiveQ, annualStaffCost } from '../src/game/staff.js'
import { equipmentBonus, bagTech, techBaseline } from '../src/game/equipment.js'
import { ailmentPenalty } from '../src/game/injuries.js'
import { sponsorIncome } from '../src/game/sponsors.js'
import { scoringAverage } from '../src/game/stats.js'
import { racePosition, raceStandings, FINALE_ID, FINALE_WEEK } from '../src/game/race.js'
import { CUP_WEEK } from '../src/game/teamcup.js'
import { cardStatus } from '../src/game/eligibility.js'
import { exportSave, importSave, cloneState, History } from '../src/game/save.js'

const issues = []
let section = ''
const flag = (what, detail) => issues.push(`[${section}] ${what} — ${detail}`)
const start = (name) => {
  section = name
  process.stdout.write(`  ${name}… `)
}
const done = () => {
  const mine = issues.filter((i) => i.startsWith(`[${section}]`))
  console.log(mine.length ? `${mine.length} issue(s)` : 'clean')
}

const play = (s, years, weekly = null) => {
  for (let i = 0; i < years && !s.player.retired; i++) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    if (weekly) {
      while (s.phase === 'season') {
        E.simWeek(s)
        weekly(s)
      }
    } else {
      E.simToOffseason(s)
    }
  }
}

const findBad = (o, path = '', seen = new Set(), out = []) => {
  if (out.length > 8 || o === null || typeof o !== 'object') return out
  if (seen.has(o)) return out
  seen.add(o)
  for (const [k, v] of Object.entries(o)) {
    const p = path ? `${path}.${k}` : k
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${p}=${v}`)
    else if (typeof v === 'object') findBad(v, p, seen, out)
  }
  return out
}

const fingerprint = (s) =>
  JSON.stringify({
    y: s.year,
    w: s.week,
    cash: Math.round(s.finance.cash),
    r: s.player.rank,
    wins: s.career.wins,
    majors: s.career.majors,
    starts: s.career.starts,
    ratings: s.player.ratings,
  })

console.log('\n=== TOUR LIFE AUDIT ===\n')

// ---------------------------------------------------------------- decisions
start('auto-decisions')
for (const [label, talent] of [['weak', 0.3], ['mid', 0.55], ['star', 0.86]]) {
  for (const seed of [101, 202, 303]) {
    const s = E.newGame({ name: 'A', seed, talent, age: 21 })
    for (let yr = 0; yr < 25 && !s.player.retired; yr++) {
      E.autoOffseason(s)
      if (s.player.retired) break
      E.startSeason(s)

      const picked = s.season.filter((e) => s.entered[e.id])
      const weeks = picked.map((e) => e.week)
      if (new Set(weeks).size !== weeks.length) flag('schedule', `${label}/${seed} ${s.year}: two events in one week`)
      const bad = picked.filter((e) => !E.checkEligibility(s, e).ok)
      if (bad.length) flag('schedule', `${label}/${seed} ${s.year}: ${bad.length} entered but not eligible (${bad[0].id})`)
      if (!picked.length && s.player.status === 'pro') flag('schedule', `${label}/${seed} ${s.year}: empty schedule`)

      if (!TRAINING_OPTIONS.find((t) => t.id === s.training.choice)) {
        flag('training', `${label}/${seed}: unknown option ${s.training.choice}`)
      }
      for (const r of STAFF_ROLES) {
        const m = s.staff[r.id]
        if (!m) continue
        if (!(m.q > 0 && m.q <= 1)) flag('staff', `${label}/${seed}: ${r.id} q=${m.q}`)
        const eq = effectiveQ(m)
        if (!(eq >= 0 && eq <= 1)) flag('staff', `${label}/${seed}: ${r.id} effective q=${eq}`)
      }
      for (const slot of EQUIP_SLOTS) {
        if (!s.bag[slot.id]) flag('equipment', `${label}/${seed} ${s.year}: no ${slot.id} in the bag`)
      }
      const behind = techBaseline(s.yearsElapsed) - bagTech(s.bag)
      if (behind > 22) flag('equipment', `${label}/${seed} ${s.year}: bag ${behind.toFixed(0)} tech behind the field`)

      // Composition, not just legality. A schedule can be entirely valid and
      // still be obviously wrong: this is the shape the appearance-fee bug
      // took, twenty-four international starts and no domestic golf, and no
      // invariant anywhere could see it.
      if (s.player.status === 'pro' && picked.length >= 10) {
        const by = {}
        for (const e of picked) by[e.circuit] = (by[e.circuit] || 0) + 1
        const home = (by.domestic || 0) + (by.major || 0) + (by.emerging || 0) + (by.senior || 0) + (by.amateur || 0)
        const abroad = (by.intl || 0) + (by.asian || 0)
        const card = cardStatus(s, 'domestic')
        if (card === 'full' && abroad > home) {
          flag('schedule', `${label}/${seed} ${s.year}: ${abroad} abroad vs ${home} at home on a full domestic card`)
        }
        if ((by.major || 0) < 4 && s.player.rank && s.player.rank <= 40) {
          flag('schedule', `${label}/${seed} ${s.year}: ranked #${s.player.rank} but only ${by.major || 0} majors entered`)
        }
      }

      E.simToOffseason(s)
    }
    const c = s.career
    if (c.cutsMade > c.starts) flag('career', `${label}/${seed}: more cuts than starts`)
    if (c.top10s > c.cutsMade) flag('career', `${label}/${seed}: more top 10s than cuts`)
    if (c.wins > c.top10s) flag('career', `${label}/${seed}: more wins than top 10s`)
    if (c.majors > c.wins) flag('career', `${label}/${seed}: more majors than wins`)
    if (c.careerEarnings > c.careerGross) flag('career', `${label}/${seed}: net above gross`)
    for (const k of ATTR_KEYS) {
      const v = s.player.ratings[k]
      if (!(v >= 1 && v <= 99)) flag('ratings', `${label}/${seed}: ${k}=${v}`)
    }
  }
}
done()

// ----------------------------------------------------------------- extremes
start('extreme states')
const extremes = [
  ['broke', (s) => { s.finance.cash = -5_000_000 }],
  ['rich', (s) => { s.finance.cash = 2_000_000_000 }],
  ['ancient', (s) => E.god.set(s, 'age', 69)],
  ['zeroed', (s) => { for (const k of ATTR_KEYS) E.god.setRating(s, k, 1) }],
  ['maxed', (s) => { for (const k of ATTR_KEYS) E.god.setRating(s, k, 99) }],
  ['no staff', (s) => { for (const r of STAFF_ROLES) E.fireStaff(s, r.id) }],
  ['no clubs', (s) => { s.bag = {} }],
  ['hurt', (s) => E.god.inflict(s)],
  ['massive debt', (s) => { s.finance.cash = -50_000_000; s.finance.dependents = 3 }],
]
for (const [label, mutate] of extremes) {
  try {
    const s = E.newGame({ name: 'X', seed: 42, talent: 0.6, age: 22 })
    E.autoOffseason(s)
    E.startSeason(s)
    mutate(s)
    E.refreshDerived(s)
    play(s, 3)
    const bad = findBad(s)
    if (bad.length) flag(label, `non-finite: ${bad.join(', ')}`)
    const back = importSave(exportSave(s))
    for (const key of ['year', 'week', 'phase', 'yearsElapsed']) {
      if (back[key] !== s[key]) flag(label, `save lost ${key}`)
    }
    for (const key of ['career', 'finance', 'cards']) {
      if (JSON.stringify(back[key]) !== JSON.stringify(s[key])) flag(label, `save changed the ${key} block`)
    }
    const u = back.world.players.find((p) => p.isUser)
    if (!u) flag(label, 'save lost the user from the world')
    else if (u.pid !== s.player.pid) flag(label, 'save relinked the wrong player')
  } catch (err) {
    flag(label, `threw: ${err.message}`)
  }
}
done()

// -------------------------------------------------------------- consistency
start('screen agrees with sim')
for (const [label, talent] of [['mid', 0.55], ['star', 0.86]]) {
  for (const seed of [11, 22]) {
    const s = E.newGame({ name: 'C', seed, talent, age: 21 })
    play(s, 18, (st) => {
      const gear = equipmentBonus(st.bag, st.yearsElapsed, st.career.starts)
      const hurt = ailmentPenalty(st.player.injury)
      for (const k of ATTR_KEYS) {
        const want = Math.min(99, Math.max(1, Math.round(((st.player.ratings[k] || 0) + (gear[k] || 0) + (hurt[k] || 0)) * 10) / 10))
        if (Math.abs(st.effRatings[k] - want) > 0.11) flag('effRatings', `${label}/${seed}: ${k} ${st.effRatings[k]} vs ${want}`)
      }
      if (Math.abs(st.ovr - Math.round(overall(st.effRatings) * 10) / 10) > 0.11) flag('overall', `${label}/${seed}: ${st.ovr}`)

      const rp = racePosition(st)
      if (rp) {
        const mine = raceStandings(st).find((r) => r.isUser)
        if (!mine) flag('race', `${label}/${seed}: has a position but no row`)
        else if (mine.pos !== rp.pos) flag('race', `${label}/${seed}: ${rp.pos} vs table ${mine.pos}`)
        if (rp.inFinale !== rp.pos <= 40) flag('race', `${label}/${seed}: inFinale wrong at ${rp.pos}`)
      }
      const sa = scoringAverage(st.seasonTotals)
      if (sa !== null && (sa < 55 || sa > 95)) flag('scoring', `${label}/${seed}: average ${sa}`)
      if (st.seasonTotals.rounds > 0 && st.seasonTotals.strokes <= 0) flag('scoring', `${label}/${seed}: rounds without strokes`)
      if (st.finance.seasonPrizeNet > st.finance.seasonPrizeGross + 1) flag('money', `${label}/${seed}: season net above gross`)
      if (st.career.careerEarnings > st.career.careerGross + 1) flag('money', `${label}/${seed}: career net above gross`)
    })
    const burn = E.currentBurn(s)
    if (!(burn >= 0)) flag('burn', `${label}/${seed}: ${burn}`)
    if (burn < annualStaffCost(s.staff)) flag('burn', `${label}/${seed}: burn below the wage bill`)
    if (sponsorIncome(s.sponsors.deals) < 0) flag('sponsors', `${label}/${seed}: negative income`)
    if (s.sponsors.deals.some((d) => d.yearsLeft < 0)) flag('sponsors', `${label}/${seed}: negative years left`)
    if (s.sponsors.deals.length > 6) flag('sponsors', `${label}/${seed}: ${s.sponsors.deals.length} concurrent deals`)
  }
}
done()

// ---------------------------------------------------------------- long haul
start('forty-five years')
{
  const s = E.newGame({ name: 'D', seed: 777, talent: 0.55, age: 21 })
  const snap = []
  for (let yr = 0; yr < 45 && !s.player.retired; yr++) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    E.simToOffseason(s)
    const act = s.world.players.filter((p) => !p.retired && !p.isUser)
    snap.push({
      year: s.year,
      active: act.length,
      ovr: act.reduce((a, p) => a + overall(p.ratings), 0) / act.length,
      seniors: act.filter((p) => p.age >= SENIOR_AGE).length,
      topPts: Math.max(...act.map((p) => p.rankPoints)),
      saveKB: Math.round(JSON.stringify(s).length / 1024),
      logs: s.log.length,
      news: s.news.length,
      h2h: Object.keys(s.career.h2h).length,
    })
  }
  const a = snap[0]
  const z = snap[snap.length - 1]
  if (Math.abs(z.ovr - a.ovr) > 8) flag('drift', `tour average ${a.ovr.toFixed(1)} → ${z.ovr.toFixed(1)}`)
  if (z.active < a.active * 0.7 || z.active > a.active * 1.4) flag('drift', `pool ${a.active} → ${z.active}`)
  if (z.seniors < 20) flag('drift', `senior pool fell to ${z.seniors}`)
  if (z.saveKB > 4500) flag('drift', `save grew to ${z.saveKB}KB`)
  if (z.logs > 500) flag('drift', `log unbounded at ${z.logs}`)
  if (z.news > 80) flag('drift', `news unbounded at ${z.news}`)
  if (z.h2h > 200) flag('drift', `head-to-head unbounded at ${z.h2h}`)
  if (z.topPts > a.topPts * 6) flag('drift', `ranking points inflating ${a.topPts.toFixed(0)} → ${z.topPts.toFixed(0)}`)
  console.log(
    `\n     ${snap.length} seasons: pool ${a.active}→${z.active}, tour average ${a.ovr.toFixed(1)}→${z.ovr.toFixed(1)}, save ${a.saveKB}→${z.saveKB}KB`,
  )
  process.stdout.write('     ')
}
done()

// ------------------------------------------------------------- reproducible
start('replay and undo')
{
  const run = (seed) => {
    const s = E.newGame({ name: 'Det', seed, talent: 0.65, age: 21 })
    play(s, 10)
    return fingerprint(s)
  }
  for (const seed of [1, 2, 3]) {
    if (run(seed) !== run(seed)) flag('determinism', `seed ${seed} diverged between identical runs`)
  }
  for (const seed of [7, 8]) {
    const a = E.newGame({ name: 'Res', seed, talent: 0.65, age: 21 })
    play(a, 4)
    const b = importSave(exportSave(a))
    play(a, 4)
    play(b, 4)
    if (fingerprint(a) !== fingerprint(b)) flag('resume', `seed ${seed} diverged after a save and load`)
  }
  const s = E.newGame({ name: 'Undo', seed: 99, talent: 0.65, age: 21 })
  E.autoOffseason(s)
  E.startSeason(s)
  const h = new History(6)
  let cur = s
  for (let i = 0; i < 5; i++) {
    const before = fingerprint(cur)
    const draft = cloneState(cur)
    h.push(cur, 'week')
    E.simWeek(draft)
    cur = draft
    const after = fingerprint(cur)
    if (before === after) {
      flag('undo', 'a simulated week changed nothing, so the test proves nothing')
      break
    }
    const undone = h.undo(cur)
    if (!undone) {
      flag('undo', 'nothing to undo')
      break
    }
    if (fingerprint(undone.snapshot) !== before) flag('undo', 'restored a state that is not the one we left')
    const redone = h.redo(undone.snapshot)
    if (!redone) {
      flag('redo', 'nothing to redo')
      break
    }
    if (fingerprint(redone.snapshot) !== after) flag('redo', 'did not return the state we undid')
    cur = redone.snapshot
  }
  const c = cloneState(s)
  c.player.ratings.putting = 1
  c.career.wins = 999
  c.world.players[5].name = 'MUTATED'
  if (s.player.ratings.putting === 1) flag('clone', 'ratings are shared with the original')
  if (s.career.wins === 999) flag('clone', 'career is shared with the original')
  if (s.world.players[5].name === 'MUTATED') flag('clone', 'world is shared with the original')
  const cu = c.world.players.find((p) => p.isUser)
  if (cu && cu !== c.player) flag('clone', 'the user in the world is a different object to state.player')
}
done()

// ------------------------------------------------------------ career phases
start('career transitions')
{
  const s = E.newGame({ name: 'R', seed: 31, talent: 0.7, age: 21 })
  play(s, 8)
  E.retire(s)
  if (!s.player.retired) flag('retire', 'did not retire')
  if (E.simWeek(s).weeks !== 0) flag('retire', 'a retired player still advanced a week')
  E.unretire(s)
  if (s.player.retired) flag('unretire', 'still retired')
  play(s, 1)
  if (!s.career.seasons.length) flag('unretire', 'no seasons recorded after coming back')
}
{
  const s = E.newGame({ name: 'S', seed: 44, talent: 0.72, age: 21 })
  while (!s.player.retired && s.player.age < 56) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    E.simToOffseason(s)
  }
  const sen = s.career.allResults.filter((r) => r.circuit === 'senior')
  if (s.player.age >= SENIOR_AGE + 2 && !sen.length) flag('senior', 'reached senior age but never played a senior event')
  if (sen.some((r) => r.madeCut && r.pos === null)) flag('senior', 'made a cut with no finishing position')
}
{
  const s = E.newGame({ name: 'Q', seed: 55, talent: 0.42, age: 21 })
  let moved = 0
  for (let i = 0; i < 12 && !s.player.retired; i++) {
    const before = ['domestic', 'intl', 'asian', 'emerging'].map((c) => cardStatus(s, c)).join(',')
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    if (before !== ['domestic', 'intl', 'asian', 'emerging'].map((c) => cardStatus(s, c)).join(',')) moved += 1
    E.simToOffseason(s)
  }
  if (!moved) flag('cards', 'twelve seasons without a card ever changing')
}
{
  // Cup week and finale week must never double-book, and a season must never
  // begin with the finale already entered.
  const s = E.newGame({ name: 'W', seed: 66, talent: 0.88, age: 21, regionId: 'usa' })
  for (let i = 0; i < 16 && !s.player.retired; i++) {
    E.autoOffseason(s)
    if (s.player.retired) break
    E.startSeason(s)
    if (s.entered[FINALE_ID]) flag('finale', 'a season began with the finale already entered')
    while (s.phase === 'season') {
      const wk = s.week
      const before = s.career.starts
      E.simWeek(s)
      if ((wk === CUP_WEEK || wk === FINALE_WEEK) && s.career.starts - before > 1) {
        flag('collision', `played ${s.career.starts - before} events in week ${wk}`)
      }
    }
  }
}
done()

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`)
if (issues.length) {
  console.log(`${issues.length} ISSUES\n`)
  for (const i of [...new Set(issues)]) console.log('  ' + i)
  process.exitCode = 1
} else {
  console.log('audit clean')
}
