import React, { useState } from 'react'
import {
  TRAINING_OPTIONS,
  PLAYSTYLES,
  LIFESTYLES,
  STAFF_ROLES,
  EQUIP_SLOTS,
  ATTRS,
} from '../game/constants.js'
import { Q_SCHOOL_FEE, cardStatus, CARD_LABELS } from '../game/eligibility.js'
import { fmtMoney, DEBT_INTEREST } from '../game/finance.js'
import { techBaseline, SETTLE_LABEL } from '../game/equipment.js'
import { coachTrainingBonus, qualityOf, qualityEffect, qualityBand, effectiveQ, rapport, rapportLabel } from '../game/staff.js'
import { ratingTextColor } from '../game/ratings.js'
import { marketability } from '../game/sponsors.js'
import { plural } from '../game/narrative.js'
import { canFundSeason, winterWorkPay } from '../game/engine.js'
import { Card, Option, Chip, Money, Empty, StatGrid, Stat, CircuitChip } from './ui.jsx'
import ScheduleBuilder from './ScheduleBuilder.jsx'

const STEPS = [
  ['review', 'Review'],
  ['status', 'Status'],
  ['training', 'Training'],
  ['staff', 'Team'],
  ['gear', 'Equipment'],
  ['money', 'Deals & life'],
  ['schedule', 'Schedule'],
]

