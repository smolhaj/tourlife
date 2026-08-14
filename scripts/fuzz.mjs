// Adversarial QA harness. Hammers the engine with random-but-legal action
// sequences and deliberately nasty inputs, checking after every step that the
// game is still in a state a player could continue from.
//
//   node scripts/fuzz.mjs [--runs 40] [--steps 400] [--seed 1]

import * as E from '../src/game/engine.js'
import { god } from '../src/game/engine.js'
import { ATTR_KEYS, TRAINING_OPTIONS, PLAYSTYLES, LIFESTYLES, STAFF_ROLES, EQUIP_SLOTS } from '../src/game/constants.js'
import { Rng } from '../src/game/rng.js'
import { exportSave, importSave, cloneState } from '../src/game/save.js'
import { checkEligibility } from '../src/game/eligibility.js'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? Number(process.argv[i + 1]) : d
}
const RUNS = arg('runs', 40)
const STEPS = arg('steps', 400)
const SEED0 = arg('seed', 1)

let problems = 0
const seen = new Set()
function problem(kind, detail) {
  const key = `${kind}::${detail}`.slice(0, 200)
  if (seen.has(key)) return
  seen.add(key)
  problems++
  console.log(`  ✗ ${kind} — ${detail}`)
}

/** Anything a player would see as broken. */
function audit(s, ctx) {
  if (!s) return problem('null state', ctx)
  const bad = []
  const walk = (o, path, depth) => {
    if (depth > 6 || bad.length > 3 || o === null || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o)) {
      const p = `${path}.${k}`
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${p}=${v}`)
      else if (v && typeof v === 'object' && k !== 'world') walk(v, p, depth + 1)
    }
  }
  walk(s.player, 'player', 0)
  walk(s.career, 'career', 0)
  walk(s.finance, 'finance', 0)
  walk(s.seasonTotals, 'seasonTotals', 0)
  if (bad.length) problem('non-finite number', `${ctx}: ${bad.join(', ')}`)

  for (const k of ATTR_KEYS) {
    const v = s.player.ratings[k]
    if (!(v >= 1 && v <= 99)) problem('rating out of range', `${ctx}: ${k}=${v}`)
    if (!(s.player.potential[k] >= 1 && s.player.potential[k] <= 99)) {
      problem('potential out of range', `${ctx}: ${k}=${s.player.potential[k]}`)
    }
  }
  if (!['season', 'offseason', 'retired'].includes(s.phase)) problem('bad phase', `${ctx}: ${s.phase}`)
  if (s.week < 1 || s.week > 60) problem('week out of range', `${ctx}: ${s.week}`)
  if (s.player.age < 15 || s.player.age > 100) problem('age out of range', `${ctx}: ${s.player.age}`)
  if (s.career.starts < 0 || s.career.wins < 0) problem('negative career total', ctx)
  if (s.career.cutsMade > s.career.starts) problem('more cuts than starts', ctx)
  if (s.career.allResults.length !== s.career.starts) {
    problem('result log out of sync', `${ctx}: ${s.career.allResults.length} vs ${s.career.starts}`)
  }
  // One entry per week, always.
  const list = s.phase === 'offseason' ? s.nextSeason : s.season
  const entered = s.phase === 'offseason' ? s.nextEntered : s.entered
  const weeks = new Map()
  for (const id of Object.keys(entered)) {
    const ev = list.find((e) => e.id === id)
    if (!ev) continue
    weeks.set(ev.week, (weeks.get(ev.week) || 0) + 1)
  }
  for (const [w, n] of weeks) if (n > 1) problem('double-booked week', `${ctx}: week ${w} has ${n} entries`)
  // A live career must always have somewhere to play next season.
  if (s.phase === 'offseason' && !s.player.retired) {
    const probe = { ...s, year: s.year + 1 }
    const any = s.nextSeason.some((e) => checkEligibility(probe, e).ok)
    if (!any) problem('stranded: no eligible events', `${ctx}: age ${s.player.age}`)
  }
}

// ---------------------------------------------------------------- the actions

const ACTIONS = [
  {
    name: 'simWeek',
    when: (s) => s.phase === 'season',
    run: (s) => E.simWeek(s),
  },
  {
    name: 'simNextEvent',
    when: (s) => s.phase === 'season',
    run: (s) => E.simNextEvent(s),
  },
  {
    name: 'simToNextMajor',
    when: (s) => s.phase === 'season',
    run: (s) => E.simToNextMajor(s),
  },
  {
    name: 'simToOffseason',
    when: (s) => s.phase === 'season',
    run: (s) => E.simToOffseason(s),
  },
  {
    name: 'startSeason',
    when: (s) => s.phase === 'offseason',
    run: (s) => E.startSeason(s),
  },
  {
    name: 'autoOffseason',
    when: (s) => s.phase === 'offseason',
    run: (s) => E.autoOffseason(s),
  },
  {
    name: 'setTraining',
    when: () => true,
    run: (s, r) => E.setTraining(s, r.pick(TRAINING_OPTIONS).id),
  },
  {
    name: 'setPlaystyle',
    when: () => true,
    run: (s, r) => E.setPlaystyle(s, r.pick(PLAYSTYLES).id),
  },
  {
    name: 'setLifestyle',
    when: () => true,
    run: (s, r) => E.setLifestyle(s, r.pick(LIFESTYLES).id),
  },
  {
    name: 'toggleEntry',
    when: (s) => !s.player.retired,
    run: (s, r) => {
      const list = s.phase === 'offseason' ? s.nextSeason : s.season
      if (!list.length) return
      E.toggleEntry(s, r.pick(list).id)
    },
  },
  { name: 'clearSchedule', when: (s) => !s.player.retired, run: (s) => E.clearSchedule(s) },
  {
    name: 'autoFillSchedule',
    when: (s) => !s.player.retired,
    run: (s, r) => E.autoFillSchedule(s, r.int(0, 50)),
  },
  {
    name: 'hireStaff',
    when: (s) => s.phase === 'offseason' && s.staffMarket,
    run: (s, r) => {
      const role = r.pick(STAFF_ROLES).id
      const list = s.staffMarket[role] || []
      if (list.length) E.hireStaff(s, role, r.pick(list).id)
    },
  },
  { name: 'fireStaff', when: () => true, run: (s, r) => E.fireStaff(s, r.pick(STAFF_ROLES).id) },
  {
    name: 'buyEquipment',
    when: (s) => s.phase === 'offseason' && s.equipCatalog,
    run: (s, r) => {
      const slot = r.pick(EQUIP_SLOTS).id
      const list = s.equipCatalog[slot] || []
      if (list.length) E.buyEquipment(s, slot, r.pick(list).id)
    },
  },
  {
    name: 'sponsorOffer',
    when: (s) => s.sponsors.offers.length > 0,
    run: (s, r) => {
      const o = r.pick(s.sponsors.offers)
      const roll = r.next()
      if (roll < 0.4) E.acceptOffer(s, o.id)
      else if (roll < 0.75) E.negotiateOffer(s, o.id)
      else E.declineOffer(s, o.id)
    },
  },
  { name: 'enterQSchool', when: (s) => s.phase === 'offseason', run: (s) => E.enterQSchool(s) },
  { name: 'turnPro', when: (s) => s.player.status === 'amateur', run: (s) => E.turnPro(s) },
  {
    name: 'attemptQualifier',
    when: (s) => !s.player.retired,
    run: (s, r) => {
      const list = s.phase === 'offseason' ? s.nextSeason : s.season
      if (list.length) E.attemptQualifier(s, r.pick(list).id)
    },
  },
  {
    name: 'playEventNow',
    when: (s) => s.phase === 'season',
    run: (s, r) => {
      const upcoming = s.season.filter((e) => e.week >= s.week)
      if (upcoming.length) E.playEventNow(s, r.pick(upcoming).id)
    },
  },
  { name: 'retire', when: (s) => !s.player.retired, run: (s) => E.retire(s, 'fuzzed') },
  { name: 'unretire', when: (s) => s.player.retired, run: (s) => E.unretire(s) },
  { name: 'simToAge', when: (s) => !s.player.retired, run: (s, r) => E.simToAge(s, s.player.age + r.int(1, 6)) },
  // Godmode is part of the product, so it gets fuzzed too.
  { name: 'god.setRating', when: () => true, run: (s, r) => god.setRating(s, r.pick(ATTR_KEYS), r.int(-20, 140)) },
  { name: 'god.addCash', when: () => true, run: (s, r) => god.addCash(s, r.int(-5e8, 5e8)) },
  { name: 'god.setAge', when: () => true, run: (s, r) => god.set(s, 'age', r.int(16, 80)) },
  { name: 'god.inflict', when: () => true, run: (s, r) => god.inflict(s, r.pick(['back', 'yips', 'knee', 'burnout'])) },
  { name: 'god.heal', when: () => true, run: (s) => god.heal(s) },
  { name: 'god.spawnMajor', when: (s) => s.phase === 'season', run: (s) => god.spawnMajor(s) },
  { name: 'god.forceWin', when: (s) => s.phase === 'season', run: (s) => god.forceWin(s) },
  { name: 'god.matchPotential', when: () => true, run: (s) => god.matchPotential(s) },
  { name: 'god.setCard', when: () => true, run: (s, r) => god.setCard(s, r.pick(['domestic', 'intl', 'asian', 'emerging', 'senior']), r.pick(['none', 'conditional', 'full'])) },
  {
    name: 'saveRoundTrip',
    when: () => true,
    run: (s) => {
      const round = importSave(exportSave(s))
      if (round.career.starts !== s.career.starts) problem('round trip lost data', `${round.career.starts} vs ${s.career.starts}`)
    },
  },
]

console.log(`Fuzzing: ${RUNS} runs x ${STEPS} steps`)
const counts = {}
let totalSteps = 0

for (let run = 0; run < RUNS; run++) {
  const seed = SEED0 + run * 7919
  const r = new Rng(seed)
  let s
  try {
    s = E.newGame({
      name: `Fuzz ${run}`,
      seed,
      talent: r.float(0.05, 0.98),
      age: r.int(20, 22),
      difficulty: r.pick(['easy', 'normal', 'hard']),
    })
  } catch (err) {
    problem('newGame threw', `${seed}: ${err.message}`)
    continue
  }

  let lastAction = 'newGame'
  let ageWasForced = false
  for (let step = 0; step < STEPS; step++) {
    const legal = ACTIONS.filter((a) => a.when(s))
    if (!legal.length) break
    const action = r.pick(legal)
    lastAction = action.name
    counts[action.name] = (counts[action.name] || 0) + 1
    totalSteps++
    try {
      action.run(s, r)
    } catch (err) {
      problem('action threw', `seed ${seed} step ${step} ${action.name}: ${err.message}\n      ${(err.stack || '').split('\n')[1]?.trim()}`)
      break
    }
    try {
      E.refreshDerived(s)
    } catch (err) {
      problem('refreshDerived threw', `after ${action.name}: ${err.message}`)
      break
    }
    audit(s, `seed ${seed} step ${step} after ${lastAction}`)
    if (lastAction === 'god.setAge') ageWasForced = true
    // Reaching extreme age by *playing* would mean the retirement backstop
    // failed; reaching it via the godmode age slider is the player's choice.
    if (!ageWasForced && s.player.age > 70 && !s.player.retired) {
      problem('played past the age limit', `age ${s.player.age} (last: ${lastAction})`)
    }
  }

  // Whatever mess the fuzzer left, the career must still be renderable and
  // continuable — that is the real requirement.
  try {
    const clone = cloneState(s)
    E.refreshDerived(clone)
    E.seasonSummary(clone)
    E.upcomingSchedule(clone)
    E.rivalTable(clone)
    E.allTimeBoard(clone)
    E.tourAverages(clone)
    E.retirementPressure(clone)
    E.currentBurn(clone)
    E.nextEnteredEvent(clone)
    E.nextMajor(clone)
  } catch (err) {
    problem('selector threw on final state', `seed ${seed} (last: ${lastAction}): ${err.message}`)
  }
}

console.log(`\n${totalSteps} actions executed across ${RUNS} careers`)
const top = Object.entries(counts).sort((a, b) => b[1] - a[1])
console.log('action mix:', top.slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' '))
const untried = ACTIONS.filter((a) => !counts[a.name]).map((a) => a.name)
if (untried.length) console.log('never triggered:', untried.join(', '))
console.log(problems === 0 ? '\n✓ no problems found' : `\n${problems} distinct problems`)
if (problems) process.exitCode = 1
