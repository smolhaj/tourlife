// Headless balance harness: run whole careers and print the shape of them.
// `npm run balance` — no browser, no React.

import { newGame, autoOffseason, startSeason, simToOffseason, simToAge, retirementPressure, tourAverages } from '../src/game/engine.js'
import { overall } from '../src/game/ratings.js'
import { fmtMoney } from '../src/game/finance.js'
import { legacyScore, legacyLabel } from '../src/game/narrative.js'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? process.argv[i + 1] : d
}

const CAREERS = Number(arg('careers', 8))
const TALENT = Number(arg('talent', 0.55))
const UNTIL = Number(arg('until', 46))
const VERBOSE = process.argv.includes('--verbose')

function pad(s, n, right = false) {
  s = String(s)
  return right ? s.padStart(n) : s.padEnd(n)
}

function runCareer(seed) {
  const t0 = Date.now()
  const state = newGame({ name: `Test Player ${seed}`, seed, talent: TALENT, age: 21 })
  const seasons = []

  while (state.player.age < UNTIL && !state.player.retired) {
    autoOffseason(state)
    startSeason(state)
    simToOffseason(state)
    const s = state.career.seasons[state.career.seasons.length - 1]
    if (s) seasons.push(s)
  }

  return { state, seasons, ms: Date.now() - t0 }
}

function summarise(runs) {
  console.log('\n=== CAREER OUTCOMES ===')
  console.log(
    pad('seed', 6) + pad('ovr@peak', 10, true) + pad('wins', 6, true) + pad('majors', 8, true) +
    pad('top10', 7, true) + pad('starts', 8, true) + pad('gross', 14, true) + pad('net worth', 14, true) +
    pad('bestRk', 8, true) + pad('legacy', 8, true) + '  label',
  )
  for (const r of runs) {
    const c = r.state.career
    const p = r.state.player
    const L = legacyScore(c, p)
    console.log(
      pad(r.state.seed, 6) +
      pad(p.peakOvr.toFixed(1), 10, true) +
      pad(c.wins, 6, true) +
      pad(c.majors, 8, true) +
      pad(c.top10s, 7, true) +
      pad(c.starts, 8, true) +
      pad(fmtMoney(c.careerGross, { compact: true }), 14, true) +
      pad(fmtMoney(r.state.finance.cash, { compact: true }), 14, true) +
      pad('#' + (c.bestRank ?? '-'), 8, true) +
      pad(L.toFixed(0), 8, true) +
      '  ' + legacyLabel(L).label,
    )
  }

  const wins = runs.map((r) => r.state.career.wins)
  const majors = runs.map((r) => r.state.career.majors)
  const money = runs.map((r) => r.state.career.careerGross)
  const cash = runs.map((r) => r.state.finance.cash)
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length
  console.log(`\navg wins ${avg(wins).toFixed(1)} | avg majors ${avg(majors).toFixed(2)} | ` +
    `avg gross ${fmtMoney(avg(money), { compact: true })} | avg net worth ${fmtMoney(avg(cash), { compact: true })}`)
  console.log(`sim time: ${avg(runs.map((r) => r.ms)).toFixed(0)} ms/career (age 21 → ${UNTIL})`)
}

function scoringCheck(state) {
  console.log('\n=== SCORING SANITY (winning score by circuit, this season) ===')
  const byCircuit = {}
  for (const [, res] of Object.entries(state.seasonResults)) {
    const c = res.circuit
    byCircuit[c] = byCircuit[c] || []
    if (res.winner) byCircuit[c].push(res.winner.toPar)
  }
  for (const [c, arr] of Object.entries(byCircuit)) {
    if (!arr.length) continue
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length
    console.log(`  ${pad(c, 10)} n=${pad(arr.length, 4, true)}  avg winning score ${avg.toFixed(1)}  range ${Math.min(...arr)}..${Math.max(...arr)}`)
  }
}

function ageCurve(runs) {
  console.log('\n=== AGE CURVE (mean overall by age, all careers) ===')
  const byAge = new Map()
  for (const r of runs) {
    for (const s of r.seasons) {
      if (!byAge.has(s.age)) byAge.set(s.age, [])
      byAge.get(s.age).push(s.ovr)
    }
  }
  const ages = Array.from(byAge.keys()).sort((a, b) => a - b)
  for (const a of ages) {
    const arr = byAge.get(a)
    const m = arr.reduce((x, y) => x + y, 0) / arr.length
    const bar = '█'.repeat(Math.max(0, Math.round((m - 35) / 1.2)))
    console.log(`  ${pad(a, 4, true)}  ${m.toFixed(1).padStart(5)}  ${bar}`)
  }
}

function distributions(runs) {
  console.log('\n=== FINISH DISTRIBUTION (all user starts, all careers) ===')
  const buckets = { win: 0, 'top3': 0, 'top10': 0, 'top25': 0, 'made cut': 0, MC: 0 }
  let total = 0
  for (const r of runs) {
    for (const row of r.state.career.allResults || []) {
      total++
      if (!row.madeCut) buckets.MC++
      else if (row.pos === 1) buckets.win++
      else if (row.pos <= 3) buckets['top3']++
      else if (row.pos <= 10) buckets['top10']++
      else if (row.pos <= 25) buckets['top25']++
      else buckets['made cut']++
    }
  }
  if (!total) {
    console.log('  (per-start history not retained; skipping)')
    return
  }
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${pad(k, 10)} ${pad(v, 6, true)}  ${((v / total) * 100).toFixed(1)}%`)
  }
}

const runs = []
for (let i = 0; i < CAREERS; i++) {
  const r = runCareer(1000 + i * 7)
  runs.push(r)
  if (VERBOSE) {
    console.log(`\n--- career ${r.state.seed} highlights ---`)
    for (const h of r.state.career.highlights) {
      console.log(`  ${h.year}  ${h.title}`)
    }
  }
}

summarise(runs)
ageCurve(runs)
scoringCheck(runs[0].state)
distributions(runs)

const avgs = tourAverages(runs[0].state)
console.log('\n=== TOUR AVERAGE RATINGS (end of run) ===')
console.log('  ' + JSON.stringify(avgs))
const rp = retirementPressure(runs[0].state)
console.log(`\nretirement pressure for career ${runs[0].state.seed}: ${rp.pressure} (burn ${fmtMoney(rp.burn, { compact: true })}/yr)`)
console.log('player ovr now:', overall(runs[0].state.player.ratings).toFixed(1))
