import React from 'react'
import { retirementPressure } from '../game/engine.js'
import { legacyScore, legacyLabel, majorNarrative, shareText } from '../game/narrative.js'
import { fmtMoney } from '../game/finance.js'
import { Modal, Card, Chip, Stat, StatGrid, ProgressBar, Empty } from './ui.jsx'

export function RetireDialog({ state, onClose, onRetire }) {
  const rp = retirementPressure(state)
  const p = state.player
  return (
    <Modal
      title="Do you stop?"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Keep playing
          </button>
          <button className="btn danger" onClick={onRetire}>
            Retire at {p.age}
          </button>
        </>
      }
    >
      <div className="row between center" style={{ marginBottom: 12 }}>
        <div>
          <div className="muted small">Pressure to walk away</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 750 }}>
            {rp.pressure}
            <span className="muted-2" style={{ fontSize: 16 }}>
              /100
            </span>
          </div>
        </div>
        <div style={{ width: 220 }}>
          <ProgressBar value={rp.pressure} max={100} tone={rp.pressure > 65 ? 'var(--red)' : 'var(--gold)'} />
          <div className="xs muted-2" style={{ marginTop: 4 }}>
            {rp.pressure > 75
              ? 'Everyone around you thinks it is time.'
              : rp.pressure > 45
                ? 'It has crossed your mind more than once this year.'
                : 'You still want it.'}
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <Card title="Reasons to stop">
          {rp.reasons.length === 0 ? (
            <Empty>None worth listening to.</Empty>
          ) : (
            <div className="col gap-sm">
              {rp.reasons.map((r, i) => (
                <div key={i} className="row between small">
                  <span>
                    <b>{r.label}</b> <span className="muted">— {r.detail}</span>
                  </span>
                  <span className="mono muted-2">+{Math.round(r.weight)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Reasons to keep going">
          {rp.chasing.length === 0 ? (
            <Empty>You have done what you came to do.</Empty>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
              {rp.chasing.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="hr" />
      <div className="row wrap gap-sm">
        <Chip tone={state.finance.cash > 0 ? 'green' : 'red'}>Bank {fmtMoney(state.finance.cash, { compact: true })}</Chip>
        <Chip>Burn {fmtMoney(rp.burn, { compact: true })}/yr</Chip>
        {rp.coast.reached ? <Chip tone="green">{rp.coast.reached.label} reached</Chip> : null}
        <Chip tone="gold">{state.career.wins} wins · {state.career.majors} majors</Chip>
      </div>
      <div className="small muted" style={{ marginTop: 10 }}>
        Retiring ends the career. You can still browse everything afterwards, export it, or rewind if you change your
        mind.
      </div>
    </Modal>
  )
}

export function RetiredScreen({ state, onNewCareer, onExport, onUnretire }) {
  const c = state.career
  const p = state.player
  const legacy = legacyScore(c, p)
  const lbl = legacyLabel(legacy)
  const text = shareText(state)

  return (
    <div className="col gap-lg" style={{ maxWidth: 900, margin: '0 auto' }}>
      <Card>
        <div className="center-text" style={{ padding: '16px 0' }}>
          <div className="muted small">
            {p.flag} {p.name} · {state.startYear}–{c.retiredYear}
          </div>
          <h1 style={{ fontSize: 34, margin: '6px 0' }} className={lbl.tone === 'great' ? 'gold' : ''}>
            {lbl.label}
          </h1>
          <div className="muted">
            {p.foldedBroke
              ? `The money ran out at ${c.retiredAge}. ${majorNarrative(c.majors).label}.`
              : `Retired at ${c.retiredAge}. ${majorNarrative(c.majors).label}.`}
          </div>
          {p.foldedBroke ? (
            <div className="small muted-2" style={{ marginTop: 8, maxWidth: 560, margin: '8px auto 0' }}>
              Not a decision — a bank balance. Entry fees and flights come due before prize money does, and there was
              nobody left to borrow from. There is a job at a club back home, and you take it.
            </div>
          ) : null}
        </div>
        <StatGrid>
          <Stat k="Majors" v={c.majors} tone={c.majors ? 'gold' : ''} />
          <Stat k="Tour wins" v={c.wins} />
          <Stat k="Senior wins" v={c.seniorWins} />
          <Stat k="Top 10s" v={c.top10s} />
          <Stat k="Starts" v={c.starts} s={`${c.cutsMade} cuts made`} />
          <Stat k="Weeks at #1" v={c.weeksAtNo1} />
          <Stat k="Best rank" v={c.bestRank ? `#${c.bestRank}` : '—'} />
          <Stat k="Career earnings" v={fmtMoney(c.careerGross, { compact: true })} />
          <Stat k="Final net worth" v={fmtMoney(state.finance.cash, { compact: true })} tone={state.finance.cash < 0 ? 'red' : 'green'} />
          <Stat k="Legacy score" v={legacy.toFixed(0)} tone={legacy >= 100 ? 'gold' : ''} />
        </StatGrid>
      </Card>

      <Card title="Share this career">
        <div className="share-box">{text}</div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button
            className="btn"
            onClick={() => {
              navigator.clipboard?.writeText(text)
            }}
          >
            Copy summary
          </button>
          <button className="btn" onClick={onExport}>
            Download career file
          </button>
        </div>
      </Card>

      {c.highlights.length ? (
        <Card title="How it happened">
          <div className="timeline">
            {c.highlights.map((h, i) => (
              <div key={i} className={`tl-item ${h.importance >= 4 ? 'big' : ''}`}>
                <div className="yr">{h.year}</div>
                <div className="ttl">{h.title}</div>
                <div className="txt">{h.text}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="row wrap">
        <button className="btn primary" onClick={onNewCareer}>
          Start a new career
        </button>
        <button className="btn ghost" onClick={onUnretire}>
          Actually, one more year
        </button>
      </div>
    </div>
  )
}
