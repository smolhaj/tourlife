import React, { useMemo, useState } from 'react'
import { CIRCUITS, CIRCUIT_ORDER, COURSE_TYPES } from '../game/constants.js'
import { checkEligibility, CARD_LABELS, cardStatus } from '../game/eligibility.js'
import { upcomingYear, longHaulWeeks } from '../game/engine.js'
import { PLAYING_WEEKS } from '../game/schedule.js'
import { fmtMoney, appearanceFee } from '../game/finance.js'
import { marketability } from '../game/sponsors.js'
import { plural } from '../game/narrative.js'
import { familiarityLabel, venueStartsOf, venueWinsOf } from '../game/venue.js'
import { Card, CircuitChip, Chip } from './ui.jsx'

/**
 * Week-by-week schedule picker. Used in the offseason for next year and
 * in-season for the weeks you have not played yet.
 */
export default function ScheduleBuilder({ state, forNext, onToggle, onAuto, onClear, onQualify }) {
  const events = forNext ? state.nextSeason : state.season
  const entered = forNext ? state.nextEntered : state.entered
  const fromWeek = forNext ? 1 : state.week
  const [filter, setFilter] = useState('eligible')
  const [circuitFilter, setCircuitFilter] = useState('all')

  // Eligibility for the coming season is judged against its calendar year.
  const targetYear = forNext ? upcomingYear(state) : state.year
  const probe = useMemo(
    () => (targetYear === state.year ? state : { ...state, year: targetYear }),
    [state, targetYear],
  )

  const weeks = useMemo(() => {
    const map = new Map()
    for (const ev of events) {
      if (ev.week < fromWeek) continue
      if (circuitFilter !== 'all' && ev.circuit !== circuitFilter) continue
      const elig = checkEligibility(probe, ev)
      if (filter === 'eligible' && !elig.ok) continue
      if (filter === 'entered' && !entered[ev.id]) continue
      if (!map.has(ev.week)) map.set(ev.week, [])
      map.get(ev.week).push({ ev, elig })
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.ev.isMajor ? 1 : 0) - (a.ev.isMajor ? 1 : 0) || b.ev.purse - a.ev.purse)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [events, entered, fromWeek, filter, circuitFilter, probe])

  const enteredCount = Object.keys(entered).filter((id) => events.some((e) => e.id === id && e.week >= fromWeek)).length
  const enteredList = events.filter((e) => entered[e.id] && e.week >= fromWeek)
  const totalPurse = enteredList.reduce((a, e) => a + e.purse, 0)
  const majorsIn = enteredList.filter((e) => e.isMajor).length
  const backToBack = maxConsecutive(enteredList.map((e) => e.week))
  const longHaul = useMemo(() => longHaulWeeks(state, forNext), [state, forNext])
  // What a promoter would pay you to turn up. Shown at the first-of-season
  // rate; each one you take that year is worth less than the last.
  const m = useMemo(() => marketability(state.player, state.career), [state.player, state.career])

  return (
    <div className="col">
      <Card
        title={forNext ? `${targetYear} schedule` : 'Remaining schedule'}
        aux={`${plural(enteredCount, 'start')} · ${majorsIn}/4 majors · ${fmtMoney(totalPurse, { compact: true })} in purses`}
      >
        <div className="row wrap between center" style={{ marginBottom: 10 }}>
          <div className="btn-group">
            <button className="btn sm" onClick={() => onAuto(18)}>
              Light (18)
            </button>
            <button className="btn sm" onClick={() => onAuto(25)}>
              Standard (25)
            </button>
            <button className="btn sm" onClick={() => onAuto(32)}>
              Heavy (32)
            </button>
            <button className="btn sm ghost" onClick={onClear}>
              Clear
            </button>
          </div>
          <div className="btn-group">
            {['eligible', 'all', 'entered'].map((f) => (
              <button key={f} className={`btn xs ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="pill-row" style={{ marginBottom: 10 }}>
          <button className={`btn xs ${circuitFilter === 'all' ? 'active' : ''}`} onClick={() => setCircuitFilter('all')}>
            All circuits
          </button>
          {CIRCUIT_ORDER.map((cid) => {
            const st = cid === 'major' ? null : cardStatus(state, cid)
            return (
              <button
                key={cid}
                className={`btn xs ${circuitFilter === cid ? 'active' : ''}`}
                onClick={() => setCircuitFilter(cid)}
                title={st ? CARD_LABELS[st] : 'Exemption based'}
              >
                {CIRCUITS[cid].short}
                {st && st !== 'none' ? <span className="gold"> ●</span> : null}
              </button>
            )
          })}
        </div>

        {backToBack >= 5 ? (
          <div className="chip red wrap" style={{ marginBottom: 8 }}>
            {backToBack} weeks in a row — you will arrive at the next major exhausted
          </div>
        ) : null}

        {longHaul.length ? (
          <div className="chip orange wrap" style={{ marginBottom: 8 }}>
            {plural(longHaul.length, 'long-haul week')} —{' '}
            {longHaul
              .slice(0, 3)
              .map((h) => `${h.name} in week ${h.week} (+${Math.round(h.cost)} fatigue off the plane)`)
              .join(', ')}
            {longHaul.length > 3 ? ', and more' : ''}. A week at home either side is most of the cure.
          </div>
        ) : null}

        {weeks.length === 0 ? (
          <div className="empty">
            No events match. Try the “all” filter — you may need to qualify, or earn status first.
          </div>
        ) : (
          <div className="week-grid">
            {weeks.map(([week, list]) => (
              <div
                key={week}
                className={`week-cell ${list.some((x) => entered[x.ev.id]) ? 'entered' : ''} ${
                  list.some((x) => x.ev.isMajor) ? 'major' : ''
                }`}
              >
                <div className="wk">
                  WEEK {week}
                  {week > PLAYING_WEEKS ? ' · offseason' : ''}
                </div>
                <div className="opts">
                  {list.map(({ ev, elig }) => {
                    const on = !!entered[ev.id]
                    return (
                      <button
                        key={ev.id}
                        className={`evopt ${on ? 'on' : ''} ${!elig.ok ? 'locked' : ''}`}
                        title={
                          elig.ok
                            ? `${ev.venue} · ${COURSE_TYPES[ev.courseType].name} · ${familiarityLabel(venueStartsOf(state.career, ev.venue), venueWinsOf(state.career, ev.venue)).toLowerCase()} · ${elig.via}`
                            : `${elig.reason}${elig.qualifier ? ` — qualifier ${(elig.qualifier * 100).toFixed(0)}%` : ''}`
                        }
                        onClick={() => {
                          if (elig.ok) onToggle(ev.id)
                          else if (elig.qualifier && onQualify) onQualify(ev.id, elig.qualifier)
                        }}
                        disabled={!elig.ok && !elig.qualifier}
                      >
                        <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.isMajor ? '★ ' : ev.flagship ? '◆ ' : ''}
                          {ev.shortName || ev.name}
                        </span>
                        <span className="mono muted-2">
                          {ev.purse ? fmtMoney(ev.purse, { compact: true }) : 'am'}
                          {appearanceFee(ev, m, 0) > 0 ? (
                            <span className="gold"> +{fmtMoney(appearanceFee(ev, m, 0), { compact: true })}</span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {list[0] ? (
                  <div className="mt" style={{ marginTop: 4 }}>
                    <CircuitChip id={list[0].ev.circuit} small />{' '}
                    <span className="xs">{COURSE_TYPES[list[0].ev.courseType].name}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Tour status">
        <div className="pill-row">
          {['domestic', 'intl', 'asian', 'emerging', 'senior'].map((cid) => {
            const st = cardStatus(state, cid)
            return (
              <Chip key={cid} tone={st === 'full' ? 'green' : st === 'conditional' ? 'gold' : undefined}>
                {CIRCUITS[cid].name}: {CARD_LABELS[st]}
                {state.cards[cid]?.until && st !== 'none' ? ` → ${state.cards[cid].until}` : ''}
              </Chip>
            )
          })}
          <Chip tone={state.player.rank && state.player.rank <= 60 ? 'orange' : undefined}>
            Majors: {state.player.rank && state.player.rank <= 60 ? 'exempt (top 60)' : state.majorExemptUntil >= state.year ? `exempt to ${state.majorExemptUntil}` : 'must qualify'}
          </Chip>
        </div>
      </Card>
    </div>
  )
}

function maxConsecutive(weeks) {
  const set = new Set(weeks)
  let best = 0
  for (const w of set) {
    if (set.has(w - 1)) continue
    let n = 1
    while (set.has(w + n)) n++
    best = Math.max(best, n)
  }
  return best
}
