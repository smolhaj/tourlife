import { COURSE_TYPES, CIRCUITS, PAYOUT_PCT, pointsMultiplier, playstyleById } from './constants.js'
import { courseSkill } from './ratings.js'
import { clamp } from './rng.js'

/** Strokes gained per point of course-specific rating, over 72 holes. */
const STROKES_PER_QUALITY = 0.34
const BASE_NOISE = 5.9

/** Expected to-par of a field-average player at this setup. */
export function scoringOffset(difficulty) {
  return (difficulty - 0.86) * 26 + 3
}

/**
 * Turn a player into the numbers the sim needs.
 * `ratings` should already include equipment/staff/injury adjustments.
 */
export function makeEntrant(player, ratings, event, extra = {}) {
  const style = playstyleById(player.playstyle)
  const skill = courseSkill(ratings, event.courseType)
  const fatiguePenalty = Math.pow(clamp(player.fatigue, 0, 100) / 100, 1.4) * 7
  const mentalWeight = event.isMajor || event.seniorMajor ? 2.2 : event.flagship ? 1.4 : 1
  const quality =
    skill +
    (player.form || 0) * 1.2 +
    style.edge +
    (ratings.mental - 50) * 0.04 * mentalWeight -
    fatiguePenalty +
    (extra.qualityBonus || 0)

  const consFactor = 1.22 - ratings.consistency / 210
  const sigma =
    BASE_NOISE *
    (COURSE_TYPES[event.courseType]?.variance || 1) *
    style.variance *
    clamp(consFactor, 0.7, 1.15) *
    (1 + (event.difficulty - 1) * 0.18)

  return {
    pid: player.pid,
    name: player.name,
    flag: player.flag,
    isUser: !!player.isUser,
    quality,
    sigma,
    scrambleEdge: style.scramble,
    ratings,
  }
}

/**
 * Simulate a whole tournament from a list of entrants.
 * Returns finishing positions, to-par scores, prize money and ranking points.
 */
export function simTournament(event, entrants, rng, opts = {}) {
  const circuit = CIRCUITS[event.circuit]
  const offset = scoringOffset(event.difficulty)
  const n = entrants.length
  let meanQuality = 0
  for (const e of entrants) meanQuality += e.quality
  meanQuality /= Math.max(1, n)

  const rows = entrants.map((e) => {
    const skillStrokes = -(e.quality - meanQuality) * STROKES_PER_QUALITY
    const luck = rng.gaussClamped(0, e.sigma, 3.1)
    // A short-game-driven scramble nudge: conservative players save more pars.
    const scramble = -e.scrambleEdge * 1.6
    const toPar = offset + skillStrokes + luck + scramble
    return { entrant: e, raw: toPar }
  })

  rows.sort((a, b) => a.raw - b.raw)

  // Round scores are only needed for leaderboards we actually show.
  const detailCount = opts.detailed ? Math.min(rows.length, opts.detailRows || 25) : 0

  const cutSize = event.cutSize >= event.fieldSize ? rows.length : Math.min(event.cutSize, rows.length)
  const noCut = circuit.cutSize >= circuit.fieldSize || event.circuit === 'senior'
  const cutIndex = noCut ? rows.length : cutSize
  const cutLine = cutIndex < rows.length ? Math.round(rows[cutIndex - 1].raw) : null

  // Assign positions with shared places on ties.
  const results = []
  let i = 0
  let displayPos = 1
  while (i < rows.length) {
    const scoreInt = Math.round(rows[i].raw)
    let j = i
    while (j + 1 < rows.length && Math.round(rows[j + 1].raw) === scoreInt) j++
    const groupSize = j - i + 1
    const tied = groupSize > 1
    for (let k = i; k <= j; k++) {
      const madeCut = noCut || k < cutIndex || (tied && i < cutIndex)
      results.push({
        pid: rows[k].entrant.pid,
        name: rows[k].entrant.name,
        flag: rows[k].entrant.flag,
        isUser: rows[k].entrant.isUser,
        pos: madeCut ? displayPos : null,
        tied,
        toPar: scoreInt,
        madeCut,
        money: 0,
        points: 0,
      })
    }
    i = j + 1
    displayPos += groupSize
  }

  // Prize money: tied players split the sum of the places they occupy.
  const paysMoney = event.purse > 0
  if (paysMoney) {
    let idx = 0
    while (idx < results.length) {
      const r = results[idx]
      if (!r.madeCut) {
        idx++
        continue
      }
      let end = idx
      while (end + 1 < results.length && results[end + 1].madeCut && results[end + 1].pos === r.pos) end++
      let pctSum = 0
      for (let place = r.pos; place <= r.pos + (end - idx); place++) {
        pctSum += PAYOUT_PCT[place - 1] || 0
      }
      const share = (pctSum / 100) * event.purse / (end - idx + 1)
      for (let k = idx; k <= end; k++) results[k].money = Math.round(share)
      idx = end + 1
    }
  }

  // Ranking points scale with field strength so a weak-field win is worth less.
  const strengthMult = clamp(0.6 + (meanQuality - 52) / 30, 0.45, 1.75)
  const flagshipMult = event.isMajor ? 1 : event.flagship ? 1.35 : 1
  for (const r of results) {
    if (!r.madeCut || !r.pos) continue
    r.points = Math.round(circuit.pointsBase * pointsMultiplier(r.pos) * strengthMult * flagshipMult * 10) / 10
  }

  if (detailCount > 0) {
    for (let k = 0; k < results.length; k++) {
      if (k < detailCount || results[k].isUser) {
        results[k].rounds = splitRounds(results[k].toPar, results[k].madeCut, rng, event)
      }
    }
  }

  const winner = results[0]
  return {
    eventId: event.id,
    week: event.week,
    results,
    winner: winner ? { pid: winner.pid, name: winner.name, toPar: winner.toPar, flag: winner.flag } : null,
    cutLine,
    fieldSize: rows.length,
    meanQuality,
    strengthMult,
  }
}

/** Split a 72-hole (or 36-hole, if the player missed the cut) score into rounds. */
function splitRounds(toPar, madeCut, rng, event) {
  const rounds = madeCut ? 4 : 2
  const per = (madeCut ? toPar : toPar * 0.5) / rounds
  const out = []
  let running = 0
  for (let i = 0; i < rounds; i++) {
    const v = i === rounds - 1 ? (madeCut ? toPar : Math.round(toPar * 0.5)) - running : Math.round(per + rng.gauss(0, 2.1))
    out.push(v)
    running += v
  }
  const par = event.difficulty > 1.25 ? 70 : 71
  return out.map((v) => ({ toPar: v, strokes: par + v }))
}

export function formatPos(r) {
  if (!r.madeCut || !r.pos) return 'MC'
  if (r.pos === 1) return '1st'
  return `${r.tied ? 'T' : ''}${r.pos}`
}

export function posShort(r) {
  if (!r.madeCut || !r.pos) return 'MC'
  return `${r.tied ? 'T' : ''}${r.pos}`
}

export function formatToPar(v) {
  if (v === 0) return 'E'
  return v > 0 ? `+${v}` : `${v}`
}
