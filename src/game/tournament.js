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
    ignorePressure: !!extra.ignorePressure,
  }
}

/**
 * Simulate a whole tournament from a list of entrants.
 * Returns finishing positions, to-par scores, prize money and ranking points.
 */
/**
 * What being in front on Sunday does to a person.
 *
 * The 54-hole leader on tour converts a little under half the time, and it is
 * not because the field catches fire — it is because leading is harder than
 * chasing. Leaders lose a fraction of a shot and gain variance; the pack plays
 * with nothing to lose. Nerve claws most of it back, which is what finally
 * gives the mental rating and the sports psychologist something visible to do.
 *
 * Deliberately close to zero-sum across a field, so playing the rounds out does
 * not quietly make tournaments easier or harder than the single-roll version.
 */
function sundayPressure(pos54, mental) {
  const nerve = clamp(((mental || 50) - 50) / 50, -1, 1)
  // Rounds are whole strokes, so an effect worth a third of a shot mostly
  // disappears into the rounding. This is sized to survive it.
  const steady = 1 - nerve * 0.85
  if (pos54 === 1) return { shift: 0.85 * steady, sigmaMult: 1.13 }
  if (pos54 <= 5) return { shift: 0.5 * steady, sigmaMult: 1.09 }
  if (pos54 <= 20) return { shift: 0, sigmaMult: 1 }
  return { shift: -0.12, sigmaMult: 1.07 }
}

/**
 * Play the four rounds rather than deriving them from a total. Each round is a
 * quarter of the player's expected score with a quarter of the variance, so
 * four of them sum to exactly the distribution the single roll produced — the
 * only real change is that the last one knows where you stand.
 */
function simulateRounds(entrants, { offset, meanQuality, event, rng, cutIndex, noCut }) {
  const field = entrants.map((e) => {
    const skillStrokes = -(e.quality - meanQuality) * STROKES_PER_QUALITY
    const scramble = -e.scrambleEdge * 1.6
    return {
      entrant: e,
      mean: (offset + skillStrokes + scramble) / 4,
      // Four independent rounds of sigma/2 sum to one round of sigma, so the
      // 72-hole distribution is identical to the single-roll version.
      sd: e.sigma / 2,
      rounds: [],
    }
  })

  // Whole strokes, because that is what a round of golf is. Rounding at the
  // point of generation rather than for display is what makes the four numbers
  // on the leaderboard actually add up to the score beside them.
  const roll = (r, sdMult = 1, shift = 0) =>
    Math.round(r.mean + shift + rng.gaussClamped(0, r.sd * sdMult, 3.1))

  // Thursday and Friday.
  for (const r of field) {
    r.rounds.push(roll(r), roll(r))
    r.through36 = r.rounds[0] + r.rounds[1]
  }

  // The cut falls here, on 36 holes, which is where it falls in life. Everyone
  // below it goes home having played two rounds — and, usefully, does not have
  // to be simulated over the weekend at all.
  const byHalfway = [...field].sort((a, b) => a.through36 - b.through36)
  const survivors = noCut ? byHalfway : byHalfway.slice(0, cutIndex)
  const goneHome = noCut ? [] : byHalfway.slice(cutIndex)
  // Anybody level with the last man in plays on — that is what the number
  // means. Capped, though: 36-hole scores bunch tightly, so an unbounded tie
  // could carry twenty extra players past the cut and out beyond the end of the
  // payout table, where they would "make the cut" and be paid nothing.
  if (!noCut && goneHome.length && survivors.length) {
    const line = Math.round(survivors[survivors.length - 1].through36)
    const ceiling = Math.min(cutIndex + 10, PAYOUT_PCT.length)
    while (goneHome.length && survivors.length < ceiling && Math.round(goneHome[0].through36) === line) {
      survivors.push(goneHome.shift())
    }
  }

  // Saturday sets up Sunday.
  for (const r of survivors) {
    r.rounds.push(roll(r))
    r.through54 = r.through36 + r.rounds[2]
  }
  ;[...survivors]
    .sort((a, b) => a.through54 - b.through54)
    .forEach((r, i) => {
      r.pos54 = i + 1
    })

  // Sunday, with the leaderboard in your pocket.
  for (const r of survivors) {
    const p = r.entrant.ignorePressure ? { shift: 0, sigmaMult: 1 } : sundayPressure(r.pos54, r.entrant.ratings?.mental)
    r.rounds.push(roll(r, p.sigmaMult, p.shift))
    r.raw = r.through54 + r.rounds[3]
  }
  for (const r of goneHome) r.raw = r.through36

  const shape = (r, missed) => ({
    entrant: r.entrant,
    raw: r.raw,
    missedCut: missed,
    playedRounds: r.rounds,
    through36: r.through36,
    through54: r.through54,
    pos54: r.pos54,
  })
  return {
    survivors: survivors.sort((a, b) => a.raw - b.raw).map((r) => shape(r, false)),
    goneHome: goneHome.sort((a, b) => a.raw - b.raw).map((r) => shape(r, true)),
  }
}

