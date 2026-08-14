import React, { useMemo, useState } from 'react'
import { worldRankingList } from '../game/world.js'
import { rivalTable, allTimeBoard, tourAverages } from '../game/engine.js'
import { overall } from '../game/ratings.js'
import { fmtMoney } from '../game/finance.js'
import { Card, Chip, Money, Empty, ToPar, CircuitChip } from './ui.jsx'

export default function WorldView({ state }) {
  const [tab, setTab] = useState('ranking')
  return (
    <div className="col">
      <div className="tabs">
        {[
          ['ranking', 'World ranking'],
          ['rivals', 'Rivalries'],
          ['alltime', 'All-time'],
          ['results', 'This season'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'ranking' ? <Ranking state={state} /> : null}
      {tab === 'rivals' ? <Rivals state={state} /> : null}
      {tab === 'alltime' ? <AllTime state={state} /> : null}
      {tab === 'results' ? <SeasonResults state={state} /> : null}
    </div>
  )
}

function Ranking({ state }) {
  const list = useMemo(() => worldRankingList(state.world.players, 100), [state])
  const avg = tourAverages(state)
  const me = state.player
  return (
    <div className="grid grid-main">
      <Card title="Official world ranking" aux={`${state.world.players.filter((p) => !p.retired).length} active professionals`}>
        <div className="scroll-y max-h-420 tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Player</th>
                <th className="num">Age</th>
                <th className="num">Ovr</th>
                <th className="num">Pts</th>
                <th className="num">Wins</th>
                <th className="num">Maj</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.pid} className={p.isUser ? 'me' : ''}>
                  <td className="num mono">{i + 1}</td>
                  <td>
                    {p.flag} {p.name}
                    {p.nickname ? <span className="muted-2 xs"> “{p.nickname}”</span> : null}
                  </td>
                  <td className="num muted">{p.age}</td>
                  <td className="num">{overall(p.ratings).toFixed(0)}</td>
                  <td className="num mono">{p.rankPoints.toFixed(0)}</td>
                  <td className="num">{p.wins}</td>
                  <td className={`num ${p.majors ? 'gold' : ''}`}>{p.majors || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="col">
        <Card title="You versus the tour">
          {avg ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th className="num">You</th>
                  <th className="num">Tour avg</th>
                  <th className="num">Diff</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(avg)
                  .filter((k) => k !== 'ovr')
                  .map((k) => {
                    const d = state.effRatings[k] - avg[k]
                    return (
                      <tr key={k}>
                        <td className="muted">{k}</td>
                        <td className="num b">{Math.round(state.effRatings[k])}</td>
                        <td className="num muted-2">{avg[k]}</td>
                        <td className={`num ${d > 0 ? 'green' : 'red'}`}>
                          {d > 0 ? '+' : ''}
                          {d.toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
                <tr>
                  <td className="b">Overall</td>
                  <td className="num b">{state.ovr.toFixed(1)}</td>
                  <td className="num muted-2">{avg.ovr}</td>
                  <td className={`num b ${state.ovr - avg.ovr > 0 ? 'green' : 'red'}`}>
                    {state.ovr - avg.ovr > 0 ? '+' : ''}
                    {(state.ovr - avg.ovr).toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>No tour data.</Empty>
          )}
        </Card>
        <Card title="Your position">
          <div className="pill-row">
            <Chip tone="gold">World #{me.rank ?? '—'}</Chip>
            {me.asianRank ? <Chip tone="orange">Asian order of merit #{me.asianRank}</Chip> : null}
            {me.seniorRank ? <Chip tone="purple">Senior #{me.seniorRank}</Chip> : null}
            <Chip>{me.rankPoints.toFixed(0)} ranking points</Chip>
          </div>
          <div className="xs muted-2" style={{ marginTop: 8 }}>
            Points decay every week, so the ranking rewards what you have done recently. Top 60 gets you into the
            majors.
          </div>
        </Card>
      </div>
    </div>
  )
}

function Rivals({ state }) {
  const rows = rivalTable(state, 20)
  const named = state.career.rivals || []
  if (!rows.length)
    return (
      <Card>
        <Empty>You have not shared enough leaderboards with anybody yet. Play a season or two.</Empty>
      </Card>
    )
  return (
    <div className="col">
    {named.length ? (
      <Card title="Your rivals" aux="the players this career is measured against">
        <div className="grid grid-3">
          {named.map((r) => {
            const h = state.career.h2h[r.pid]
            if (!h) return null
            const total = Math.max(1, h.beat + h.lost)
            return (
              <div key={r.pid} className="card flat tight">
                <div className="b">
                  {r.flag} {r.name}
                </div>
                <div className="xs muted-2">rivals since {r.since}</div>
                <div
                  className="mono"
                  style={{ fontSize: 22, fontWeight: 700 }}
                >
                  <span className="green">{h.beat}</span>
                  <span className="muted-2">–</span>
                  <span className="red">{h.lost}</span>
                </div>
                <div className="xs muted">
                  You come out ahead {Math.round((h.beat / total) * 100)}% of the time · they have {h.wins} wins
                  {h.majors ? `, ${h.majors} majors` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    ) : null}
    <Card title="Head to head" aux="players you have met at least four times">
      <table className="tbl">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">Age</th>
            <th className="num">Met</th>
            <th className="num">You ahead</th>
            <th className="num">Them ahead</th>
            <th className="num">Record</th>
            <th className="num">Their wins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = r.meetings ? (r.beat / Math.max(1, r.beat + r.lost)) * 100 : 0
            return (
              <tr key={r.pid}>
                <td>
                  {r.flag} {r.name}
                </td>
                <td className="num muted">{r.age}</td>
                <td className="num">{r.meetings}</td>
                <td className="num green">{r.beat}</td>
                <td className="num red">{r.lost}</td>
                <td className={`num b ${r.diff > 0 ? 'green' : r.diff < 0 ? 'red' : 'muted'}`}>
                  {r.beat}–{r.lost} ({pct.toFixed(0)}%)
                </td>
                <td className="num muted">
                  {r.wins}
                  {r.majors ? <span className="gold"> · {r.majors} maj</span> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
    </div>
  )
}

function AllTime({ state }) {
  const rows = allTimeBoard(state)
  return (
    <Card title="All-time greats" aux="legends of the past, plus everybody playing now">
      <div className="scroll-y max-h-420 tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Player</th>
              <th className="num">Majors</th>
              <th className="num">Wins</th>
              <th className="num">Peak</th>
              <th className="num">Earnings</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.pid}-${i}`} className={r.isUser ? 'me' : ''}>
                <td className="num mono">{i + 1}</td>
                <td>
                  {r.flag} {r.name}
                </td>
                <td className="num gold b">{r.majors}</td>
                <td className="num">{r.wins}</td>
                <td className="num muted">{r.peakOvr}</td>
                <td className="num"><Money v={r.careerEarnings} /></td>
                <td>
                  {r.legend ? (
                    <Chip>retired {r.eraEnd}</Chip>
                  ) : r.active ? (
                    <Chip tone="green">active</Chip>
                  ) : (
                    <Chip>retired</Chip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="xs muted-2" style={{ marginTop: 6 }}>
        Career earnings for past legends are in the money of their era, which is why the modern numbers look absurd.
      </div>
    </Card>
  )
}

function SeasonResults({ state }) {
  const rows = Object.values(state.seasonResults).sort((a, b) => a.week - b.week)
  if (!rows.length)
    return (
      <Card>
        <Empty>No tournaments have been played this season.</Empty>
      </Card>
    )
  return (
    <Card title={`${state.year} results across every circuit`} aux={`${rows.length} events completed`}>
      <div className="scroll-y max-h-420 tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">Wk</th>
              <th>Event</th>
              <th />
              <th>Winner</th>
              <th className="num">Score</th>
              <th className="num">Cut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.eventId} className={r.top?.some((t) => t.isUser && t.pos === 1) ? 'me' : ''}>
                <td className="num mono muted-2">{r.week}</td>
                <td>
                  {r.isMajor ? <span className="gold">★ </span> : null}
                  {r.name}
                </td>
                <td>
                  <CircuitChip id={r.circuit} small />
                </td>
                <td>
                  {r.winner.flag} {r.winner.name}
                </td>
                <td className="num">
                  <ToPar v={r.winner.toPar} />
                </td>
                <td className="num muted-2 mono">{r.cutLine === null ? '—' : r.cutLine > 0 ? `+${r.cutLine}` : r.cutLine}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
