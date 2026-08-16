import React, { useState } from 'react'
import { REGIONS } from '../game/names.js'
import { PLAYSTYLES } from '../game/constants.js'
import { BACKINGS, fmtMoney } from '../game/finance.js'
import { Card, Option } from './ui.jsx'

export const PROSPECT_TIERS = [
  {
    id: 'longshot',
    label: 'Mini-tour long shot',
    talent: 0.4,
    blurb: 'No pedigree, no money, a decent swing and a car full of clubs. Most people like you never make it.',
  },
  {
    id: 'college',
    label: 'Solid college player',
    talent: 0.55,
    blurb: 'All-conference, a couple of amateur wins. Good enough to turn pro. Not obviously good enough to stay.',
  },
  {
    id: 'touted',
    label: 'Highly touted amateur',
    talent: 0.68,
    blurb: 'Ranked amateur, invitations to tour events, agents already circling.',
  },
  {
    id: 'generational',
    label: 'Generational prospect',
    talent: 0.84,
    blurb: 'People have been saying your name since you were fourteen. The expectation is the hard part.',
  },
]

const DIFFICULTIES = [
  { id: 'easy', label: 'Forgiving', blurb: 'A little more raw ability than you deserve.' },
  { id: 'normal', label: 'Standard', blurb: 'The tour as it is.' },
  { id: 'hard', label: 'Grinder', blurb: 'Less talent, same fields. Every card is earned.' },
]

export default function NewCareer({ onStart, hasSave, onContinue, onImport }) {
  const [name, setName] = useState('')
  const [regionId, setRegionId] = useState('usa')
  const [age, setAge] = useState(21)
  const [tier, setTier] = useState('college')
  const [playstyle, setPlaystyle] = useState('balanced')
  const [backing, setBacking] = useState('club')
  const [difficulty, setDifficulty] = useState('normal')
  const [seedText, setSeedText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [error, setError] = useState(null)

  const prospect = PROSPECT_TIERS.find((t) => t.id === tier)

  function start() {
    const seed = seedText.trim()
      ? Array.from(seedText.trim()).reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261)
      : Math.floor(Math.random() * 2 ** 31)
    onStart({
      name: name.trim() || 'Alex Morgan',
      regionId,
      age: Number(age),
      talent: prospect.talent,
      playstyle,
      backing,
      difficulty,
      seed,
    })
  }

  function doImport() {
    try {
      onImport(importText)
      setError(null)
    } catch (err) {
      setError(String(err.message || err))
    }
  }

  return (
    <div className="intro-wrap">
      <h1 className="intro-title">Tour Life</h1>
      <p className="intro-sub">
        Thirty-five years of professional golf, one decision at a time. Grind the mini-tours, earn a card, chase
        the four weeks a year that actually matter, and work out when to stop.
      </p>

      {(hasSave || true) && (
        <div className="row wrap" style={{ margin: '18px 0 24px' }}>
          {hasSave ? (
            <button className="btn primary" onClick={onContinue}>
              Continue saved career
            </button>
          ) : null}
          <button className="btn" onClick={() => setImporting((v) => !v)}>
            Import career file
          </button>
        </div>
      )}

      {importing ? (
        <Card title="Import" className="col" bodyClass="col">
          <textarea
            placeholder="Paste the contents of a .tourlife.json export here"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {error ? <div className="red small">{error}</div> : null}
          <div className="row">
            <button className="btn primary" onClick={doImport} disabled={!importText.trim()}>
              Load career
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Choose file…
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const reader = new FileReader()
                  reader.onload = () => setImportText(String(reader.result || ''))
                  reader.readAsText(f)
                }}
              />
            </label>
          </div>
        </Card>
      ) : null}

      <div className="col gap-lg" style={{ marginTop: 20 }}>
        <Card title="Who are you">
          <div className="grid grid-3">
            <div className="field">
              <label htmlFor="nc-name">Name</label>
              <input
                id="nc-name"
                type="text"
                value={name}
                placeholder="Alex Morgan"
                onChange={(e) => setName(e.target.value)}
                maxLength={28}
              />
            </div>
            <div className="field">
              <label htmlFor="nc-region">From</label>
              <select id="nc-region" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.flag} {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nc-age">Starting age</label>
              <select id="nc-age" value={age} onChange={(e) => setAge(Number(e.target.value))}>
                {[20, 21, 22].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card title="What kind of prospect">
          <div className="col gap-sm">
            {PROSPECT_TIERS.map((t) => (
              <Option
                key={t.id}
                selected={tier === t.id}
                onClick={() => setTier(t.id)}
                title={t.label}
                desc={t.blurb}
              />
            ))}
          </div>
        </Card>

        <Card title="What is behind you" aux="A season costs more than any of these. That is the point.">
          <div className="col gap-sm">
            {BACKINGS.map((b) => (
              <Option
                key={b.id}
                selected={backing === b.id}
                onClick={() => setBacking(b.id)}
                title={b.label}
                desc={b.blurb}
                right={b.stake ? `${fmtMoney(b.cash)} · −${Math.round(b.stake.cut * 100)}%` : fmtMoney(b.cash)}
              />
            ))}
          </div>
        </Card>

        <Card title="How do you play" aux="You can change this any offseason">
          <div className="col gap-sm">
            {PLAYSTYLES.map((s) => (
              <Option
                key={s.id}
                selected={playstyle === s.id}
                onClick={() => setPlaystyle(s.id)}
                title={s.name}
                desc={s.blurb}
                right={`${s.variance < 1 ? '−' : '+'}${Math.abs(Math.round((s.variance - 1) * 100))}% variance`}
              />
            ))}
          </div>
        </Card>

        <Card title="Difficulty">
          <div className="grid grid-3">
            {DIFFICULTIES.map((d) => (
              <Option
                key={d.id}
                selected={difficulty === d.id}
                onClick={() => setDifficulty(d.id)}
                title={d.label}
                desc={d.blurb}
              />
            ))}
          </div>
          <div className="hr" />
          <div className="field">
            <label htmlFor="nc-seed">Seed (optional — same seed, same world)</label>
            <input
              id="nc-seed"
              type="text"
              value={seedText}
              placeholder="leave blank for random"
              onChange={(e) => setSeedText(e.target.value)}
            />
          </div>
        </Card>

        <button className="btn primary" style={{ padding: '14px', fontSize: 15 }} onClick={start}>
          Start your career
        </button>
      </div>
    </div>
  )
}
