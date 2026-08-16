import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as E from './game/engine.js'
import { god } from './game/engine.js'
import { PLAYING_WEEKS } from './game/schedule.js'
import { fmtMoney } from './game/finance.js'
import { careerPhase, shareText, withArticle } from './game/narrative.js'
import { CIRCUITS } from './game/constants.js'
import {
  cloneState,
  saveGame,
  loadGame,
  hasSave,
  clearSave,
  downloadSave,
  exportSave,
  importSave,
  claimSave,
  History,
} from './game/save.js'

import NewCareer from './components/NewCareer.jsx'
import Dashboard from './components/Dashboard.jsx'
import PlayerModal from './components/PlayerModal.jsx'
import PlayerView from './components/PlayerView.jsx'
import CareerView from './components/CareerView.jsx'
import MoneyView from './components/MoneyView.jsx'
import WorldView from './components/WorldView.jsx'
import Offseason from './components/Offseason.jsx'
import ScheduleBuilder from './components/ScheduleBuilder.jsx'
import ResultModal from './components/ResultModal.jsx'
import Godmode from './components/Godmode.jsx'
import { RetireDialog, RetiredScreen } from './components/Retirement.jsx'
import { Modal, Chip, Card } from './components/ui.jsx'

const TABS = [
  ['home', 'Home'],
  ['schedule', 'Schedule'],
  ['player', 'Player'],
  ['career', 'Career'],
  ['money', 'Money'],
  ['world', 'World'],
]

