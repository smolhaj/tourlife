import React, { useMemo, useState } from 'react'
import { fmtMoney } from '../game/finance.js'
import { legacyScore, legacyLabel, majorNarrative } from '../game/narrative.js'
import { Card, Stat, StatGrid, Chip, CircuitChip, Money, Empty, Sparkline } from './ui.jsx'

export default function CareerView({ state }) {
  const c = state.career
  const p = state.player
  const legacy = legacyScore(c, p)
  const [tab, setTab] = useState('seasons')

  const winsByYear = useMemo(() => {
    const m = new Map()
    for (const w of c.winsList) m.set(w.year, (m.get(w.year) || 0) + 1)
    return m
  }, [c.winsList])

  return (
    <div className="col">
      <div className="grid grid-4">
        <StatBox k="Wins" v={c.wins} s={c.amateurWins ? `+${c.amateurWins} amateur` : ''} tone="gold" />
        <StatBox k="Majors" v={c.majors} s={majorNarrative(c.majors).label} tone={c.majors ? 'gold' : ''} />
        <StatBox k="Top 10s" v={c.top10s} s={`${c.cutsMade}/${c.starts} cuts made`} />
        <StatBox
          k="Career earnings"
          v={fmtMoney(c.careerGross, { compact: true })}
          s={`${fmtMoney(c.careerEarnings, { compact: true })} after fees`}
        />
      </div>

      <div className="tabs">
        {[
          ['seasons', 'Season by season'],
          ['highlights', 'Highlights'],
          ['wins', `Wins (${c.winsList.length})`],
          ['results', 'Every start'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'seasons' ? <Seasons state={state} winsByYear={winsByYear} /> : null}
      {tab === 'highlights' ? <Highlights state={state} /> : null}
      {tab === 'wins' ? <WinsList state={state} /> : null}
      {tab === 'results' ? <AllResults state={state} /> : null}

      <Card title="Legacy" aux={`${legacy} Hall of Fame points`}>
        <div className="row wrap between center">
          <div>
            <div style={{ fontSize: 22, fontWeight: 750 }} className={legacyLabel(legacy).tone === 'great' ? 'gold' : ''}>
              {legacyLabel(legacy).label}
            </div>
            <div className="small muted">
              {c.weeksAtNo1 ? `${c.weeksAtNo1} weeks at world number one. ` : ''}
              {c.bestRank ? `Best ranking #${c.bestRank}. ` : ''}
              {c.seasonsTop10 ? `${c.seasonsTop10} seasons finishing top 10 in the world.` : ''}
            </div>
          </div>
          <div className="pill-row">
            <Chip tone="gold">{c.majors} majors × 15</Chip>
            <Chip>{c.wins} wins × 3.1</Chip>
            <Chip>{c.seniorWins} senior wins</Chip>
          </div>
        </div>
      </Card>
    </div>
  )
}

function StatBox({ k, v, s, tone }) {
  return (
    <div className="card tight">
      <div className="k xs muted-2" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {k}
      </div>
      <div className={`mono ${tone || ''}`} style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>
        {v}
      </div>
      {s ? <div className="xs muted-2">{s}</div> : null}
    </div>
  )
}

function Seasons({ state, winsByYear }) {
  const rows = state.career.seasons
  if (!rows.length) return <Card><Empty>No completed seasons yet.</Empty></Card>
  return (
    <div className="col">
      <div className="grid grid-3">
        <Card title="Earnings by season" bodyClass="col">
          <Sparkline values={rows.map((r) => r.prizeGross)} color="var(--gold)" />
          <div className="xs muted-2">Gross prize money, {rows[0].year}–{rows[rows.length - 1].year}</div>
        </Card>
        <Card title="World ranking" bodyClass="col">
          <Sparkline values={rows.map((r) => -(r.rankEnd || 400))} color="var(--blue)" />
          <div className="xs muted-2">Higher is better. Best: #{state.career.bestRank ?? '—'}</div>
        </Card>
        <Card title="Net worth" bodyClass="col">
          <Sparkline values={rows.map((r) => r.cashEnd)} color="var(--green)" zeroLine />
          <div className="xs muted-2">End-of-year bank balance</div>
        </Card>
      </div>

      <Card title="Season by season">
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">Age</th>
                <th className="num">Ovr</th>
                <th className="num">Starts</th>
                <th className="num">Cuts</th>
                <th className="num">T10</th>
                <th className="num">Wins</th>
                <th className="num">Maj</th>
                <th className="num">Best</th>
                <th className="num">Gross</th>
                <th className="num">Endorse</th>
                <th className="num">Costs</th>
                <th className="num">Bank</th>
                <th className="num">Rank</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year}>
                  <td className="mono b">{r.year}</td>
                  <td className="num">{r.age}</td>
                  <td className="num">{r.ovr}</td>
                  <td className="num">{r.starts}</td>
                  <td className="num">{r.cuts}</td>
                  <td className="num">{r.top10s}</td>
                  <td className={`num ${r.wins ? 'gold b' : ''}`}>{r.wins || ''}</td>
                  <td className={`num ${r.majors ? 'gold b' : ''}`}>{r.majors || ''}</td>
                  <td className="num muted">{r.bestFinish ? (r.bestFinish === 1 ? '1st' : r.bestFinish) : '—'}</td>
                  <td className="num"><Money v={r.prizeGross} zeroDash /></td>
                  <td className="num"><Money v={r.endorse} zeroDash /></td>
                  <td className="num red"><Money v={-r.expenses} /></td>
                  <td className={`num ${r.cashEnd < 0 ? 'red' : ''}`}><Money v={r.cashEnd} /></td>
                  <td className="num muted">{r.rankEnd ? `#${r.rankEnd}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="xs muted-2" style={{ marginTop: 6 }}>
          {winsByYear.size} winning season{winsByYear.size === 1 ? '' : 's'} out of {rows.length}.
        </div>
      </Card>
    </div>
  )
}

function Highlights({ state }) {
  const items = state.career.highlights
  if (!items.length) return <Card><Empty>Nothing worth remembering yet. Go and do something.</Empty></Card>
  return (
    <Card title="Career highlights">
      <div className="timeline">
        {items.map((h, i) => (
          <div
            key={i}
            className={`tl-item ${h.importance >= 4 ? 'big' : ''} ${
              h.type === 'injury' || h.type === 'decline' || h.type === 'drought' ? 'bad' : ''
            }`}
          >
            <div className="yr">
              {h.year}
              {h.week ? ` · week ${h.week}` : ''}
            </div>
            <div className="ttl">{h.title}</div>
            <div className="txt">{h.text}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function WinsList({ state }) {
  const wins = state.career.winsList
  if (!wins.length) return <Card><Empty>No wins yet.</Empty></Card>
  const byVenue = state.career.venueWins
  const repeat = Object.entries(byVenue).filter(([, n]) => n > 1)
  return (
    <Card title={`${wins.length} career wins`}>
      {repeat.length ? (
        <div className="pill-row" style={{ marginBottom: 10 }}>
          {repeat.map(([v, n]) => (
            <Chip key={v} tone="gold">
              {v} × {n}
            </Chip>
          ))}
        </div>
      ) : null}
      <table className="tbl">
        <thead>
          <tr>
            <th>Year</th>
            <th>Event</th>
            <th />
            <th className="num">Score</th>
            <th className="num">Margin</th>
            <th className="num">Purse</th>
          </tr>
        </thead>
        <tbody>
          {wins
            .slice()
            .reverse()
            .map((w, i) => (
              <tr key={i}>
                <td className="mono">{w.year}</td>
                <td>
                  {w.isMajor ? <span className="gold">★ </span> : null}
                  {w.name}
                </td>
                <td>
                  <CircuitChip id={w.circuit} small />
                </td>
                <td className="num mono">{w.toPar > 0 ? `+${w.toPar}` : w.toPar === 0 ? 'E' : w.toPar}</td>
                <td className="num muted">{w.margin === 0 ? 'playoff' : `${w.margin}`}</td>
                <td className="num"><Money v={w.purse} /></td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  )
}

function AllResults({ state }) {
  const [year, setYear] = useState('all')
  const all = state.career.allResults
  const years = Array.from(new Set(all.map((r) => r.year)))
  const rows = year === 'all' ? all.slice().reverse() : all.filter((r) => r.year === Number(year)).slice().reverse()
  if (!all.length) return <Card><Empty>No starts recorded yet.</Empty></Card>
  return (
    <Card title="Every start" aux={`${all.length} tournaments`}>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={year} onChange={(e) => setYear(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">All years</option>
          {years.reverse().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="scroll-y max-h-420">
        <table className="tbl">
          <thead>
            <tr>
              <th>Year</th>
              <th>Event</th>
              <th />
              <th className="num">Pos</th>
              <th className="num">Score</th>
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={!r.madeCut ? 'dim' : ''}>
                <td className="mono muted-2">{r.year}</td>
                <td>
                  {r.isMajor ? <span className="gold">★ </span> : null}
                  {r.name}
                </td>
                <td>
                  <CircuitChip id={r.circuit} small />
                </td>
                <td className={`num lb-pos ${r.pos === 1 ? 'gold' : ''}`}>
                  {r.madeCut ? `${r.tied ? 'T' : ''}${r.pos}` : 'MC'}
                </td>
                <td className="num mono">{r.madeCut ? (r.toPar > 0 ? `+${r.toPar}` : r.toPar === 0 ? 'E' : r.toPar) : '—'}</td>
                <td className="num"><Money v={r.net} zeroDash /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
