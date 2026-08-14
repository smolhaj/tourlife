// Hostile-input QA: malformed saves, corrupted state, and the extreme ends of
// every slider. A player should get a clear failure or a survivable game —
// never a crash and never a silently broken career.
//
//   node scripts/hostile.mjs

import * as E from '../src/game/engine.js'
import { god } from '../src/game/engine.js'
import { importSave, exportSave, cloneState } from '../src/game/save.js'
import { ATTR_KEYS } from '../src/game/constants.js'
import { checkEligibility } from '../src/game/eligibility.js'

let pass = 0
let fail = 0
const fails = []
function check(name, cond, detail) {
  if (cond) { pass++ } else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function section(t) { console.log(`\n=== ${t} ===`) }

/** Everything the UI touches on every render. If any of it throws, the app white-screens. */
function rendersCleanly(s, label) {
  try {
    E.refreshDerived(s)
    E.seasonSummary(s)
    E.upcomingSchedule(s)
    E.rivalTable(s)
    E.allTimeBoard(s)
    E.tourAverages(s)
    E.retirementPressure(s)
    E.currentBurn(s)
    E.nextEnteredEvent(s)
    E.nextMajor(s)
    E.careerPhase(s.player)
    E.legacyScore(s.career, s.player)
    for (const ev of (s.season.length ? s.season : s.nextSeason).slice(0, 40)) checkEligibility(s, ev)
    return true
  } catch (err) {
    check(`${label}: renders without throwing`, false, err.message)
    return false
  }
}

// ---------------------------------------------------------------------------
section('Malformed save files')
{
  const good = E.newGame({ name: 'Baseline', seed: 5, talent: 0.6 })
  const cases = [
    ['empty string', ''],
    ['not json', 'this is not json at all'],
    ['json null', 'null'],
    ['json number', '42'],
    ['json array', '[1,2,3]'],
    ['empty object', '{}'],
    ['wrapper with no state', '{"format":"tourlife-career","version":5}'],
    ['state missing player', JSON.stringify({ format: 'tourlife-career', state: { world: { players: [] } } })],
    ['state missing world', JSON.stringify({ format: 'tourlife-career', state: { player: { name: 'x' } } })],
    ['truncated json', exportSave(good).slice(0, 4000)],
    ['html error page', '<!doctype html><html><body>404</body></html>'],
  ]
  for (const [name, text] of cases) {
    let threw = null
    let result = null
    try { result = importSave(text) } catch (err) { threw = err }
    check(`rejects ${name} with an Error (not a broken game)`, !!threw && threw instanceof Error && !result,
      threw ? `threw ${threw.constructor.name}` : 'returned a value')
  }

  // A save from a hypothetical older build, missing fields added since.
  const old = JSON.parse(exportSave(good))
  delete old.state.career.allResults
  delete old.state.career.rivals
  delete old.state.news
  delete old.state.log
  delete old.state.sponsors
  delete old.state.settings
  let migrated = null
  try { migrated = importSave(JSON.stringify(old)) } catch (err) {
    check('migrates an older save', false, err.message)
  }
  if (migrated) {
    check('migrates an older save', true)
    check('migration restores missing collections',
      Array.isArray(migrated.career.allResults) && Array.isArray(migrated.news) && !!migrated.sponsors)
    rendersCleanly(migrated, 'migrated save')
    // And it must be playable, not just renderable.
    try {
      E.autoOffseason(migrated)
      E.startSeason(migrated)
      E.simToOffseason(migrated)
      check('an older save is still playable', true)
    } catch (err) {
      check('an older save is still playable', false, err.message)
    }
  }
}

// ---------------------------------------------------------------------------
section('Extreme godmode values')
{
  const cases = [
    ['all ratings at the floor', (s) => ATTR_KEYS.forEach((k) => god.setRating(s, k, -999))],
    ['all ratings at the ceiling', (s) => ATTR_KEYS.forEach((k) => god.setRating(s, k, 9999))],
    ['NaN rating', (s) => god.setRating(s, 'putting', NaN)],
    ['huge debt', (s) => god.addCash(s, -1e15)],
    ['absurd wealth', (s) => god.addCash(s, 1e15)],
    ['age below the minimum', (s) => god.set(s, 'age', 1)],
    ['age above the maximum', (s) => god.set(s, 'age', 200)],
    ['negative form', (s) => god.set(s, 'form', -1000)],
    ['fatigue past full', (s) => god.set(s, 'fatigue', 500)],
    ['negative morale', (s) => god.set(s, 'morale', -500)],
    ['negative ranking points', (s) => god.set(s, 'rankPoints', -1e6)],
  ]
  for (const [name, mutate] of cases) {
    const s = E.newGame({ name: 'Extreme', seed: 11, talent: 0.5 })
    E.autoOffseason(s)
    E.startSeason(s)
    try {
      mutate(s)
      E.refreshDerived(s)
    } catch (err) {
      check(`${name}: applies without throwing`, false, err.message)
      continue
    }
    check(`${name}: applies without throwing`, true)
    if (!rendersCleanly(s, name)) continue
    // And the game must still be playable afterwards.
    try {
      E.simToOffseason(s)
      E.autoOffseason(s)
      E.startSeason(s)
      const finite = Number.isFinite(s.ovr) && Number.isFinite(s.finance.cash) && Number.isFinite(s.player.age)
      check(`${name}: career survives a full season`, finite,
        `ovr=${s.ovr} cash=${s.finance.cash} age=${s.player.age}`)
    } catch (err) {
      check(`${name}: career survives a full season`, false, err.message)
    }
  }
}

// ---------------------------------------------------------------------------
section('Repeated and out-of-order actions')
{
  const s = E.newGame({ name: 'Masher', seed: 22, talent: 0.6 })
  // Button-mashing the offseason controls.
  for (let i = 0; i < 30; i++) {
    E.enterQSchool(s)
    E.turnPro(s)
    E.clearSchedule(s)
    E.autoFillSchedule(s, 25)
    for (const r of ['coach', 'caddie', 'physio', 'psych', 'agent']) E.fireStaff(s, r)
  }
  check('mashing offseason buttons is harmless', Number.isFinite(s.finance.cash), `cash=${s.finance.cash}`)
  check('Q-School only resolves once per offseason', !!s.qSchool)
  rendersCleanly(s, 'after mashing')

  // Starting a season twice, simming past the end, retiring twice.
  E.startSeason(s)
  const yearAfterStart = s.year
  E.startSeason(s)
  check('starting an already-started season does not skip a year', s.year === yearAfterStart, `${yearAfterStart} -> ${s.year}`)
  E.simToOffseason(s)
  E.simToOffseason(s)
  E.simWeek(s)
  check('simming past the end of the season is a no-op', s.phase === 'offseason', s.phase)
  E.retire(s)
  E.retire(s)
  check('retiring twice is harmless', s.phase === 'retired')
  E.unretire(s)
  E.unretire(s)
  check('un-retiring twice is harmless', !s.player.retired)
  rendersCleanly(s, 'after out-of-order calls')
}

// ---------------------------------------------------------------------------
section('Degenerate playstyles')
{
  // Forty years of never entering anything.
  const hermit = E.newGame({ name: 'Hermit', seed: 33, talent: 0.7, age: 21 })
  for (let i = 0; i < 30 && !hermit.player.retired; i++) {
    E.clearSchedule(hermit)
    if (hermit.phase === 'offseason') E.startSeason(hermit)
    E.clearSchedule(hermit)
    E.simToOffseason(hermit)
  }
  check('never entering an event for 30 years does not break the game', !!hermit.phase)
  check('the hermit recorded no starts', hermit.career.starts === 0, `${hermit.career.starts}`)
  rendersCleanly(hermit, 'hermit')

  // Retire on day one.
  const quitter = E.newGame({ name: 'Quitter', seed: 44, talent: 0.7, age: 20 })
  E.retire(quitter, 'never even started')
  check('retiring before playing a single event works', quitter.phase === 'retired')
  check('legacy of an empty career is zero-ish', E.legacyScore(quitter.career, quitter.player) < 20)
  rendersCleanly(quitter, 'day-one retiree')

  // Bankrupt for decades.
  const broke = E.newGame({ name: 'Broke', seed: 55, talent: 0.15, age: 21 })
  god.addCash(broke, -5_000_000)
  for (let i = 0; i < 15; i++) { E.autoOffseason(broke); E.startSeason(broke); E.simToOffseason(broke) }
  check('a deeply bankrupt career keeps running', Number.isFinite(broke.finance.cash))
  check('bankruptcy does not stop you entering events', broke.career.starts > 50, `${broke.career.starts} starts`)
  rendersCleanly(broke, 'bankrupt')
}

// ---------------------------------------------------------------------------
section('State the UI depends on')
{
  const s = E.newGame({ name: 'Renderer', seed: 66, talent: 0.8, age: 21 })
  for (let i = 0; i < 20; i++) { E.autoOffseason(s); E.startSeason(s); E.simToOffseason(s) }

  // Every result the UI can open must have a matching summary to render.
  let missing = 0
  for (const row of s.seasonLog) if (!s.seasonResults[row.eventId]) missing++
  check('every season result can be opened', missing === 0, `${missing} orphaned rows`)

  // Highlights and season rows must have the fields the components read.
  const badHl = s.career.highlights.filter((h) => !h.title || typeof h.year !== 'number')
  check('highlights are well formed', badHl.length === 0, `${badHl.length} malformed`)
  const badSeason = s.career.seasons.filter((r) => typeof r.year !== 'number' || typeof r.prizeGross !== 'number')
  check('season rows are well formed', badSeason.length === 0, `${badSeason.length} malformed`)

  // Rival and all-time tables must not contain undefined names.
  const rivals = E.rivalTable(s, 20)
  check('rival rows all have names', rivals.every((r) => typeof r.name === 'string' && r.name.length))
  const allTime = E.allTimeBoard(s)
  check('all-time board rows all have names', allTime.every((r) => typeof r.name === 'string' && r.name.length))
  check('all-time board is not empty', allTime.length > 0)

  // The world must stay bounded over a long career.
  check('world player count stays bounded', s.world.players.length < 2000, `${s.world.players.length}`)
  const saveSize = exportSave(s).length
  check('save stays well under the localStorage quota', saveSize < 4_000_000, `${Math.round(saveSize / 1024)} KB`)
  console.log(`   world ${s.world.players.length} players, save ${Math.round(saveSize / 1024)} KB after 20 seasons`)

  // Cloning is what undo relies on.
  const clone = cloneState(s)
  check('state is structured-cloneable', clone.career.starts === s.career.starts)
}

console.log(`\n${'='.repeat(56)}`)
console.log(`${pass} passed, ${fail} failed`)
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log('  ✗ ' + f)) }
if (fail) process.exitCode = 1