export default function App() {
  const [state, setState] = useState(null)
  const [tab, setTab] = useState('home')
  const [busy, setBusy] = useState(null)
  const [toasts, setToasts] = useState([])
  const [resultId, setResultId] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [showGod, setShowGod] = useState(false)
  const [showRetire, setShowRetire] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showJump, setShowJump] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const historyRef = useRef(new History(20))
  const toastId = useRef(0)

  // ------------------------------------------------------------- persistence

  const saveWarned = useRef(false)
  useEffect(() => {
    if (!state) return
    const t = setTimeout(() => {
      const res = saveGame(state)
      // Private browsing and full quotas both fail here; losing a career
      // silently is far worse than an ugly warning.
      if (!res.ok && !saveWarned.current) {
        saveWarned.current = true
        setToasts((cur) => [
          ...cur,
          {
            id: ++toastId.current,
            kind: 'bad',
            text: res.conflict
              ? 'This career is open in another tab and has moved on there. Nothing here is being saved — reload to catch up.'
              : 'Could not save to this browser. Export your career from Share to keep it.',
          },
        ])
      } else if (res.ok) {
        saveWarned.current = false
      }
    }, 400)
    return () => clearTimeout(t)
  }, [state])

  const toast = useCallback((text, kind = '') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  /**
   * Every mutation goes through here: clone, snapshot for undo, mutate, commit.
   * Long simulations yield to the browser first so the overlay actually paints.
   */
  const run = useCallback(
    (label, fn, { snapshot = true, heavy = false } = {}) => {
      if (!state) return
      const apply = () => {
        const draft = cloneState(state)
        let out
        try {
          out = fn(draft)
        } catch (err) {
          console.error(err)
          toast(`Something went wrong: ${err.message}`, 'bad')
          setBusy(null)
          return
        }
        // Snapshot only once the mutation has succeeded: an action that threw
        // leaves the old state live, and recording it would have added an undo
        // step that rewinds to exactly where you already are.
        if (snapshot) historyRef.current.push(state, label)
        E.refreshDerived(draft)
        setState(draft)
        setBusy(null)
        if (out && out.toast) toast(out.toast, out.toastKind)
        return out
      }
      if (heavy) {
        setBusy(label)
        setTimeout(apply, 30)
      } else {
        apply()
      }
    },
    [state, toast],
  )

  // --------------------------------------------------------------- lifecycle

  function startNew(opts) {
    historyRef.current.clear()
    // Starting over deliberately takes the save away from any other tab.
    claimSave()
    saveWarned.current = false
    const s = E.newGame(opts)
    setState(s)
    setTab('home')
    toast(`${s.player.name} turns up at the first tee.`, 'good')
  }

  function continueSave() {
    const s = loadGame()
    if (!s) {
      clearSave()
      return toast('That save could not be read, so it has been cleared. Start a new career.', 'bad')
    }
    try {
      historyRef.current.clear()
      setState(E.refreshDerived(s))
      setTab('home')
    } catch (err) {
      console.error(err)
      clearSave()
      toast('That save is damaged and has been cleared. Start a new career.', 'bad')
    }
  }

  function doImport(text) {
    const s = importSave(text)
    historyRef.current.clear()
    saveWarned.current = false
    setState(E.refreshDerived(s))
    setTab('home')
    toast('Career imported.', 'good')
  }

  // ------------------------------------------------------------ sim commands

  const afterSim = useCallback(
    (draft, res) => {
      // Surface the most interesting thing that just happened.
      const last = res?.events?.[res.events.length - 1]
      if (draft.phase === 'offseason') return { toast: `${draft.year} season complete.`, toastKind: 'good' }
      if (last) {
        if (last.pos === 1) return { toast: `You won ${withArticle(last.name)}!`, toastKind: 'good' }
        if (!last.madeCut) return { toast: `Missed the cut at ${withArticle(last.shortName)}.`, toastKind: 'bad' }
        return { toast: `${last.tied ? 'T' : ''}${last.pos} at ${withArticle(last.shortName)}.` }
      }
      return null
    },
    [],
  )

  /**
   * Multi-year jumps are the one operation slow enough to feel broken on a
   * phone, so they run one season per frame with a progress read-out instead
   * of blocking for ten seconds behind a spinner.
   */
  const runYears = useCallback(
    (targetYear, label) => {
      if (!state) return
      const draft = cloneState(state)
      historyRef.current.push(state, label)
      const total = Math.max(1, targetYear - state.year)
      setBusy({ text: label, done: 0, total, year: state.year })

      let guard = 0
      const step = () => {
        try {
          if (draft.year >= targetYear || draft.player.retired || guard >= 60) {
            E.refreshDerived(draft)
            setState(draft)
            setBusy(null)
            if (draft.player.retired) toast('Your career ended during the jump.', 'bad')
            else toast(`Simmed through to ${draft.year}.`, 'good')
            return
          }
          if (draft.phase === 'offseason') {
            E.autoOffseason(draft)
            E.startSeason(draft)
          }
          E.simToOffseason(draft)
          guard += 1
          setBusy({ text: label, done: guard, total, year: draft.year })
          setTimeout(step, 0)
        } catch (err) {
          console.error(err)
          setBusy(null)
          toast(`Simulation stopped: ${err.message}`, 'bad')
        }
      }
      setTimeout(step, 0)
    },
    [state, toast],
  )

  const sim = useCallback(
    (label, fn, heavy = false) => {
      run(
        label,
        (draft) => {
          const res = fn(draft)
          const out = afterSim(draft, res)
          // Auto-open the leaderboard for a single-event sim.
          if (res?.events?.length === 1) {
            const id = res.events[0].eventId
            setTimeout(() => setResultId(id), 0)
          }
          return out
        },
        { heavy },
      )
    },
    [run, afterSim],
  )

  // -------------------------------------------------------------- actions

  const actions = useMemo(() => {
    if (!state) return null
    return {
      setTraining: (id) => run('training choice', (d) => E.setTraining(d, id), { snapshot: false }),
      setPlaystyle: (id) => run('playstyle', (d) => E.setPlaystyle(d, id), { snapshot: false }),
      setLifestyle: (id) => run('lifestyle', (d) => E.setLifestyle(d, id), { snapshot: false }),
      hireStaff: (role, id) => run('hire staff', (d) => E.hireStaff(d, role, id)),
      fireStaff: (role) => run('release staff', (d) => E.fireStaff(d, role)),
      buyEquipment: (slot, id) => run('buy equipment', (d) => E.buyEquipment(d, slot, id)),
      prepareFor: (id) => run('prepare', (d) => E.prepareFor(d, id)),
      acceptOffer: (id) => run('sign sponsor', (d) => E.acceptOffer(d, id)),
      declineOffer: (id) => run('decline sponsor', (d) => E.declineOffer(d, id), { snapshot: false }),
      negotiateOffer: (id) =>
        run('negotiate', (d) => {
          const res = E.negotiateOffer(d, id)
          if (res.outcome === 'improved') return { toast: 'They came up. Deal improved.', toastKind: 'good' }
          if (res.outcome === 'withdrawn') return { toast: 'They walked away from the table.', toastKind: 'bad' }
          return { toast: 'They will not move. Offer stands.' }
        }),
      enterQSchool: () =>
        run('Q-School', (d) => {
          const res = E.enterQSchool(d)
          return { toast: res.text, toastKind: res.tier === 'none' ? 'bad' : 'good' }
        }),
      turnPro: () => run('turn pro', (d) => E.turnPro(d)),
      toggleEntry: (id) => run('schedule', (d) => E.toggleEntry(d, id), { snapshot: false }),
      clearSchedule: () => run('clear schedule', (d) => E.clearSchedule(d), { snapshot: false }),
      autoSchedule: (n) => run('auto schedule', (d) => E.autoFillSchedule(d, n), { snapshot: false }),
      attemptQualifier: (id) =>
        run('qualifier', (d) => {
          const res = E.attemptQualifier(d, id)
          return {
            toast: res.ok ? 'You qualified.' : `Missed out (${Math.round((res.chance || 0) * 100)}% chance).`,
            toastKind: res.ok ? 'good' : 'bad',
          }
        }),
      startSeason: () =>
        run('start season', (d) => {
          // Entry fees and flights are due before any prize money arrives, so a
          // player with no credit left cannot start a season at all.
          const fund = E.canFundSeason(d)
          if (!fund.ok) {
            E.foldCareer(d)
            setTab('home')
            return { toast: 'The money ran out. Your career is over.', toastKind: 'bad' }
          }
          E.startSeason(d)
          setTab('home')
          return { toast: `${d.year} season under way.`, toastKind: 'good' }
        }),
      acceptBacker: () =>
        run('take a backer', (d) => {
          const offer = d.offseason?.backerOffer
          E.acceptBacker(d)
          return offer
            ? { toast: `${offer.name} put up ${fmtMoney(offer.amount, { compact: true })}.`, toastKind: 'good' }
            : null
        }),
      declineBacker: () => run('decline backer', (d) => E.declineBacker(d), { snapshot: false }),
      undo: () => {
        const entry = historyRef.current.undo(state)
        if (!entry) return toast('Nothing to undo.', 'bad')
        setState(E.refreshDerived(entry.snapshot))
        toast(`Rewound: ${entry.label}`)
      },
      god: {
        setRating: (a, v) => run('godmode', (d) => god.setRating(d, a, v), { snapshot: false }),
        set: (k, v) => run('godmode', (d) => god.set(d, k, v), { snapshot: false }),
        heal: () => run('godmode heal', (d) => god.heal(d)),
        inflict: (id) => run('godmode injury', (d) => god.inflict(d, id)),
        maxPotential: () => run('godmode potential', (d) => god.maxPotential(d)),
        matchPotential: () => run('godmode ratings', (d) => god.matchPotential(d)),
        addCash: (v) => run('godmode cash', (d) => god.addCash(d, v)),
        setCard: (c, s) => run('godmode card', (d) => god.setCard(d, c, s)),
        majorExempt: () => run('godmode exempt', (d) => god.majorExempt(d)),
        fillOffers: () => run('godmode offers', (d) => god.fillOffers(d)),
        forceWin: () => run('godmode boost', (d) => god.forceWin(d)),
        spawnMajor: () => run('godmode major', (d) => god.spawnMajor(d)),
        playEvent: (id) =>
          sim('Playing event', (d) => {
            const res = E.playEventNow(d, id)
            return res
          }, true),
        retire: () => run('retire', (d) => E.retire(d, 'were forced out by an unseen hand')),
        unretire: () => run('unretire', (d) => E.unretire(d)),
      },
    }
  }, [state, run, sim, toast])

  /**
   * Memoised so that ticking the progress overlay during a multi-year jump
   * does not re-render every table sitting behind it.
   */
  const shellBody = useMemo(() => {
    if (!state || !actions) return null
    if (state.phase === 'retired') {
      return (
        <div style={{ paddingTop: 20 }}>
          <RetiredScreen
            state={state}
            onNewCareer={() => {
              clearSave()
              setState(null)
            }}
            onExport={() => downloadSave(state)}
            onUnretire={() => run('un-retire', (d) => E.unretire(d))}
          />
        </div>
      )
    }
    if (state.phase === 'offseason') {
      return (
        <div style={{ paddingTop: 14 }}>
          <Offseason state={state} actions={actions} />
        </div>
      )
    }
    return (
      <>
        <nav className="tabs" style={{ marginTop: 4 }}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div style={{ paddingTop: 14 }}>
          {tab === 'home' ? (
            <Dashboard state={state} onOpenResult={setResultId} onGoTab={setTab} onPrepare={actions.prepareFor} />
          ) : null}
          {tab === 'schedule' ? (
            <ScheduleBuilder
              state={state}
              forNext={false}
              onToggle={actions.toggleEntry}
              onAuto={actions.autoSchedule}
              onClear={actions.clearSchedule}
              onQualify={actions.attemptQualifier}
            />
          ) : null}
          {tab === 'player' ? <PlayerView state={state} /> : null}
          {tab === 'career' ? <CareerView state={state} /> : null}
          {tab === 'money' ? <MoneyView state={state} onSetLifestyle={actions.setLifestyle} /> : null}
          {tab === 'world' ? <WorldView state={state} onOpenPlayer={setPlayerId} /> : null}
        </div>
      </>
    )
  }, [state, actions, tab, run])

  // ------------------------------------------------------------------ render

  if (!state) {
    return (
      <div className="app">
        <NewCareer onStart={startNew} hasSave={hasSave()} onContinue={continueSave} onImport={doImport} />
      </div>
    )
  }

  const p = state.player
  const inSeason = state.phase === 'season'
  const retired = state.phase === 'retired'

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            Tour Life
            <small>golf career sim</small>
          </div>
          <div className="ident">
            <div className="who">
              <div className="name">
                {p.flag} {p.name}
                {p.nickname ? <span className="muted-2 small"> “{p.nickname}”</span> : null}
              </div>
              <div className="sub">
                {retired ? 'Retired' : careerPhase(p).label} · age {p.age} ·{' '}
                {inSeason ? `${state.year} week ${Math.min(state.week, PLAYING_WEEKS)}` : `${state.year} offseason`}
              </div>
            </div>
          </div>
          <div className="hstats">
            <div className="hstat">
              <div className="k">Overall</div>
              <div className="v gold">{state.ovr.toFixed(0)}</div>
            </div>
            <div className="hstat">
              <div className="k">World</div>
              <div className="v">#{p.rank ?? '—'}</div>
            </div>
            <div className="hstat">
              <div className="k">Majors</div>
              <div className="v">{state.career.majors}</div>
            </div>
            <div className="hstat">
              <div className="k">Wins</div>
              <div className="v">{state.career.wins}</div>
            </div>
            <div className="hstat">
              <div className="k">Bank</div>
              <div className={`v ${state.finance.cash < 0 ? 'red' : ''}`}>
                {fmtMoney(state.finance.cash, { compact: true })}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="shell">{shellBody}</div>

      {!retired ? (
        <div className="simbar">
          <div className="simbar-inner">
            <div className="sim-row">
              {inSeason ? (
                <>
                  <button className="btn primary" onClick={() => sim('Playing tournament', (d) => E.simNextEvent(d), true)}>
                    Sim next event
                  </button>
                  <div className="sim-scroll">
                    <button className="btn" onClick={() => sim('Simming a week', (d) => E.simWeek(d))}>
                      Sim week
                    </button>
                    <button className="btn" onClick={() => sim('Simming to the next major', (d) => E.simToNextMajor(d), true)}>
                      To next major
                    </button>
                    <button className="btn" onClick={() => sim('Simming the season', (d) => E.simToOffseason(d), true)}>
                      To offseason
                    </button>
                    <button className="btn" onClick={() => setShowJump(true)}>
                      Jump ahead…
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn primary" onClick={actions.startSeason}>
                  Start the {state.year + (state.offseason?.isFirst ? 0 : 1)} season
                </button>
              )}
              <button
                className={`btn sm ghost sim-more ${showMore ? 'active' : ''}`}
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                aria-label="More actions"
              >
                ⋯
              </button>
            </div>
            {/* Picking something from the overflow menu closes it — leaving it
                open covers content on a phone and makes the next tap a toggle. */}
            <div className={`sim-aux ${showMore ? 'open' : ''}`} onClick={() => setShowMore(false)}>
              <NextUp state={state} />
              <div className="spacer" />
              <button className="btn sm ghost" onClick={actions.undo} disabled={!historyRef.current.canUndo()}>
                ↶ Undo
              </button>
              <button className="btn sm ghost" onClick={() => setShowRetire(true)}>
                Retire…
              </button>
              <button className="btn sm ghost" onClick={() => setShowShare(true)}>
                Share
              </button>
              <button className="btn sm ghost" onClick={() => setShowGod(true)}>
                ⚙ God
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="busy">
          <div className="busy-panel">
            <div className="spinner" />
            <div className="muted">{typeof busy === 'string' ? `${busy}…` : `${busy.text}…`}</div>
            {typeof busy === 'object' && busy.total > 1 ? (
              <div className="busy-progress">
                <div className="meter" style={{ height: 8 }}>
                  <div
                    className="fill"
                    style={{ width: `${(busy.done / busy.total) * 100}%`, background: 'var(--gold)' }}
                  />
                </div>
                <div className="row between xs muted-2" style={{ marginTop: 6 }}>
                  <span>{busy.year} season</span>
                  <span className="mono">
                    {busy.done}/{busy.total}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>

      {resultId ? (
        <ResultModal state={state} eventId={resultId} onClose={() => setResultId(null)} onOpenPlayer={setPlayerId} />
      ) : null}
      {playerId ? <PlayerModal state={state} pid={playerId} onClose={() => setPlayerId(null)} /> : null}
      {showGod ? (
        <Godmode state={state} actions={actions} history={historyRef.current} onClose={() => setShowGod(false)} />
      ) : null}
      {showRetire ? (
        <RetireDialog
          state={state}
          onClose={() => setShowRetire(false)}
          onRetire={() => {
            setShowRetire(false)
            run('retire', (d) => E.retire(d, 'decided it was time'))
          }}
        />
      ) : null}
      {showShare ? <ShareModal state={state} onClose={() => setShowShare(false)} /> : null}
      {showJump ? (
        <JumpModal
          state={state}
          onClose={() => setShowJump(false)}
          onJump={(targetAge) => {
            setShowJump(false)
            runYears(state.year + (targetAge - state.player.age), `Simming to age ${targetAge}`)
          }}
          onJumpYear={(y) => {
            setShowJump(false)
            runYears(y, `Simming to ${y}`)
          }}
        />
      ) : null}
    </div>
  )
}

function NextUp({ state }) {
  const next = E.nextEnteredEvent(state)
  if (state.phase !== 'season') return <span className="muted small">Offseason</span>
  if (!next) return <span className="muted-2 small nowrap">Nothing scheduled</span>
  return (
    <span className="small nowrap muted">
      Next: <b className="gold">{next.shortName || next.name}</b>{' '}
      <span className="muted-2">
        (w{next.week}, {CIRCUITS[next.circuit].short})
      </span>
    </span>
  )
}

function ShareModal({ state, onClose }) {
  const text = shareText(state)
  const [copied, setCopied] = useState(false)
  return (
    <Modal
      title="Share your career"
      onClose={onClose}
      narrow
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              navigator.clipboard?.writeText(text)
              setCopied(true)
            }}
          >
            {copied ? 'Copied ✓' : 'Copy summary'}
          </button>
          <button className="btn" onClick={() => downloadSave(state)}>
            Download save file
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              navigator.clipboard?.writeText(exportSave(state))
            }}
          >
            Copy save JSON
          </button>
        </>
      }
    >
      <div className="share-box">{text}</div>
      <div className="small muted" style={{ marginTop: 10 }}>
        The save file is plain JSON — anyone can drop it into the import box on the title screen and pick your career
        up where you left it.
      </div>
    </Modal>
  )
}