function capitalise(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

export default function Offseason({ state, actions }) {
  const [step, setStep] = useState('review')
  const os = state.offseason || {}
  const last = state.career.seasons[state.career.seasons.length - 1]

  return (
    <div className="col">
      <Card
        title={os.isFirst ? 'Before it all starts' : `${state.year} offseason`}
        aux={`Season ${state.year + (os.isFirst ? 0 : 1)} begins when you are ready`}
      >
        <div className="row between wrap center">
          <div className="grow">
            <h2 style={{ fontSize: 19 }}>
              {os.isFirst
                ? `${state.player.name} — age ${state.player.age}, amateur`
                : `Age ${state.player.age} → ${state.player.age + 1}`}
            </h2>
            <div className="muted small">
              {os.isFirst
                ? 'Pick a training focus and build your first schedule. Amateur events pay nothing, but they are where you learn to compete.'
                : 'Train, hire, negotiate, and choose next year’s schedule. Everything you decide here is applied when the season starts.'}
            </div>
          </div>
          <button className="btn primary" onClick={actions.startSeason}>
            Start the {state.year + (os.isFirst ? 0 : 1)} season →
          </button>
        </div>
      </Card>

      <div className="tabs">
        {STEPS.map(([id, label]) => (
          <button key={id} className={`tab ${step === id ? 'active' : ''}`} onClick={() => setStep(id)}>
            {label}
            {id === 'money' && state.sponsors.offers.length ? <span className="badge">{state.sponsors.offers.length}</span> : null}
          </button>
        ))}
      </div>

      {step === 'review' ? <Review state={state} last={last} os={os} actions={actions} /> : null}
      {step === 'status' ? <Status state={state} actions={actions} /> : null}
      {step === 'training' ? <Training state={state} actions={actions} /> : null}
      {step === 'staff' ? <StaffMarket state={state} actions={actions} /> : null}
      {step === 'gear' ? <Equipment state={state} actions={actions} /> : null}
      {step === 'money' ? <Deals state={state} actions={actions} /> : null}
      {step === 'schedule' ? (
        <ScheduleBuilder
          state={state}
          forNext
          onToggle={actions.toggleEntry}
          onAuto={actions.autoSchedule}
          onClear={actions.clearSchedule}
          onQualify={actions.attemptQualifier}
        />
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------- review

function Review({ state, last, os, actions }) {
  return (
    <div className="grid grid-main">
      <div className="col">
        {last ? (
          <Card title={`${last.year} in review`}>
            <StatGrid>
              <Stat k="Starts" v={last.starts} s={`${last.cuts} cuts made`} />
              <Stat k="Wins" v={last.wins} tone={last.wins ? 'gold' : ''} s={last.majors ? `${last.majors} major` : ''} />
              <Stat k="Top 10s" v={last.top10s} />
              <Stat k="Gross" v={fmtMoney(last.prizeGross, { compact: true })} />
              <Stat k="Endorsements" v={fmtMoney(last.endorse, { compact: true })} />
              <Stat k="Costs" v={fmtMoney(last.expenses, { compact: true })} tone="red" />
              <Stat k="Investments" v={fmtMoney(last.invest, { compact: true, sign: true })} tone={last.invest >= 0 ? 'green' : 'red'} />
              <Stat k="Bank" v={fmtMoney(last.cashEnd, { compact: true })} tone={last.cashEnd < 0 ? 'red' : ''} />
            </StatGrid>
          </Card>
        ) : (
          <Card title="No season played yet">
            <Empty>
              You are 21 years old with a set of clubs and no status anywhere. Start on the amateur and regional
              circuit and see how far the game takes you.
            </Empty>
          </Card>
        )}

        {os.solvency && os.solvency.state !== 'clear' && os.solvency.state !== 'borrowing' ? (
          <Card title={os.solvency.insolvent ? 'The money has run out' : 'The money is running out'}>
            <div style={{ fontSize: 15 }}>
              {os.solvency.insolvent ? (
                (() => {
                  const fund = canFundSeason(state)
                  return fund.mustWork ? (
                    <>
                      You owe <b className="red">{fmtMoney(os.solvency.debt)}</b> and nobody will lend you another
                      penny. There is one way to start a season anyway, and it is the one everybody down here takes:
                      the club will have you behind the counter and on the lesson tee all winter for about{' '}
                      <b>{fmtMoney(winterWorkPay(state))}</b>. It costs you the winter's practice, and they will not
                      keep offering — <b className="orange">{plural(fund.reprievesLeft, 'more time')}</b> at your age.
                    </>
                  ) : (
                    <>
                      You owe <b className="red">{fmtMoney(os.solvency.debt)}</b>, nobody will lend you another penny,
                      and a winter at the club no longer covers the gap. Unless somebody funds you, there is no season
                      to start.
                    </>
                  )
                })()
              ) : (
                <>
                  You owe <b className="red">{fmtMoney(os.solvency.debt)}</b> against a ceiling of about{' '}
                  {fmtMoney(os.solvency.limit)}. That leaves <b>{fmtMoney(os.solvency.headroom)}</b> to fund a whole
                  year on, and the debt itself costs you {fmtMoney(Math.round(os.solvency.debt * DEBT_INTEREST))} in
                  interest before you hit a shot.
                </>
              )}
            </div>
            <div className="xs muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Cheaper living, fewer staff and a shorter schedule all help. Winter work in the training tab pays the
              bills at the cost of a winter's practice.
            </div>
          </Card>
        ) : null}

        {os.backerOffer ? (
          <Card title="Somebody wants to back you">
            <div style={{ fontSize: 15 }}>
              <b className="gold">{capitalise(os.backerOffer.name)}</b> will put up{' '}
              <b>{fmtMoney(os.backerOffer.amount)}</b> now, against{' '}
              <b>{Math.round(os.backerOffer.cut * 100)}%</b> of everything you win for the next{' '}
              {plural(os.backerOffer.years, 'year')}.
            </div>
            <div className="xs muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              It clears the debt and pays for a season. It also comes off the top of every cheque, before the caddie,
              the agent and the tax — so a good year costs you a great deal more than the money is worth. This is how
              the bottom of the game is financed, and it is the only way out that is not quitting.
            </div>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn primary" onClick={actions.acceptBacker}>
                Take the money
              </button>
              <button className="btn ghost" onClick={actions.declineBacker}>
                Go it alone
              </button>
            </div>
          </Card>
        ) : null}

        {os.backerEnded ? (
          <Card title="Your backer is paid off">
            <div style={{ fontSize: 15 }}>
              {capitalise(os.backerEnded.name)} took {fmtMoney(os.backerEnded.paidBack || 0)} against the{' '}
              {fmtMoney(os.backerEnded.amount)} they put up. Every cheque is yours again.
            </div>
          </Card>
        ) : null}

        {os.lifeEvent ? (
          <Card title="Off the course">
            <div style={{ fontSize: 15 }}>{os.lifeEvent.text}</div>
          </Card>
        ) : null}

        {(os.cardNotes?.length || os.sponsorNotes?.length) ? (
          <Card title="Paperwork">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(os.cardNotes || []).map((n, i) => (
                <li key={`c${i}`} className="small">
                  {n}
                </li>
              ))}
              {(os.sponsorNotes || []).map((n, i) => (
                <li key={`s${i}`} className="small muted">
                  {n}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {os.seasonBest?.length ? (
          <Card title="Best weeks of the year">
            <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="num">Pos</th>
                  <th>Event</th>
                  <th />
                  <th className="num">Score</th>
                  <th className="num">Earned</th>
                </tr>
              </thead>
              <tbody>
                {os.seasonBest.map((r, i) => (
                  <tr key={i}>
                    <td className={`num lb-pos ${r.pos === 1 ? 'gold' : ''}`}>
                      {r.tied ? 'T' : ''}
                      {r.pos}
                    </td>
                    <td>
                      {r.isMajor ? <span className="gold">★ </span> : null}
                      {r.name}
                    </td>
                    <td>
                      <CircuitChip id={r.circuit} small />
                    </td>
                    <td className="num mono">{r.toPar > 0 ? `+${r.toPar}` : r.toPar === 0 ? 'E' : r.toPar}</td>
                    <td className="num">
                      <Money v={r.net} zeroDash />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        ) : null}
      </div>
      <div className="col">
        <Card title="Checklist">
          <ul style={{ margin: 0, paddingLeft: 18 }} className="small col gap-sm">
            <li>Pick a <b>training focus</b> — it is the biggest lever you have on development.</li>
            <li>Hire the best <b>team</b> you can actually afford. Coaches compound; caddies pay off immediately.</li>
            <li>New <b>equipment</b> comes out every year. Old gear is a real handicap.</li>
            <li>Sign or negotiate <b>endorsements</b> — guaranteed money that does not care whether you make a cut.</li>
            <li>Build a <b>schedule</b> you can survive. Circuit hopping and back-to-backs cost you fatigue.</li>
          </ul>
        </Card>

        {state.lastProgression ? (
          <Card title="Last year's development">
            <div className="col" style={{ gap: 2 }}>
              {ATTRS.map((a) => {
                const d = state.lastProgression[a.key] || 0
                return (
                  <div key={a.key} className="row between small">
                    <span className="muted">{a.label}</span>
                    <span className="mono">
                      {Math.round(state.player.ratings[a.key])}
                      <span className={d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : 'muted-2'}>
                        {' '}
                        {d > 0 ? '+' : ''}
                        {d}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : null}

        {state.career.rivals?.length ? (
          <Card title="Your rivals">
            <div className="col gap-sm">
              {state.career.rivals.map((r) => {
                const h = state.career.h2h[r.pid]
                if (!h) return null
                return (
                  <div key={r.pid} className="row between center small">
                    <span>
                      {r.flag} <b>{r.name}</b>{' '}
                      <span className="muted-2 xs">since {r.since}</span>
                    </span>
                    <span className={`mono ${h.beat > h.lost ? 'green' : h.beat < h.lost ? 'red' : 'muted'}`}>
                      {h.beat}–{h.lost}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- status

function Status({ state, actions }) {
  const p = state.player
  const amateur = p.status === 'amateur'
  const hasFullCard = ['domestic', 'intl', 'asian', 'emerging'].some((c) => cardStatus(state, c) === 'full')
  return (
    <div className="grid grid-main">
      <div className="col">
        {amateur ? (
          <Card title="Turning professional">
            <p className="small muted">
              As an amateur you can play the regional circuit and take sponsor invites, but you cannot cash a cheque.
              Turning pro means the money is real — and so are the expenses.
            </p>
            <div className="row wrap center gap-sm">
              <button
                className={`btn ${state.pendingTurnPro ? 'active' : 'primary'}`}
                onClick={actions.turnPro}
                disabled={state.pendingTurnPro}
              >
                {state.pendingTurnPro ? 'Turning pro next season ✓' : 'Turn professional'}
              </button>
              <span className="xs muted-2">
                {p.age >= 23 ? 'You will turn pro automatically at 24.' : `You are ${p.age}. Most turn pro at 21–23.`}
              </span>
            </div>
          </Card>
        ) : null}

        <Card title="Qualifying School" aux={`${fmtMoney(Q_SCHOOL_FEE)} entry`}>
          {state.qSchool ? (
            <div className={`card flat tight ${state.qSchool.tier === 'none' ? '' : ''}`}>
              <div className={state.qSchool.tier === 'none' ? 'red' : 'green'} style={{ fontSize: 15 }}>
                {state.qSchool.text}
              </div>
            </div>
          ) : (
            <>
              <p className="small muted">
                Six rounds over one week. Finish high enough and you have somewhere to play next year; finish low and
                you are back to Monday qualifiers and open-entry mini-tour events.
              </p>
              <button className="btn primary" onClick={actions.enterQSchool}>
                Enter Q-School
              </button>
              {state.finance.cash < Q_SCHOOL_FEE ? (
                <div className="xs red" style={{ marginTop: 6 }}>
                  You cannot really afford the entry fee. Everybody borrows it from somebody.
                </div>
              ) : null}
              {hasFullCard ? (
                <div className="xs muted-2" style={{ marginTop: 6 }}>
                  You already hold a full card. Q-School is only worth it if you are chasing a better one.
                </div>
              ) : null}
            </>
          )}
        </Card>

        <Card title="Playstyle" aux="risk tolerance for the coming season">
          <div className="col gap-sm">
            {PLAYSTYLES.map((s) => (
              <Option
                key={s.id}
                selected={p.playstyle === s.id}
                onClick={() => actions.setPlaystyle(s.id)}
                title={s.name}
                desc={s.blurb}
                right={`${s.variance < 1 ? '−' : '+'}${Math.abs(Math.round((s.variance - 1) * 100))}% variance · ${
                  s.edge >= 0 ? '+' : ''
                }${s.edge.toFixed(2)} scoring`}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card title="Where you can play">
        <div className="col gap-sm">
          {['domestic', 'intl', 'asian', 'emerging', 'senior'].map((cid) => {
            const st = cardStatus(state, cid)
            return (
              <div key={cid} className="row between center small">
                <span className="muted">{cid}</span>
                <Chip tone={st === 'full' ? 'green' : st === 'conditional' ? 'gold' : undefined}>
                  {CARD_LABELS[st]}
                  {st !== 'none' && state.cards[cid]?.until ? ` → ${state.cards[cid].until}` : ''}
                </Chip>
              </div>
            )
          })}
          <div className="hr" />
          <div className="row between center small">
            <span className="muted">majors</span>
            <Chip tone={p.rank && p.rank <= 60 ? 'orange' : undefined}>
              {p.rank && p.rank <= 60
                ? `Exempt — world #${p.rank}`
                : state.majorExemptUntil >= state.year
                  ? `Champion's exemption to ${state.majorExemptUntil}`
                  : 'Qualifying only'}
            </Chip>
          </div>
          <div className="xs muted-2">
            The Emerging Circuit takes open entries from anybody who pays, so you always have somewhere to tee it up.
          </div>
        </div>
      </Card>
    </div>
  )
}

// ----------------------------------------------------------------- training

function Training({ state, actions }) {
  const p = state.player
  const chosen = state.training.choice
  return (
    <div className="grid grid-main">
      <Card title="Offseason block" aux="one focus, all winter">
        <div className="col gap-sm">
          {TRAINING_OPTIONS.map((t) => {
            const attr = t.attr && t.attr !== 'all' ? ATTRS.find((a) => a.key === t.attr) : null
            const head = attr ? p.potential[t.attr] - p.ratings[t.attr] : null
            const coachBoost = t.attr && t.attr !== 'all' ? coachTrainingBonus(state.staff, t.attr) : 0
            return (
              <Option
                key={t.id}
                selected={chosen === t.id}
                onClick={() => actions.setTraining(t.id)}
                title={t.name}
                desc={t.blurb}
                right={
                  attr
                    ? `${attr.short} ${Math.round(p.ratings[t.attr])}${head > 0 ? ` (+${head} headroom)` : ' (maxed)'}${
                        coachBoost > 0.6 ? ' ★' : ''
                      }`
                    : t.id === 'rest'
                      ? '−45 fatigue'
                      : 'spread'
                }
              />
            )
          })}
        </div>
      </Card>
      <div className="col">
        <Card title="What affects development">
          <div className="col gap-sm small">
            <Row k="Age" v={`${p.age} → ${p.age + 1}`} note={ageNote(p.age)} />
            <Row
              k="Coach"
              v={
                state.staff.coach ? (
                  <>
                    {state.staff.coach.name} · quality{' '}
                    <b className={ratingTextColor(qualityOf(state.staff.coach))}>{qualityOf(state.staff.coach)}</b>
                  </>
                ) : (
                  'None'
                )
              }
              note={
                state.staff.coach
                  ? `${state.staff.coach.traitLabel} — ${qualityBand(qualityOf(state.staff.coach))}. ${qualityEffect('coach', state.staff.coach.q)}`
                  : 'Without a coach, most of your training is wasted.'
              }
            />
            <Row k="Morale" v={`${Math.round(p.morale)}%`} note={p.morale < 40 ? 'Low morale blunts the work.' : 'Engaged and putting the hours in.'} />
            <Row k="Career mileage" v={plural(p.starts, 'start')} note={p.starts > 400 ? 'The miles are starting to tell.' : 'Body still fresh enough.'} />
          </div>
        </Card>
        <Card title="Headroom">
          <div className="col" style={{ gap: 2 }}>
            {ATTRS.map((a) => {
              const gap = p.potential[a.key] - p.ratings[a.key]
              return (
                <div key={a.key} className="row between small">
                  <span className="muted">{a.label}</span>
                  <span className="mono">
                    {Math.round(p.ratings[a.key])}
                    <span className={gap > 0 ? 'green' : 'muted-2'}> /{p.potential[a.key]}</span>
                  </span>
                </div>
              )
            })}
          </div>
          <div className="xs muted-2" style={{ marginTop: 8 }}>
            Ceilings are soft — they shift a little each year while you are young, and coaching can push you past what
            you would have reached alone.
          </div>
        </Card>
      </div>
    </div>
  )
}

function ageNote(age) {
  if (age < 26) return 'Everything is still growing.'
  if (age < 31) return 'Physical peak. Technical gains still available.'
  if (age < 36) return 'Distance is starting to go. Everything else can improve.'
  if (age < 42) return 'Managing decline. Short game and head keep you relevant.'
  return 'The body decides now, not the schedule.'
}

function Row({ k, v, note }) {
  return (
    <div>
      <div className="row between">
        <span className="muted">{k}</span>
        <span className="b">{v}</span>
      </div>
      {note ? <div className="xs muted-2">{note}</div> : null}
    </div>
  )
}

// -------------------------------------------------------------------- staff

function StaffMarket({ state, actions }) {
  const [role, setRole] = useState('coach')
  const market = state.staffMarket?.[role] || []
  const current = state.staff[role]
  const roleDef = STAFF_ROLES.find((r) => r.id === role)
  return (
    <div className="col">
      <div className="pill-row">
        {STAFF_ROLES.map((r) => (
          <button key={r.id} className={`btn sm ${role === r.id ? 'active' : ''}`} onClick={() => setRole(r.id)}>
            {r.icon} {r.name}
            {state.staff[r.id] ? <span className="green"> ●</span> : null}
          </button>
        ))}
      </div>
      <div className="grid grid-main">
        <Card title={`${roleDef.name} candidates`} aux={roleDef.blurb}>
          <div className="col gap-sm">
            {market.map((c) => {
              const isCurrent = current && current.id === c.id
              const affordable = role === 'agent' || state.finance.cash > c.salary * 0.5
              const q = qualityOf(c)
              // Compared against what the person you have is actually worth
              // today, not their contract number — and a new hire lands below
              // their own rating for the first couple of seasons.
              const asHired = Math.round(effectiveQ({ ...c, yearsWithYou: 0 }) * 100)
              const diff = current ? asHired - Math.round(effectiveQ(current) * 100) : null
              return (
                <Option
                  key={c.id}
                  selected={isCurrent}
                  onClick={() => actions.hireStaff(role, c.id)}
                  disabled={isCurrent}
                  title={`${c.flag} ${c.name} — ${c.tierLabel}`}
                  desc={`${c.traitLabel}${affordable ? '' : ' · you cannot really afford this'}`}
                  right={
                    <span className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                      <span>
                        <span className={ratingTextColor(q)} style={{ fontWeight: 700 }}>
                          {q}
                        </span>
                        <span className="xs muted-2"> quality</span>
                        {diff !== null && diff !== 0 && !isCurrent ? (
                          <span className={`xs ${diff > 0 ? 'delta-up' : 'delta-down'}`} title="from day one, allowing for the settling-in period">
                            {' '}
                            {diff > 0 ? '+' : ''}
                            {diff} day one
                          </span>
                        ) : null}
                      </span>
                      <span className="xs muted-2">
                        {role === 'agent'
                          ? `${Math.round(c.cut * 100)}% cut · ${c.sponsorMult.toFixed(2)}× deals`
                          : `${fmtMoney(c.salary, { compact: true })}/yr`}
                      </span>
                    </span>
                  }
                />
              )
            })}
          </div>
          <div className="xs muted-2" style={{ marginTop: 10, lineHeight: 1.5 }}>
            <b>Quality</b> runs 0–100 and is the single number behind everything this person does for you. The tier
            label is the same thing in words: Journeyman around 20, Solid 42, Well regarded 62, Elite 80, Legendary 95.
            {current ? ' The figure beside each candidate is how they compare with the person you have.' : ''}
          </div>
          <div className="xs muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            <div className="b" style={{ marginBottom: 2 }}>
              {current ? (
                <>
                  What {current.name} is worth to you today, at an effective quality of{' '}
                  <span className={ratingTextColor(Math.round(effectiveQ(current) * 100))}>
                    {Math.round(effectiveQ(current) * 100)}
                  </span>{' '}
                  <span className="muted-2">
                    ({qualityOf(current)} on paper{rapport(current) >= 0 ? ' + ' : ' − '}
                    {Math.abs(Math.round(rapport(current) * 100))} for {rapportLabel(current).toLowerCase()})
                  </span>
                </>
              ) : (
                `What a well-regarded ${roleDef.name.toLowerCase()} would be worth, at quality 62`
              )}
            </div>
            {qualityEffect(role, current ? effectiveQ(current) : 0.62)}
            <div style={{ marginTop: 6 }}>
              Nobody is worth their rating on day one. A new hire plays ten points below it while you learn each
              other and reaches twelve above it after six seasons together, so an upgrade on paper has to be a real
              upgrade to be worth making.
            </div>
          </div>
        </Card>
        <div className="col">
          <Card title="Currently employed">
            {STAFF_ROLES.map((r) => {
              const s = state.staff[r.id]
              return (
                <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="row between center">
                    <div className="small b">
                      {r.icon} {r.name}
                    </div>
                    {s ? (
                      <button className="btn xs danger" onClick={() => actions.fireStaff(r.id)}>
                        Release
                      </button>
                    ) : (
                      <span className="xs muted-2">vacant</span>
                    )}
                  </div>
                  {s ? (
                    <>
                      <div className="xs muted">
                        {s.flag} {s.name} · quality{' '}
                        <b className={ratingTextColor(Math.round(effectiveQ(s) * 100))}>
                          {Math.round(effectiveQ(s) * 100)}
                        </b>
                        {Math.round(effectiveQ(s) * 100) !== qualityOf(s) ? (
                          <span className="muted-2"> (of {qualityOf(s)})</span>
                        ) : null}{' '}
                        · {s.tierLabel} · {s.traitLabel} ·{' '}
                        {r.id === 'agent' ? `${Math.round(s.cut * 100)}% cut` : `${fmtMoney(s.salary, { compact: true })}/yr`}
                      </div>
                      <div className="xs muted-2">{rapportLabel(s)}</div>
                    </>
                  ) : (
                    <div className="xs muted-2">{r.blurb}</div>
                  )}
                </div>
              )
            })}
            <div className="xs muted-2" style={{ marginTop: 8 }}>
              Releasing someone mid-contract costs a quarter of their annual salary.
            </div>
          </Card>
          <Card title="Bank">
            <div className="row between">
              <span className="muted">Available</span>
              <span className={`mono b ${state.finance.cash < 0 ? 'red' : ''}`}>{fmtMoney(state.finance.cash)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- equipment

function Equipment({ state, actions }) {
  const baseline = techBaseline(state.yearsElapsed + 1)
  const gearDeal = state.sponsors.deals.find((d) => d.providesGear && d.yearsLeft > 0)
  return (
    <div className="col">
      {gearDeal ? (
        <Card title="Equipment contract">
          <div className="small">
            <b className="gold">{gearDeal.brand}</b> supplies your bag under contract. You will be playing their gear
            next season whether you like it or not — quality {Math.round(gearDeal.gearQuality * 100)}/100.
          </div>
        </Card>
      ) : null}
      <div className="grid grid-2">
        {EQUIP_SLOTS.map((slot) => {
          const cur = state.bag[slot.id]
          const list = state.equipCatalog?.[slot.id] || []
          return (
            <Card key={slot.id} title={slot.name} aux={cur ? `${cur.brand} ${cur.model} · tech ${cur.tech.toFixed(1)}` : 'empty'}>
              <div className="col gap-sm">
                {list.map((item) => {
                  const gain = cur ? item.tech - cur.tech : item.tech - baseline
                  return (
                    <Option
                      key={item.id}
                      selected={cur && cur.id === item.id}
                      onClick={() => actions.buyEquipment(slot.id, item.id)}
                      disabled={!!gearDeal || state.finance.cash < item.price || (cur && cur.id === item.id)}
                      title={`${item.brand} ${item.model}`}
                      desc={`tech ${item.tech.toFixed(1)} vs ${baseline.toFixed(1)} standard${
                        cur && cur.id !== item.id ? ` · ${SETTLE_LABEL[slot.id]}` : ''
                      }`}
                      right={`${fmtMoney(item.price)} · ${gain > 0 ? '+' : ''}${gain.toFixed(1)}`}
                    />
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>
      <Card title="Why it matters">
        <div className="small muted">
          Equipment technology creeps forward about 1.5 points a year across the industry. Gear at the industry
          standard is worth nothing; gear well above it is worth a fraction of a shot; a three-year-old bag is a
          genuine handicap. An equipment sponsorship pays you and fills the bag, but you lose the choice.
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Changing a club costs you before it pays you. A new putter or set of irons takes six or seven
          competitive starts to trust, and you play worse with it until you do — so chasing every new release is a
          way to spend a career bedding clubs in. A driver you can more or less tee up and hit. Signing an
          equipment deal replaces the whole bag at once, which is why the year after one is a common place for a
          good player to wobble.
        </div>
      </Card>
    </div>
  )
}

// -------------------------------------------------------------------- deals

function Deals({ state, actions }) {
  const m = marketability(state.player, state.career)
  return (
    <div className="grid grid-main">
      <div className="col">
        <Card title="Offers on the table" aux={`marketability ${(m * 100).toFixed(0)}/100`}>
          {state.sponsors.offers.length === 0 ? (
            <Empty>
              No offers. Sponsors follow the world ranking — get inside the top 100 and the phone starts ringing.
            </Empty>
          ) : (
            <div className="col gap-sm">
              {state.sponsors.offers.map((o) => (
                <div key={o.id} className="card flat tight">
                  <div className="row between wrap center">
                    <div className="grow">
                      <div className="b">
                        {o.brand} <span className="muted-2 xs">· {o.categoryName}</span>
                        {o.negotiated ? <Chip tone="gold"> renegotiated</Chip> : null}
                      </div>
                      <div className="xs muted">
                        {o.years} years · win bonus {fmtMoney(o.winBonus, { compact: true })} · major bonus{' '}
                        {fmtMoney(o.majorBonus, { compact: true })} · needs world top {o.minRank}
                        {o.providesGear ? ' · supplies your equipment' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono gold b" style={{ fontSize: 16 }}>
                        {fmtMoney(o.annual, { compact: true })}/yr
                      </div>
                      {o.signingBonus ? (
                        <div className="xs muted-2">+{fmtMoney(o.signingBonus, { compact: true })} signing</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="row gap-sm" style={{ marginTop: 8 }}>
                    <button className="btn sm primary" onClick={() => actions.acceptOffer(o.id)}>
                      Sign
                    </button>
                    <button className="btn sm" onClick={() => actions.negotiateOffer(o.id)} disabled={o.negotiated}>
                      Push for more
                    </button>
                    <button className="btn sm ghost" onClick={() => actions.declineOffer(o.id)}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="xs muted-2" style={{ marginTop: 8 }}>
            Pushing for more usually works when you have leverage. When you do not, the offer can disappear entirely.
          </div>
        </Card>

        <Card title="Current contracts">
          {state.sponsors.deals.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Category</th>
                  <th className="num">Per year</th>
                  <th className="num">Left</th>
                  <th className="num">Clause</th>
                </tr>
              </thead>
              <tbody>
                {state.sponsors.deals.map((d) => (
                  <tr key={d.id}>
                    <td className="b">{d.brand}</td>
                    <td className="muted">{d.categoryName}</td>
                    <td className="num"><Money v={d.annual} /></td>
                    <td className="num">{d.yearsLeft}y</td>
                    <td className={`num xs ${d.strikes ? 'red' : 'muted-2'}`}>
                      top {d.minRank}
                      {d.strikes ? ` · ${d.strikes} strike` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="How you live">
        <div className="col gap-sm">
          {LIFESTYLES.map((l) => (
            <Option
              key={l.id}
              selected={state.finance.lifestyle === l.id}
              onClick={() => actions.setLifestyle(l.id)}
              title={l.name}
              desc={l.blurb}
              right={`${fmtMoney(l.cost, { compact: true })}/yr`}
            />
          ))}
        </div>
        <div className="xs muted-2" style={{ marginTop: 8 }}>
          Living well costs a fortune but keeps morale up and burnout down. Living cheap banks money and slowly grinds
          you down.
        </div>
      </Card>
    </div>
  )
}
