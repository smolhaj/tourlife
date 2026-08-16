import React from 'react'
import { ATTRS, PLAYSTYLES, COURSE_TYPES } from '../game/constants.js'
import { tourAverages } from '../game/engine.js'
import { overallLabel, overall, CURVES, courseFit } from '../game/ratings.js'
import { careerPhase, majorNarrative, legacyScore, legacyLabel } from '../game/narrative.js'
import { equipmentBonus, bagTech, techBaseline, startsToSettle } from '../game/equipment.js'
import { describeStaff, rapportLabel } from '../game/staff.js'
import { eraLabel } from '../game/era.js'
import { STAFF_ROLES, EQUIP_SLOTS } from '../game/constants.js'
import { fmtMoney } from '../game/finance.js'
import { Card, RatingRow, Chip, Stat, StatGrid, Empty, Sparkline } from './ui.jsx'

export default function PlayerView({ state }) {
  const p = state.player
  const avg = tourAverages(state)
  const gear = equipmentBonus(state.bag, state.yearsElapsed, state.career.starts)
  const style = PLAYSTYLES.find((s) => s.id === p.playstyle)
  const legacy = legacyScore(state.career, p)
  const seasons = state.career.seasons

  return (
    <div className="grid grid-main">
      <div className="col">
        <Card title="Ratings" aux="dashes mark your ceiling · gold line is the tour average">
          <div className="col" style={{ gap: 2 }}>
            {ATTRS.map((a) => (
              <RatingRow
                key={a.key}
                label={a.label}
                value={state.effRatings[a.key]}
                potential={p.potential[a.key]}
                avg={avg ? avg[a.key] : null}
                delta={state.lastProgression ? state.lastProgression[a.key] : 0}
              />
            ))}
          </div>
          <div className="hr" />
          <div className="row between center wrap gap-sm">
            <div>
              <span className="mono gold" style={{ fontSize: 26, fontWeight: 750 }}>
                {state.ovr.toFixed(0)}
              </span>
              <span className="muted small"> overall — {overallLabel(state.ovr)}</span>
            </div>
            <div className="pill-row">
              <Chip>Base {state.baseOvr.toFixed(0)}</Chip>
              <Chip tone="green">Peak {p.peakOvr.toFixed(0)}</Chip>
              <Chip>Ceiling {overall(p.potential).toFixed(0)}</Chip>
              {avg ? <Chip tone="blue">Tour avg {avg.ovr}</Chip> : null}
            </div>
          </div>
          {state.lastProgression ? (
            <div className="xs muted-2" style={{ marginTop: 8 }}>
              Deltas shown are from this offseason's development.
            </div>
          ) : null}
        </Card>

        <Card title="Where you are in the arc">
          <div className="grid grid-2">
            <div>
              <div className="section-title">Age curve</div>
              <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Attribute</th>
                    <th className="num">Growth until</th>
                    <th className="num">Decline from</th>
                    <th className="num">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ATTRS.map((a) => {
                    const c = CURVES[a.key]
                    const status = p.age > c.declineStart ? 'declining' : p.age <= c.peak ? 'growing' : 'plateau'
                    return (
                      <tr key={a.key}>
                        <td>{a.label}</td>
                        <td className="num muted-2">{c.peak}</td>
                        <td className="num muted-2">{c.declineStart}</td>
                        <td className="num">
                          <span className={status === 'declining' ? 'red' : status === 'growing' ? 'green' : 'muted'}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
            <div>
              <div className="section-title">Overall by season</div>
              {seasons.length > 1 ? (
                <>
                  <Sparkline values={seasons.map((s) => s.ovr)} color="var(--green)" />
                  <div className="row between xs muted-2">
                    <span>{seasons[0].year}</span>
                    <span>{seasons[seasons.length - 1].year}</span>
                  </div>
                </>
              ) : (
                <Empty>Play a couple of seasons.</Empty>
              )}
              <div className="hr" />
              <div className="section-title">The game around you</div>
              <div className="xs muted" style={{ marginBottom: 8 }}>
                {eraLabel(state.yearsElapsed)}
                {state.yearsElapsed >= 4
                  ? '. Length is worth more than it was, and finding the fairway a little less.'
                  : '.'}
              </div>
              <div className="section-title">Course fit</div>
              <div className="pill-row">
                {Object.entries(COURSE_TYPES)
                  .map(([id, ct]) => ({ id, name: ct.name, diff: courseFit(state.effRatings, id) }))
                  .sort((a, b) => b.diff - a.diff)
                  .map((c) => (
                    <Chip key={c.id} tone={c.diff > 0.8 ? 'green' : c.diff < -0.8 ? 'red' : undefined}>
                      {c.name} {c.diff > 0 ? '+' : ''}
                      {c.diff.toFixed(1)}
                    </Chip>
                  ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="col">
        <Card title="Identity">
          <StatGrid>
            <Stat k="Age" v={p.age} s={careerPhase(p).label} />
            <Stat k="World rank" v={p.rank ? `#${p.rank}` : '—'} s={state.career.bestRank ? `best #${state.career.bestRank}` : ''} />
            <Stat k="Status" v={p.status === 'amateur' ? 'Amateur' : 'Professional'} s={p.status === 'pro' ? `${p.proYears} pro years` : ''} />
            <Stat k="Legacy" v={legacy.toFixed(0)} s={legacyLabel(legacy).label} tone={legacy >= 100 ? 'gold' : ''} />
          </StatGrid>
          <div className="pill-row" style={{ marginTop: 10 }}>
            <Chip>{p.flag} {p.region.toUpperCase()}</Chip>
            <Chip tone="blue">{style?.name}</Chip>
            <Chip tone={state.career.majors ? 'gold' : undefined}>{majorNarrative(state.career.majors).label}</Chip>
            {p.nickname ? <Chip tone="purple">“{p.nickname}”</Chip> : null}
          </div>
        </Card>

        <Card title="Support team">
          {STAFF_ROLES.map((role) => (
            <div key={role.id} className="row between center" style={{ padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div>
                <div className="small b">
                  {role.icon} {role.name}
                </div>
                <div className="xs muted-2">{describeStaff(state.staff[role.id])}</div>
                {state.staff[role.id] ? (
                  <div className="xs muted-2">{rapportLabel(state.staff[role.id])}</div>
                ) : null}
              </div>
              <div className="mono xs muted">
                {state.staff[role.id]
                  ? role.id === 'agent'
                    ? `${Math.round(state.staff[role.id].cut * 100)}% cut`
                    : fmtMoney(state.staff[role.id].salary, { compact: true })
                  : '—'}
              </div>
            </div>
          ))}
        </Card>

        <Card title="In the bag" aux={`avg tech ${bagTech(state.bag).toFixed(1)} vs ${techBaseline(state.yearsElapsed).toFixed(1)} standard`}>
          <table className="tbl">
            <tbody>
              {EQUIP_SLOTS.map((slot) => {
                const item = state.bag[slot.id]
                return (
                  <tr key={slot.id}>
                    <td className="muted-2 xs">{slot.name}</td>
                    <td className="small">
                      {item ? `${item.brand} ${item.model}` : <span className="red">empty</span>}
                      {item?.sponsored ? <span className="gold xs"> (sponsor)</span> : null}
                    </td>
                    <td className="num xs mono">{item ? item.tech.toFixed(1) : '—'}</td>
                    <td className="num xs">
                      {startsToSettle(item, slot.id, state.career.starts) > 0 ? (
                        <span className="orange">
                          bedding in · {startsToSettle(item, slot.id, state.career.starts)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="hr" />
          <div className="pill-row">
            {Object.entries(gear)
              .filter(([, v]) => Math.abs(v) >= 0.05)
              .map(([k, v]) => (
                <Chip key={k} tone={v > 0 ? 'green' : 'red'}>
                  {ATTRS.find((a) => a.key === k)?.short || k} {v > 0 ? '+' : ''}
                  {v.toFixed(1)}
                </Chip>
              ))}
            {Object.values(gear).every((v) => Math.abs(v) < 0.05) ? <span className="xs muted-2">Standard-issue gear.</span> : null}
          </div>
        </Card>
      </div>
    </div>
  )
}
