import React from 'react'
import { ATTRS, SENIOR_AGE } from '../game/constants.js'
import { overall, ratingTextColor } from '../game/ratings.js'
import { fmtMoney } from '../game/finance.js'
import { plural } from '../game/narrative.js'
import { STAT_DEFS, formatStat, statLine } from '../game/stats.js'
import { regionById } from '../game/names.js'
import { Modal, Chip, Stat, StatGrid, Empty, RatingRow } from './ui.jsx'

/**
 * Somebody else's career.
 *
 * The world tracked wins, majors, top tens, starts, earnings and a peak rating
 * for every one of eight hundred players and surfaced none of it — a rival was
 * a name in a ranking table and a head-to-head record against a string. The
 * rivalry system, the leaderboards and the all-time board all pointed at people
 * you could not look at.
 */
export default function PlayerModal({ state, pid, onClose }) {
  const p = state.world.players.find((x) => x.pid === pid)
  if (!p) {
    return (
      <Modal title="Player" onClose={onClose}>
        <Empty>No record of that player.</Empty>
      </Modal>
    )
  }

  const h2h = state.career.h2h?.[pid]
  const stats = statLine(p.ratings, state.yearsElapsed)
  const ovr = overall(p.ratings)
  const region = regionById(p.region)
  const seniorNow = p.age >= SENIOR_AGE
  const decided = h2h ? h2h.beat + h2h.lost : 0

  return (
    <Modal
      title={`${p.flag} ${p.name}`}
      onClose={onClose}
      wide
      footer={
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="row wrap between center" style={{ marginBottom: 12 }}>
        <div className="pill-row">
          <Chip>{region ? region.name : p.region.toUpperCase()}</Chip>
          <Chip>Age {p.age}</Chip>
          {p.retired ? (
            <Chip tone="red">Retired {p.retiredYear}</Chip>
          ) : (
            <Chip tone={p.rank && p.rank <= 50 ? 'green' : undefined}>
              {p.rank ? `World #${p.rank}` : 'Unranked'}
            </Chip>
          )}
          {seniorNow && !p.retired ? <Chip tone="purple">Senior Circuit</Chip> : null}
          {p.nickname ? <Chip tone="purple">“{p.nickname}”</Chip> : null}
          {p.injury ? <Chip tone="red">{p.injury.name}</Chip> : null}
          {!p.retired && !p.injury && p.form >= 1.2 ? <Chip tone="green">In form</Chip> : null}
          {!p.retired && !p.injury && p.form <= -1.2 ? <Chip tone="red">Out of sorts</Chip> : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono gold" style={{ fontSize: 26, fontWeight: 750, lineHeight: 1 }}>
            {ovr.toFixed(0)}
          </div>
          <div className="xs muted-2">overall · peak {p.peakOvr.toFixed(0)}</div>
        </div>
      </div>

      <StatGrid>
        <Stat k="Wins" v={p.wins} tone={p.wins ? 'gold' : ''} s={p.seniorWins ? `+${p.seniorWins} senior` : ''} />
        <Stat k="Majors" v={p.majors} tone={p.majors ? 'gold' : ''} />
        <Stat k="Top 10s" v={p.top10s} s={`${p.cutsMade}/${p.starts} cuts`} />
        <Stat k="Career earnings" v={fmtMoney(p.careerEarnings, { compact: true })} />
      </StatGrid>

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div>
          <div className="section-title">This season</div>
          {p.season && p.season.starts ? (
            <div className="pill-row">
              <Chip>{plural(p.season.starts, 'start')}</Chip>
              <Chip tone={p.season.wins ? 'gold' : undefined}>{p.season.wins} wins</Chip>
              <Chip>{p.season.top10s} top 10s</Chip>
              <Chip>{Math.round(p.season.points)} race points</Chip>
              <Chip>{fmtMoney(p.season.earnings, { compact: true })}</Chip>
            </div>
          ) : (
            <Empty>Nothing yet this year.</Empty>
          )}

          <div className="section-title" style={{ marginTop: 12 }}>
            Against you
          </div>
          {h2h && h2h.meetings ? (
            <>
              <div className="row wrap gap-sm">
                <Chip tone={h2h.beat > h2h.lost ? 'green' : h2h.beat < h2h.lost ? 'red' : undefined}>
                  You lead {h2h.beat}–{h2h.lost}
                </Chip>
                <Chip>{plural(h2h.meetings, 'shared leaderboard')}</Chip>
              </div>
              <div className="xs muted-2" style={{ marginTop: 6 }}>
                {decided
                  ? `You have finished ahead of them ${Math.round((100 * h2h.beat) / decided)}% of the time you have both made the weekend.`
                  : 'You have never both made a weekend.'}
              </div>
            </>
          ) : (
            <Empty>You have never shared a leaderboard.</Empty>
          )}
        </div>

        <div>
          <div className="section-title">Their game</div>
          <div className="col" style={{ gap: 2 }}>
            {ATTRS.map((a) => (
              <RatingRow key={a.key} label={a.label} value={p.ratings[a.key]} potential={p.potential?.[a.key]} />
            ))}
          </div>
        </div>
      </div>

      <div className="hr" />
      <div className="section-title">Statistics</div>
      <div className="tbl-wrap">
        <table className="tbl">
          <tbody>
            {STAT_DEFS.filter((d) => d.fn).map((d) => (
              <tr key={d.key}>
                <td className="muted-2 xs">{d.name}</td>
                <td className="num mono">{formatStat(d, stats[d.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="xs muted-2" style={{ marginTop: 8 }}>
        Everything except scoring average is read off their attributes in the units the tour quotes them in — the sim
        does not play individual shots, and inventing some to add back up would be the same numbers with extra steps.
      </div>
    </Modal>
  )
}
