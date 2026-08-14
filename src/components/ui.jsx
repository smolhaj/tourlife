import React from 'react'
import { ratingColor } from '../game/ratings.js'
import { CIRCUITS } from '../game/constants.js'
import { fmtMoney } from '../game/finance.js'

export function Card({ title, aux, children, className = '', bodyClass = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || aux) && (
        <div className="card-head">
          {title ? <h3>{title}</h3> : <span />}
          {aux ? <span className="aux">{aux}</span> : null}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function Stat({ k, v, s, tone }) {
  return (
    <div className="statcell">
      <div className="k">{k}</div>
      <div className={`v ${tone || ''}`}>{v}</div>
      {s ? <div className="s">{s}</div> : null}
    </div>
  )
}

export function StatGrid({ children }) {
  return <div className="statgrid">{children}</div>
}

export function Chip({ tone, children, title }) {
  return (
    <span className={`chip ${tone || ''}`} title={title}>
      {children}
    </span>
  )
}

export function CircuitChip({ id, small }) {
  const c = CIRCUITS[id]
  if (!c) return null
  const tone =
    id === 'major' ? 'orange' : id === 'domestic' ? 'gold' : id === 'intl' ? 'green' : id === 'senior' ? 'purple' : id === 'asian' ? 'orange' : 'blue'
  return (
    <span className={`chip ${tone}`} title={c.name}>
      {small ? c.short : c.name}
    </span>
  )
}

export function RatingRow({ label, value, potential, avg, delta }) {
  const pct = Math.max(2, Math.min(100, value))
  return (
    <div className="rating-row">
      <div className="lbl">{label}</div>
      <div className="meter" title={potential ? `Potential ${Math.round(potential)}` : undefined}>
        <div className={`fill ${ratingColor(value)}`} style={{ width: `${pct}%` }} />
        {potential > value ? <div className="pot" style={{ left: `${Math.min(99, potential)}%` }} /> : null}
        {avg ? <div className="avg" style={{ left: `${Math.min(99, avg)}%` }} /> : null}
      </div>
      <div className="val">
        {Math.round(value)}
        {delta ? (
          <span className={delta > 0 ? 'delta-up xs' : 'delta-down xs'}>
            {' '}
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function Modal({ title, children, onClose, footer, wide, narrow }) {
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''}`}>
        <div className="modal-head">
          <h2 style={{ fontSize: 17 }}>{title}</h2>
          {onClose ? (
            <button className="x" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function toPar(v) {
  if (v === null || v === undefined) return '—'
  if (v === 0) return 'E'
  return v > 0 ? `+${v}` : `${v}`
}

export function ToPar({ v }) {
  if (v === null || v === undefined) return <span className="muted-2">—</span>
  return <span className={`lb-score ${v < 0 ? 'score-under' : 'score-over'}`}>{toPar(v)}</span>
}

export function posLabel(row) {
  if (!row || !row.madeCut || !row.pos) return 'MC'
  return `${row.tied ? 'T' : ''}${row.pos}`
}

export function Money({ v, compact = true, sign = false, zeroDash = false }) {
  if (zeroDash && !v) return <span className="muted-2">—</span>
  return <span className="mono">{fmtMoney(v, { compact, sign })}</span>
}

/** Tiny inline sparkline for season-over-season trends. */
export function Sparkline({ values, height = 46, color = 'var(--gold)', zeroLine = false }) {
  const vals = values.filter((v) => typeof v === 'number' && isFinite(v))
  if (vals.length < 2) return <div className="empty xs">Not enough seasons yet</div>
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 100
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w
    const y = height - 4 - ((v - min) / span) * (height - 10)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const zeroY = zeroLine && min < 0 && max > 0 ? height - 4 - ((0 - min) / span) * (height - 10) : null
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {zeroY !== null ? (
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ) : null}
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ProgressBar({ value, max, tone = 'var(--gold)' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  return (
    <div className="meter" style={{ height: 7 }}>
      <div className="fill" style={{ width: `${pct}%`, background: tone }} />
    </div>
  )
}

export function Option({ selected, onClick, title, desc, right, disabled }) {
  return (
    <button className={`option ${selected ? 'sel' : ''}`} onClick={onClick} disabled={disabled}>
      <div className="row between center">
        <div className="grow">
          <div className="t">{title}</div>
          {desc ? <div className="d">{desc}</div> : null}
        </div>
        {right ? <div className="m nowrap">{right}</div> : null}
      </div>
    </button>
  )
}