function JumpModal({ state, onClose, onJump, onJumpYear }) {
  const [age, setAge] = useState(Math.min(70, state.player.age + 5))
  return (
    <Modal
      title="Jump ahead"
      onClose={onClose}
      narrow
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onJump(age)} disabled={age <= state.player.age}>
            Sim to age {age}
          </button>
        </>
      }
    >
      <p className="small muted">
        Long jumps auto-play your seasons: sensible training, affordable staff, the best offers on the table, and a
        schedule built from whatever you are eligible for. Good for burning through the years when nothing much is at
        stake.
      </p>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Target age — currently {state.player.age}</label>
        <input
          type="range"
          min={state.player.age + 1}
          max={70}
          value={age}
          onChange={(e) => setAge(Number(e.target.value))}
        />
        <div className="row between xs muted-2">
          <span>{state.player.age + 1}</span>
          <span className="mono b gold" style={{ fontSize: 15 }}>
            {age}
          </span>
          <span>70</span>
        </div>
      </div>
      <div className="hr" />
      <Card title="Quick jumps">
        <div className="pill-row">
          <button className="btn sm" onClick={() => onJumpYear(state.year + 1)}>
            Next season
          </button>
          <button className="btn sm" onClick={() => onJump(state.player.age + 3)}>
            +3 years
          </button>
          <button className="btn sm" onClick={() => onJump(35)} disabled={state.player.age >= 35}>
            To age 35 (peak)
          </button>
          <button className="btn sm" onClick={() => onJump(50)} disabled={state.player.age >= 50}>
            To 50 (senior tour)
          </button>
        </div>
      </Card>
      <div className="row wrap gap-sm" style={{ marginTop: 10 }}>
        <Chip>{state.career.wins} wins so far</Chip>
        <Chip tone="gold">{state.career.majors} majors</Chip>
      </div>
    </Modal>
  )
}
