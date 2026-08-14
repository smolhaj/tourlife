import React, { useState } from 'react'
import { ATTRS, PLAYSTYLES, CIRCUITS } from '../game/constants.js'
import { AILMENTS } from '../game/injuries.js'
import { fmtMoney } from '../game/finance.js'
import { Modal, Chip, Empty } from './ui.jsx'

/**
 * Debug / save-scum panel. Everything here writes straight into game state
 * and is deliberately unbalanced.
 */
export default function Godmode({ state, actions, onClose, history }) {
  const [tab, setTab] = useState('player')
  const p = state.player

  return (
    <Modal title="Godmode" onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Done</button>}>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {[
          ['player', 'Player'],
          ['money', 'Money & status'],
          ['events', 'Events'],
          ['time', 'Time travel'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'player' ? (
        <div className="col">
          <div className="col" style={{ gap: 6 }}>
            {ATTRS.map((a) => (
              <div key={a.key} className="god-row">
                <span className="lbl">{a.label}</span>
                <input
                  type="range"
                  min="5"
                  max="99"
                  value={Math.round(p.ratings[a.key])}
                  onChange={(e) => actions.god.setRating(a.key, Number(e.target.value))}
                />
                <span className="out">{Math.round(p.ratings[a.key])}</span>
              </div>
            ))}
          </div>
          <div className="hr" />
          <div className="col" style={{ gap: 6 }}>
            <div className="god-row">
              <span className="lbl">Age</span>
              <input type="range" min="18" max="70" value={p.age} onChange={(e) => actions.god.set('age', Number(e.target.value))} />
              <span className="out">{p.age}</span>
            </div>
            <div className="god-row">
              <span className="lbl">Form</span>
              <input
                type="range"
                min="-5.5"
                max="5.5"
                step="0.1"
                value={p.form}
                onChange={(e) => actions.god.set('form', Number(e.target.value))}
              />
              <span className="out">{p.form.toFixed(1)}</span>
            </div>
            <div className="god-row">
              <span className="lbl">Fatigue</span>
              <input type="range" min="0" max="100" value={p.fatigue} onChange={(e) => actions.god.set('fatigue', Number(e.target.value))} />
              <span className="out">{Math.round(p.fatigue)}</span>
            </div>
            <div className="god-row">
              <span className="lbl">Morale</span>
              <input type="range" min="0" max="100" value={p.morale} onChange={(e) => actions.god.set('morale', Number(e.target.value))} />
              <span className="out">{Math.round(p.morale)}</span>
            </div>
            <div className="god-row">
              <span className="lbl">Ranking points</span>
              <input
                type="range"
                min="0"
                max="800"
                value={Math.round(p.rankPoints)}
                onChange={(e) => actions.god.set('rankPoints', Number(e.target.value))}
              />
              <span className="out">{Math.round(p.rankPoints)}</span>
            </div>
          </div>
          <div className="hr" />
          <div className="section-title">Playstyle</div>
          <div className="pill-row">
            {PLAYSTYLES.map((s) => (
              <button key={s.id} className={`btn xs ${p.playstyle === s.id ? 'active' : ''}`} onClick={() => actions.setPlaystyle(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
          <div className="hr" />
          <div className="section-title">Health</div>
          <div className="pill-row">
            <button className="btn xs" onClick={() => actions.god.heal()} disabled={!p.injury}>
              Heal instantly
            </button>
            {AILMENTS.map((a) => (
              <button key={a.id} className="btn xs" onClick={() => actions.god.inflict(a.id)}>
                {a.name}
              </button>
            ))}
          </div>
          <div className="hr" />
          <div className="pill-row">
            <button className="btn xs" onClick={() => actions.god.maxPotential()}>
              Raise all potentials to 99
            </button>
            <button className="btn xs" onClick={() => actions.god.matchPotential()}>
              Snap ratings to potential
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'money' ? (
        <div className="col">
          <div className="row wrap gap-sm center">
            <Chip tone={state.finance.cash < 0 ? 'red' : 'green'}>Bank {fmtMoney(state.finance.cash)}</Chip>
          </div>
          <div className="pill-row">
            {[100000, 1000000, 10000000, 100000000].map((v) => (
              <button key={v} className="btn xs" onClick={() => actions.god.addCash(v)}>
                +{fmtMoney(v, { compact: true })}
              </button>
            ))}
            <button className="btn xs danger" onClick={() => actions.god.addCash(-state.finance.cash)}>
              Zero it out
            </button>
          </div>
          <div className="hr" />
          <div className="section-title">Tour cards</div>
          <table className="tbl">
            <tbody>
              {['domestic', 'intl', 'asian', 'emerging', 'senior'].map((cid) => (
                <tr key={cid}>
                  <td>{CIRCUITS[cid].name}</td>
                  <td>
                    <div className="pill-row">
                      {['none', 'conditional', 'full'].map((st) => (
                        <button
                          key={st}
                          className={`btn xs ${state.cards[cid]?.status === st ? 'active' : ''}`}
                          onClick={() => actions.god.setCard(cid, st)}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hr" />
          <div className="pill-row">
            <button className="btn xs" onClick={() => actions.god.set('status', p.status === 'pro' ? 'amateur' : 'pro')}>
              Toggle status ({p.status})
            </button>
            <button className="btn xs" onClick={() => actions.god.majorExempt()}>
              Grant 5-year major exemption
            </button>
            <button className="btn xs" onClick={() => actions.god.fillOffers()}>
              Regenerate sponsor offers
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'events' ? (
        <div className="col">
          {state.phase !== 'season' ? (
            <Empty>Only available during the season.</Empty>
          ) : (
            <>
              <div className="section-title">Force-play any remaining event (skips the weeks in between)</div>
              <div className="scroll-y max-h-320">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="num">Wk</th>
                      <th>Event</th>
                      <th>Circuit</th>
                      <th className="num">Purse</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.season
                      .filter((e) => e.week >= state.week)
                      .sort((a, b) => a.week - b.week)
                      .slice(0, 80)
                      .map((e) => (
                        <tr key={e.id}>
                          <td className="num mono">{e.week}</td>
                          <td>
                            {e.isMajor ? <span className="gold">★ </span> : null}
                            {e.name}
                          </td>
                          <td className="muted xs">{CIRCUITS[e.circuit].short}</td>
                          <td className="num mono xs">{e.purse ? fmtMoney(e.purse, { compact: true }) : '—'}</td>
                          <td>
                            <button className="btn xs" onClick={() => actions.god.playEvent(e.id)}>
                              Play it
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="hr" />
              <div className="pill-row">
                <button className="btn xs" onClick={() => actions.god.forceWin()}>
                  Win the next event outright
                </button>
                <button className="btn xs" onClick={() => actions.god.spawnMajor()}>
                  Spawn a bonus major next week
                </button>
              </div>
              <div className="xs muted-2">
                “Win the next event” quietly hands you a large temporary rating bonus for one tournament. It is not
                guaranteed, but it may as well be.
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'time' ? (
        <div className="col">
          <div className="section-title">Undo history ({history.labels().length} snapshots)</div>
          {history.labels().length === 0 ? (
            <Empty>Nothing to rewind to yet.</Empty>
          ) : (
            <div className="col gap-sm">
              {history
                .labels()
                .slice()
                .reverse()
                .map((l, i) => (
                  <div key={i} className="row between center small card flat tight">
                    <span className="muted">{l}</span>
                    {i === 0 ? (
                      <button className="btn xs" onClick={actions.undo}>
                        Rewind here
                      </button>
                    ) : (
                      <span className="xs muted-2">undo {i + 1} steps back</span>
                    )}
                  </div>
                ))}
            </div>
          )}
          <div className="hr" />
          <div className="section-title">Danger zone</div>
          <div className="pill-row">
            <button className="btn xs danger" onClick={actions.god.retire} disabled={p.retired}>
              Force retirement
            </button>
            <button className="btn xs" onClick={actions.god.unretire} disabled={!p.retired}>
              Un-retire
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