export function simTournament(event, entrants, rng, opts = {}) {
  const circuit = CIRCUITS[event.circuit]
  const offset = scoringOffset(event.difficulty)
  const n = entrants.length
  let meanQuality = 0
  for (const e of entrants) meanQuality += e.quality
  meanQuality /= Math.max(1, n)

  // Round-by-round only where somebody will see it. Playing the four rounds out
  // costs about four times a single roll, and 178 events run every season — so
  // the player's own tournaments get the real thing and the rest of the world
  // keeps the cheap one. Nothing downstream can tell the difference except that
  // Sunday exists.
  const playRounds = !!opts.detailed

  const nominalCut = event.cutSize >= event.fieldSize ? entrants.length : Math.min(event.cutSize, entrants.length)
  const noCutHere = circuit.cutSize >= circuit.fieldSize || event.circuit === 'senior'

  let rows
  let playedCutIndex = null
  if (playRounds) {
    const played = simulateRounds(entrants, {
      offset,
      meanQuality,
      event,
      rng,
      cutIndex: nominalCut,
      noCut: noCutHere,
    })
    // Weekend players are ranked on 72 holes; everyone who went home on Friday
    // sits below them, in order of the 36 they did play.
    rows = [...played.survivors, ...played.goneHome]
    playedCutIndex = played.survivors.length
  } else {
    // The cheap path still has to cut where the real one does, or the player's
    // own events would judge them over 36 holes while the rest of the world was
    // judged over 72 — a materially easier standard, and their cut record would
    // read worse than an identical AI's for no reason. Two halves rather than
    // four rounds: same total distribution, one extra draw, and the weekend is
    // only simulated for players still in it.
    const half = entrants.map((e) => {
      const skillStrokes = -(e.quality - meanQuality) * STROKES_PER_QUALITY
      const scramble = -e.scrambleEdge * 1.6
      const mean = (offset + skillStrokes + scramble) / 2
      const sd = e.sigma / Math.SQRT2
      return { entrant: e, mean, sd, through36: mean + rng.gaussClamped(0, sd, 3.1) }
    })
    half.sort((a, b) => a.through36 - b.through36)
    const survivors = noCutHere ? half : half.slice(0, nominalCut)
    const goneHome = noCutHere ? [] : half.slice(nominalCut)
    if (!noCutHere && goneHome.length && survivors.length) {
      const line = Math.round(survivors[survivors.length - 1].through36)
      const ceiling = Math.min(nominalCut + 10, PAYOUT_PCT.length)
      while (goneHome.length && survivors.length < ceiling && Math.round(goneHome[0].through36) === line) {
        survivors.push(goneHome.shift())
      }
    }
    for (const r of survivors) r.raw = r.through36 + r.mean + rng.gaussClamped(0, r.sd, 3.1)
    for (const r of goneHome) r.raw = r.through36
    survivors.sort((a, b) => a.raw - b.raw)
    goneHome.sort((a, b) => a.raw - b.raw)
    rows = [
      ...survivors.map((r) => ({ entrant: r.entrant, raw: r.raw, missedCut: false, through36: r.through36 })),
      ...goneHome.map((r) => ({ entrant: r.entrant, raw: r.raw, missedCut: true, through36: r.through36 })),
    ]
    playedCutIndex = survivors.length
  }

  // A tie for the lead goes to a playoff. Without this every player level at
  // the top was credited with the win — which happened in a fifth of all
  // events — and "won it in a playoff" could never actually occur.
  let playoffSize = 0
  if (rows.length > 1 && !rows[0].missedCut && !rows[1].missedCut && Math.round(rows[0].raw) === Math.round(rows[1].raw)) {
    let last = 1
    while (last + 1 < rows.length && Math.round(rows[last + 1].raw) === Math.round(rows[0].raw)) last++
    playoffSize = last + 1
    // Extra holes favour the better player, but only just.
    const contenders = rows.slice(0, playoffSize)
    const best = Math.max(...contenders.map((c) => c.entrant.quality))
    const winner = rng.pickWeighted(contenders, (c) => Math.exp((c.entrant.quality - best) * 0.09))
    const idx = rows.indexOf(winner)
    if (idx > 0) {
      rows.splice(idx, 1)
      rows.unshift(winner)
    }
  }

  // Round scores are only needed for leaderboards we actually show.
  const detailCount = opts.detailed ? Math.min(rows.length, opts.detailRows || 25) : 0

  const noCut = noCutHere
  // When the rounds were played the cut already happened, on Friday, on 36
  // holes — so take the answer rather than recomputing it against 72-hole
  // totals, which would let somebody who was cut be "saved" by two rounds they
  // never played.
  const cutIndex = playedCutIndex !== null ? playedCutIndex : noCut ? rows.length : nominalCut
  const cutLine =
    playedCutIndex !== null
      ? playedCutIndex < rows.length
        ? Math.round(rows[playedCutIndex - 1].through36)
        : null
      : cutIndex < rows.length
        ? Math.round(rows[cutIndex - 1].raw)
        : null

  // Assign positions with shared places on ties.
  const results = []
  let i = 0
  let displayPos = 1
  while (i < rows.length) {
    const scoreInt = Math.round(rows[i].raw)
    let j = i
    while (
      j + 1 < rows.length &&
      Math.round(rows[j + 1].raw) === scoreInt &&
      !!rows[j + 1].missedCut === !!rows[i].missedCut
    ) j++
    // The playoff winner stands alone at the top; everyone they beat there
    // shares second on the same score.
    if (i === 0 && playoffSize > 1) j = 0
    const groupSize = j - i + 1
    const tied = groupSize > 1
    for (let k = i; k <= j; k++) {
      const madeCut = rows[k].missedCut !== undefined ? !rows[k].missedCut : noCut || k < cutIndex || (tied && i < cutIndex)
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
        // Only present when the rounds were actually played.
        pos54: rows[k].pos54,
        through54: rows[k].through54 !== undefined ? Math.round(rows[k].through54) : undefined,
        playedRounds: rows[k].playedRounds,
      })
    }
    i = j + 1
    displayPos += groupSize
  }

  // Prize money: tied players split the sum of the places they occupy.
  const paysMoney = event.purse > 0
  if (paysMoney) {
    // Scale the table to the places actually being paid, so the purse is
    // distributed exactly. It cannot be baked into the table: cut sizes differ
    // by circuit (60 here, 65 there, 78 and no cut on the senior tour) and ties
    // at the cut line push the paid field past its nominal size, so any fixed
    // list of percentages is wrong for most events. Left alone this paid out
    // between 3.5% under and 1.4% over the purse depending on the circuit.
    let paidPlaces = 0
    for (const r of results) if (r.madeCut && r.pos) paidPlaces += 1
    let pctTotal = 0
    for (let place = 1; place <= paidPlaces; place++) pctTotal += PAYOUT_PCT[place - 1] || 0
    const scale = pctTotal > 0 ? 100 / pctTotal : 0

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
      const share = (pctSum / 100) * scale * event.purse / (end - idx + 1)
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
    const par = event.difficulty > 1.25 ? 70 : 71
    for (let k = 0; k < results.length; k++) {
      if (k >= detailCount && !results[k].isUser) continue
      const played = results[k].playedRounds
      if (played) {
        // Rounds that were actually played. A missed cut only played two.
        const keep = results[k].madeCut ? played : played.slice(0, 2)
        results[k].rounds = keep.map((v) => ({ toPar: v, strokes: par + v }))
      } else {
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
    playoff: playoffSize > 1 ? playoffSize : 0,
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
