import React from 'react'
import { CIRCUITS, COURSE_TYPES, ATTRS } from '../game/constants.js'
import { checkEligibility, nextEnteredEvent, seasonSummary, currentBurn } from '../game/engine.js'
import { careerPhase, majorNarrative, plural } from '../game/narrative.js'
import { overallLabel, courseFit } from '../game/ratings.js'
import { fmtMoney, coastStatus } from '../game/finance.js'
import { recoveryNote } from '../game/injuries.js'
import { PLAYING_WEEKS } from '../game/schedule.js'
import { Card, Stat, StatGrid, Chip, CircuitChip, Money, ToPar, posLabel, Empty, ProgressBar } from './ui.jsx'

export default function Dashboard({ state, onOpenResult, onGoTab }) {
  const p = state.player
  const next = nextEnteredEvent(state)
  const summary = seasonSummary(state)
  const burn = currentBurn(state)
  const coast = coastStatus(state.finance.cash, burn)
  const phase = careerPhase(p)
  const recent = state.seasonLog.slice(-6).reverse()
  const log = state.log.slice(-14).reverse()

  return (
    <div className="grid grid-main">
      <div className="col">
        <NextEvent state={state} event={next} />

        <Card title={`${state.year} season`} aux={`Week ${Math.min(state.week, PLAYING_WEEKS)} of ${PLAYING_WEEKS}`}>
          <StatGrid>
            <Stat k="Starts" v={summary.starts} s={`${summary.remainingEvents} scheduled left`} />
            <Stat k="Wins" v={summary.wins} tone={summary.wins ? 'gold' : ''} s={summary.majors ? `${summary.majors} major` : ''} />
            <Stat k="Top 10s" v={summary.top10s} />
            <Stat k="Cuts made" v={`${summary.cuts}/${summary.starts}`} s={summary.missedCuts ? `${summary.missedCuts} MC` : 'perfect'} />
            <Stat k="Prize (net)" v={fmtMoney(state.finance.seasonPrizeNet, { compact: true })} s={`${fmtMoney(summary.prizeGross, { compact: true })} gross`} />
            <Stat k="Best finish" v={summary.bestFinish ? `${summary.bestFinish}` : '—'} />
          </StatGrid>
        </Card>

        <Card title="Recent results" aux={state.seasonLog.length ? `${plural(state.seasonLog.length, 'start')} this season` : null}>
          {recent.length === 0 ? (
            <Empty>No starts yet this season.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Wk</th>
                  <th>Event</th>
                  <th />
                  <th className="num">Pos</th>
                  <th className="num">Score</th>
                  <th className="num">Earned</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={`${r.eventId}-${i}`} className="pointer" onClick={() => onOpenResult(r.eventId)}>
                    <td className="mono muted-2">{r.week}</td>
                    <td>
                      {r.isMajor ? <span className="gold">★ </span> : null}
                      {r.name}
                    </td>
                    <td>
                      <CircuitChip id={r.circuit} small />
                    </td>
                    <td className={`num lb-pos ${r.pos === 1 ? 'gold' : !r.madeCut ? 'muted-2' : ''}`}>{posLabel(r)}</td>
                    <td className="num">
                      <ToPar v={r.toPar} />
                    </td>
                    <td className="num">
                      <Money v={r.net} zeroDash />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Week by week">
          <div className="log scroll-y max-h-320">
            {log.length === 0 ? (
              <Empty>Nothing has happened yet.</Empty>
            ) : (
              log.map((l) => (
                <div key={l.id} className={`log-item ${l.kind}`}>
                  <div className="wk">
                    {l.year} · w{l.week}
                  </div>
                  <div className="body">
                    <div className="t">{l.text}</div>
                    {l.detail ? <div className="d">{l.detail}</div> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="col">
        <Card title="Condition">
          <div className="col gap-sm">
            <Gauge label="Form" value={(p.form + 5.5) / 11} display={p.form >= 0.6 ? 'Hot' : p.form <= -0.6 ? 'Cold' : 'Level'} tone="var(--green)" />
            <Gauge label="Fatigue" value={p.fatigue / 100} display={`${Math.round(p.fatigue)}%`} tone={p.fatigue > 65 ? 'var(--red)' : 'var(--orange)'} invert />
            <Gauge label="Morale" value={p.morale / 100} display={`${Math.round(p.morale)}%`} tone="var(--blue)" />
          </div>
          {p.injury ? (
            <div className="card flat tight" style={{ marginTop: 10, borderColor: 'var(--red)' }}>
              <div className="row between center">
                <b className="red">{p.injury.name}</b>
                <span className="mono xs">{p.injury.weeksLeft}w left</span>
              </div>
              <div className="small muted">{p.injury.text}</div>
              <div className="xs muted-2" style={{ marginTop: 4 }}>
                {recoveryNote(p.injury)}
              </div>
            </div>
          ) : (
            <div className="small muted" style={{ marginTop: 10 }}>
              Fit and available.
            </div>
          )}
        </Card>

        <Card title="Player" aux={overallLabel(state.ovr)}>
          <div className="row between center" style={{ marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 750, lineHeight: 1 }} className="mono gold">
                {state.ovr.toFixed(0)}
              </div>
              <div className="xs muted-2">overall (with gear)</div>
            </div>
            <div className="col gap-sm" style={{ alignItems: 'flex-end' }}>
              <Chip tone="blue">{phase.label}</Chip>
              <Chip tone={state.career.majors ? 'gold' : undefined}>{majorNarrative(state.career.majors).label}</Chip>
            </div>
          </div>
          <div className="row wrap gap-sm">
            {ATTRS.slice(0, 6).map((a) => (
              <Chip key={a.key} title={a.label}>
                {a.short} {Math.round(state.effRatings[a.key])}
              </Chip>
            ))}
          </div>
          <button className="btn sm block" style={{ marginTop: 10 }} onClick={() => onGoTab('player')}>
            Full player card
          </button>
        </Card>

        <Card title="Money" aux={`${fmtMoney(burn, { compact: true })}/yr burn`}>
          <StatGrid>
            <Stat k="Bank" v={fmtMoney(state.finance.cash, { compact: true })} tone={state.finance.cash < 0 ? 'red' : 'green'} />
            <Stat k="Career gross" v={fmtMoney(state.career.careerGross, { compact: true })} />
          </StatGrid>
          <div style={{ marginTop: 10 }}>
            {coast.next ? (
              <>
                <div className="row between xs muted">
                  <span>Next: {coast.next.label}</span>
                  <span className="mono">{fmtMoney(coast.next.amount, { compact: true })}</span>
                </div>
                <ProgressBar value={Math.max(0, state.finance.cash)} max={coast.next.amount} />
                <div className="xs muted-2" style={{ marginTop: 4 }}>
                  {coast.reached ? `Reached: ${coast.reached.label}. ` : ''}
                  {coast.next.blurb}
                </div>
              </>
            ) : (
              <div className="green small">You have cleared every financial milestone in the game.</div>
            )}
          </div>
        </Card>

        {state.career.rivals?.length ? (
          <Card title="Rivals">
            <div className="col gap-sm">
              {state.career.rivals.map((r) => {
                const h = state.career.h2h[r.pid]
                if (!h) return null
                const total = h.beat + h.lost
                return (
                  <div key={r.pid}>
                    <div className="row between center small">
                      <span>
                        {r.flag} <b>{r.name}</b>
                      </span>
                      <span className={`mono ${h.beat > h.lost ? 'green' : h.beat < h.lost ? 'red' : 'muted'}`}>
                        {h.beat}–{h.lost}
                      </span>
                    </div>
                    <ProgressBar
                      value={h.beat}
                      max={Math.max(1, total)}
                      tone={h.beat > h.lost ? 'var(--green)' : 'var(--red)'}
                    />
                    <div className="xs muted-2">
                      {h.meetings} shared leaderboards since {r.since} · {h.wins} career wins
                      {h.majors ? `, ${plural(h.majors, 'major')}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : null}

        <Card title="Newswire">
          <div className="log scroll-y max-h-320">
            {state.news.length === 0 ? (
              <Empty>Quiet week.</Empty>
            ) : (
              state.news.slice(0, 12).map((n, i) => (
                <div key={i} className="log-item">
                  <div className="wk">{n.year}</div>
                  <div className="body">
                    <div className={`t ${n.kind === 'bad' ? 'red' : n.kind === 'highlight' || n.kind === 'major' ? 'gold' : ''}`}>{n.text}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Gauge({ label, value, display, tone, invert }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div>
      <div className="row between xs muted">
        <span>{label}</span>
        <span className="mono">{display}</span>
      </div>
      <div className="meter" style={{ height: 7 }}>
        <div className="fill" style={{ width: `${pct}%`, background: invert && pct > 65 ? 'var(--red)' : tone }} />
      </div>
    </div>
  )
}

function NextEvent({ state, event }) {
  if (state.phase !== 'season') {
    return (
      <Card title="Offseason">
        <Empty>The season is over. Make your offseason decisions to start the next one.</Empty>
      </Card>
    )
  }
  if (!event) {
    return (
      <Card title="Next start">
        <Empty>
          Nothing scheduled. Open the Schedule tab and enter some events, or sim to the offseason.
        </Empty>
      </Card>
    )
  }
  const c = COURSE_TYPES[event.courseType]
  const elig = checkEligibility(state, event)
  const weeksAway = event.week - state.week
  const fits = fitFor(state, event)
  return (
    <Card
      title="Next start"
      aux={weeksAway <= 0 ? 'This week' : `In ${weeksAway} week${weeksAway === 1 ? '' : 's'}`}
    >
      <div className="row between wrap center" style={{ gap: 10 }}>
        <div className="grow">
          <div className="row center gap-sm" style={{ marginBottom: 4 }}>
            <CircuitChip id={event.circuit} />
            {event.isMajor ? <Chip tone="orange">MAJOR</Chip> : null}
            {event.flagship && !event.isMajor ? <Chip tone="gold">Invitational</Chip> : null}
          </div>
          <h2 style={{ fontSize: 20 }}>{event.name}</h2>
          <div className="muted small">
            {event.venue}
            {event.city ? ` · ${event.city}` : ''} · {c.name}
          </div>
          {event.blurb ? <div className="small muted-2" style={{ marginTop: 6, fontStyle: 'italic' }}>{event.blurb}</div> : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono gold" style={{ fontSize: 20, fontWeight: 700 }}>
            {event.purse ? fmtMoney(event.purse, { compact: true }) : 'Amateur'}
          </div>
          <div className="xs muted-2">purse · {CIRCUITS[event.circuit].pointsBase} pts to the winner</div>
        </div>
      </div>

      <div className="hr" />
      <div className="row wrap gap-sm">
        <Chip tone={fits.tone}>{fits.label}</Chip>
        <Chip>Setup: {event.difficulty >= 1.2 ? 'Brutal' : event.difficulty >= 1.05 ? 'Firm' : event.difficulty >= 0.95 ? 'Fair' : 'Gettable'}</Chip>
        <Chip>Field {event.fieldSize}</Chip>
        <Chip tone={elig.ok ? 'green' : 'red'}>{elig.ok ? elig.via : elig.reason}</Chip>
        {state.player.fatigue > 60 ? <Chip tone="red">Tired ({Math.round(state.player.fatigue)}%)</Chip> : null}
      </div>
    </Card>
  )
}

/** How well the player's game suits this course, in words. */
function fitFor(state, event) {
  const diff = courseFit(state.effRatings, event.courseType)
  if (diff > 1.6) return { label: 'This course suits you well', tone: 'green' }
  if (diff > 0.5) return { label: 'Decent fit for your game', tone: 'green' }
  if (diff < -1.6) return { label: 'This course does not suit you', tone: 'red' }
  if (diff < -0.5) return { label: 'Awkward fit', tone: 'red' }
  return { label: 'Neutral fit', tone: undefined }
}
