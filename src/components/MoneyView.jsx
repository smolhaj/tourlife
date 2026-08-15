import React from 'react'
import { LIFESTYLES, TAX_RATE, STAFF_ROLES } from '../game/constants.js'
import { fmtMoney, coastStatus, netRate, annualExpenses, splitPrize, SOLVENCY_LABEL, DEBT_INTEREST } from '../game/finance.js'
import { currentBurn, playerSolvency, backerCutOf } from '../game/engine.js'
import { annualStaffCost, agentCut } from '../game/staff.js'
import { sponsorIncome, marketability } from '../game/sponsors.js'
import { plural } from '../game/narrative.js'
import { Card, Stat, StatGrid, Chip, Money, Empty, ProgressBar, Sparkline } from './ui.jsx'

export default function MoneyView({ state, onSetLifestyle }) {
  const burn = currentBurn(state)
  const coast = coastStatus(state.finance.cash, burn)
  const expenses = annualExpenses({
    lifestyleId: state.finance.lifestyle,
    staffCost: annualStaffCost(state.staff),
    startsByCircuit: state.seasonTotals.startsByCircuit,
    yearsElapsed: state.yearsElapsed,
    dependents: state.finance.dependents,
    amateur: state.player.status === 'amateur',
  })
  const endorse = sponsorIncome(state.sponsors.deals)
  const m = marketability(state.player, state.career)
  const rate = netRate({ hasCaddie: !!state.staff.caddie, agentCut: agentCut(state.staff), pos: 15 })
  const seasons = state.career.seasons

  const backer = state.finance.backer && state.finance.backer.yearsLeft > 0 ? state.finance.backer : null
  const solv = playerSolvency(state)
  const sample = splitPrize(1_000_000, {
    pos: 1,
    madeCut: true,
    hasCaddie: !!state.staff.caddie,
    agentCut: agentCut(state.staff),
    backerCut: backerCutOf(state),
  })

  return (
    <div className="grid grid-main">
      <div className="col">
        <Card title="Where the money goes" aux="on a $1,000,000 winner's cheque">
          <table className="tbl">
            <tbody>
              <tr>
                <td>Gross prize</td>
                <td className="num b">{fmtMoney(sample.gross)}</td>
                <td className="num muted-2">100%</td>
              </tr>
              <tr>
                <td className="muted">Caddie {state.staff.caddie ? `(${state.staff.caddie.name})` : '(none on the bag)'}</td>
                <td className="num red">−{fmtMoney(sample.caddie)}</td>
                <td className="num muted-2">{((sample.caddie / sample.gross) * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td className="muted">Agent {state.staff.agent ? `(${state.staff.agent.name})` : '(unrepresented)'}</td>
                <td className="num red">−{fmtMoney(sample.agent)}</td>
                <td className="num muted-2">{((sample.agent / sample.gross) * 100).toFixed(0)}%</td>
              </tr>
              {backer ? (
                <tr>
                  <td className="muted">Backer ({backer.name})</td>
                  <td className="num red">−{fmtMoney(sample.backer)}</td>
                  <td className="num muted-2">{Math.round(backer.cut * 100)}%</td>
                </tr>
              ) : null}
              <tr>
                <td className="muted">Tax</td>
                <td className="num red">−{fmtMoney(sample.tax)}</td>
                <td className="num muted-2">{(TAX_RATE * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td className="b">You keep</td>
                <td className="num b green">{fmtMoney(sample.net)}</td>
                <td className="num green">{((sample.net / sample.gross) * 100).toFixed(0)}%</td>
              </tr>
            </tbody>
          </table>
          <div className="xs muted-2" style={{ marginTop: 6 }}>
            A top-15 finish nets about {(rate * 100).toFixed(0)}% — the caddie's cut shrinks when you do not win.
          </div>
        </Card>

        <Card title="Annual running costs" aux={`${fmtMoney(burn, { compact: true })} a year`}>
          <table className="tbl">
            <tbody>
              <tr>
                <td>Living ({LIFESTYLES.find((l) => l.id === state.finance.lifestyle)?.name}{state.finance.dependents ? `, ${state.finance.dependents} dependent${state.finance.dependents > 1 ? 's' : ''}` : ''})</td>
                <td className="num"><Money v={expenses.living} compact={false} /></td>
              </tr>
              <tr>
                <td>Travel &amp; entries ({state.seasonTotals.starts} starts)</td>
                <td className="num"><Money v={expenses.travel} compact={false} /></td>
              </tr>
              <tr>
                <td>Staff salaries</td>
                <td className="num"><Money v={expenses.staff} compact={false} /></td>
              </tr>
              <tr>
                <td className="b">Total</td>
                <td className="num b red"><Money v={expenses.total} compact={false} /></td>
              </tr>
            </tbody>
          </table>
          <div className="hr" />
          <div className="section-title">Lifestyle</div>
          <div className="pill-row">
            {LIFESTYLES.map((l) => (
              <button
                key={l.id}
                className={`btn sm ${state.finance.lifestyle === l.id ? 'active' : ''}`}
                onClick={() => onSetLifestyle(l.id)}
                title={`${l.blurb} — ${fmtMoney(l.cost, { compact: true })}/yr`}
              >
                {l.name} · {fmtMoney(l.cost, { compact: true })}
              </button>
            ))}
          </div>
          <div className="xs muted-2" style={{ marginTop: 6 }}>
            {LIFESTYLES.find((l) => l.id === state.finance.lifestyle)?.blurb} A better life costs money but keeps you
            fresher and happier on the road.
          </div>
        </Card>

        <Card title="Endorsements" aux={`marketability ${(m * 100).toFixed(0)}/100`}>
          {state.sponsors.deals.length === 0 ? (
            <Empty>Nobody is paying you to wear their logo. Win something.</Empty>
          ) : (
            <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Category</th>
                  <th className="num">Per year</th>
                  <th className="num">Years left</th>
                  <th className="num">Win bonus</th>
                  <th className="num">Clause</th>
                </tr>
              </thead>
              <tbody>
                {state.sponsors.deals.map((d) => (
                  <tr key={d.id}>
                    <td className="b">{d.brand}</td>
                    <td className="muted">{d.categoryName}</td>
                    <td className="num"><Money v={d.annual} /></td>
                    <td className="num">{d.yearsLeft}</td>
                    <td className="num muted"><Money v={d.winBonus} zeroDash /></td>
                    <td className="num xs">
                      {state.player.rank && state.player.rank > d.minRank * 1.25 ? (
                        <span className="red">at risk (top {d.minRank})</span>
                      ) : (
                        <span className="muted-2">top {d.minRank}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="muted small">Contracted income</span>
            <span className="mono b gold">{fmtMoney(endorse)}/yr gross</span>
          </div>
        </Card>
      </div>

      <div className="col">
        <Card title="Balance sheet">
          <StatGrid>
            <Stat
              k="Bank"
              v={fmtMoney(state.finance.cash, { compact: true })}
              tone={state.finance.cash < 0 ? 'red' : 'green'}
              s={state.finance.cash < 0 ? 'in debt' : `${(state.finance.cash / Math.max(1, burn)).toFixed(1)} years of runway`}
            />
            <Stat k="Career gross" v={fmtMoney(state.career.careerGross, { compact: true })} s="prize money" />
            <Stat k="After fees" v={fmtMoney(state.career.careerEarnings, { compact: true })} />
            <Stat k="Endorsements" v={fmtMoney(state.career.endorsementTotal, { compact: true })} s="net, career" />
            <Stat
              k="Appearance money"
              v={fmtMoney(state.career.appearanceTotal || 0, { compact: true })}
              s={state.finance.seasonAppearance ? `${fmtMoney(state.finance.seasonAppearance, { compact: true })} this season` : 'paid to turn up abroad'}
            />
          </StatGrid>
        </Card>

        <Card
          title="Credit"
          aux={SOLVENCY_LABEL[solv.state]}
        >
          {solv.debt > 0 ? (
            <>
              <ProgressBar
                value={Math.min(1, solv.used)}
                max={1}
                tone={
                  solv.state === 'insolvent' || solv.state === 'critical'
                    ? 'var(--red)'
                    : solv.state === 'stretched'
                      ? 'var(--orange)'
                      : 'var(--gold)'
                }
              />
              <div className="row between small" style={{ marginTop: 6 }}>
                <span className="muted">Owed</span>
                <span className="mono red">{fmtMoney(solv.debt)}</span>
              </div>
              <div className="row between small">
                <span className="muted">Still borrowable</span>
                <span className={`mono ${solv.headroom <= 0 ? 'red' : ''}`}>{fmtMoney(solv.headroom)}</span>
              </div>
              <div className="row between small">
                <span className="muted">Interest this year</span>
                <span className="mono red">−{fmtMoney(Math.round(solv.debt * DEBT_INTEREST))}</span>
              </div>
              <div className="xs muted-2" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {solv.state === 'insolvent'
                  ? 'There is no more credit. Entry fees and flights are due before any prize money arrives, so unless somebody funds you, this is where the career ends.'
                  : solv.state === 'critical'
                    ? 'Almost nothing left to borrow. Cut the schedule, cut the staff, or find a backer.'
                    : `Lenders will go to about ${fmtMoney(solv.limit)} for someone with your earnings and profile.`}
              </div>
            </>
          ) : (
            <div className="small muted">
              Nothing owed. If it ever goes the other way, you could borrow up to about{' '}
              <b>{fmtMoney(solv.limit)}</b> against what you have earned before anybody stops lending.
            </div>
          )}
        </Card>

        {backer ? (
          <Card title="Your backer" aux={`${plural(backer.yearsLeft, 'year')} left`}>
            <div className="small">
              <b className="gold">{backer.name}</b> put up {fmtMoney(backer.amount)} in {backer.signedYear}. They take{' '}
              <b>{Math.round(backer.cut * 100)}%</b> of your winnings until {backer.signedYear + backer.years}.
            </div>
            <div className="row between small" style={{ marginTop: 6 }}>
              <span className="muted">Paid to them so far</span>
              <span className="mono">{fmtMoney(backer.paidBack || 0)}</span>
            </div>
          </Card>
        ) : null}

        <Card title="Financial independence">
          <div className="col gap-sm">
            {coast.targets.map((t) => {
              const done = state.finance.cash >= t.amount
              return (
                <div key={t.id}>
                  <div className="row between small">
                    <span className={done ? 'green b' : 'muted'}>
                      {done ? '✓ ' : ''}
                      {t.label}
                    </span>
                    <span className="mono xs muted-2">{fmtMoney(t.amount, { compact: true })}</span>
                  </div>
                  <ProgressBar
                    value={Math.max(0, state.finance.cash)}
                    max={t.amount}
                    tone={done ? 'var(--green)' : 'var(--gold)'}
                  />
                  <div className="xs muted-2">{t.blurb}</div>
                </div>
              )
            })}
          </div>
          <div className="xs muted-2" style={{ marginTop: 8 }}>
            Targets assume a 4% withdrawal against your current {fmtMoney(burn, { compact: true })} annual burn. Cash
            you do not spend compounds between seasons.
          </div>
        </Card>

        {seasons.length > 1 ? (
          <Card title="Income history">
            <Sparkline values={seasons.map((s) => s.prizeGross + s.endorse)} color="var(--gold)" />
            <div className="xs muted-2">Prize money plus endorsements, by season</div>
            <div className="hr" />
            <Sparkline values={seasons.map((s) => s.cashEnd)} color="var(--green)" zeroLine />
            <div className="xs muted-2">Net worth</div>
          </Card>
        ) : null}

        <Card title="Payroll">
          {STAFF_ROLES.map((r) => {
            const s = state.staff[r.id]
            return (
              <div key={r.id} className="row between small" style={{ padding: '3px 0' }}>
                <span className="muted">
                  {r.icon} {r.name}
                </span>
                <span className="mono">
                  {s ? (r.id === 'agent' ? `${Math.round(s.cut * 100)}% of prizes` : fmtMoney(s.salary, { compact: true })) : '—'}
                </span>
              </div>
            )
          })}
          <div className="hr" />
          <div className="row between b">
            <span>Annual salaries</span>
            <span className="mono">{fmtMoney(annualStaffCost(state.staff), { compact: true })}</span>
          </div>
        </Card>

        <Card title="Sponsor risk">
          <div className="pill-row">
            <Chip tone={m > 0.6 ? 'green' : m > 0.3 ? 'gold' : 'red'}>
              Marketability {(m * 100).toFixed(0)}
            </Chip>
            <Chip>Rank #{state.player.rank ?? '—'}</Chip>
            <Chip>{state.career.majors} majors</Chip>
          </div>
          <div className="xs muted-2" style={{ marginTop: 6 }}>
            Sponsors renegotiate between seasons. Fall well outside a deal's ranking clause two years running and they
            will walk.
          </div>
        </Card>
      </div>
    </div>
  )
}
