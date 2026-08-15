import React from 'react'
import { COURSE_TYPES } from '../game/constants.js'
import { fmtMoney, splitPrize } from '../game/finance.js'
import { agentCut } from '../game/staff.js'
import { conditionsLabel } from '../game/weather.js'
import { Modal, Chip, CircuitChip, ToPar, Money, Empty, posLabel } from './ui.jsx'

/** Leaderboard for one tournament the player entered. */
export default function ResultModal({ state, eventId, onClose }) {
  const row = [...state.seasonLog].reverse().find((r) => r.eventId === eventId)
  const summary = state.seasonResults[eventId]
  const event = state.season.find((e) => e.id === eventId)
  if (!summary) {
    return (
      <Modal title="Result" onClose={onClose}>
        <Empty>No result recorded for that event.</Empty>
      </Modal>
    )
  }

  const board = summary.top || []
  const userRow = board.find((r) => r.isUser)
  const split = row
    ? splitPrize(row.gross, {
        pos: row.pos || 999,
        madeCut: row.madeCut,
        hasCaddie: !!state.staff.caddie,
        agentCut: agentCut(state.staff),
      })
    : null

  return (
    <Modal
      title={summary.name}
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
          <CircuitChip id={summary.circuit} />
          {summary.isMajor ? <Chip tone="orange">MAJOR</Chip> : null}
          {event ? <Chip>{event.venue}</Chip> : null}
          {event ? <Chip>{COURSE_TYPES[event.courseType].name}</Chip> : null}
          {summary.conditions ? <Chip>{conditionsLabel(summary.conditions)}</Chip> : null}
          {summary.cutLine !== null && summary.cutLine !== undefined ? (
            <Chip>Cut at {summary.cutLine > 0 ? `+${summary.cutLine}` : summary.cutLine}</Chip>
          ) : null}
        </div>
        {row ? (
          <div style={{ textAlign: 'right' }}>
            <div className={`mono ${row.pos === 1 ? 'gold' : ''}`} style={{ fontSize: 26, fontWeight: 750 }}>
              {posLabel(row)}
            </div>
            <div className="xs muted-2">
              {row.madeCut ? `${row.toPar > 0 ? '+' : ''}${row.toPar} · ${row.points} ranking points` : 'missed the cut'}
            </div>
          </div>
        ) : null}
      </div>

      {row && row.rounds ? (
        <div className="pill-row" style={{ marginBottom: 12 }}>
          {row.rounds.map((r, i) => (
            <Chip key={i} tone={r.toPar < 0 ? 'green' : r.toPar > 3 ? 'red' : undefined}>
              R{i + 1} {r.strokes} ({r.toPar > 0 ? `+${r.toPar}` : r.toPar === 0 ? 'E' : r.toPar})
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th className="num">Pos</th>
            <th>Player</th>
            <th className="num">Score</th>
            <th className="num">Money</th>
            <th className="num">Points</th>
          </tr>
        </thead>
        <tbody>
          {board.map((r, i) => (
            <tr key={`${r.pid}-${i}`} className={r.isUser ? 'me' : ''}>
              <td className={`num lb-pos ${r.pos === 1 ? 'gold' : ''}`}>{posLabel(r)}</td>
              <td>
                {r.flag} {r.name}
              </td>
              <td className="num">
                <ToPar v={r.toPar} />
              </td>
              <td className="num">
                <Money v={r.money} zeroDash />
              </td>
              <td className="num muted">{r.points || ''}</td>
            </tr>
          ))}
          {userRow ? null : row ? (
            <tr className="me">
              <td className="num lb-pos">{posLabel(row)}</td>
              <td>
                {state.player.flag} {state.player.name}
              </td>
              <td className="num">
                <ToPar v={row.toPar} />
              </td>
              <td className="num">
                <Money v={row.gross} zeroDash />
              </td>
              <td className="num muted">{row.points || ''}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>

      {split && split.gross > 0 ? (
        <>
          <div className="hr" />
          <div className="row wrap gap-sm">
            <Chip>Gross {fmtMoney(split.gross)}</Chip>
            <Chip tone="red">Caddie −{fmtMoney(split.caddie)}</Chip>
            <Chip tone="red">Agent −{fmtMoney(split.agent)}</Chip>
            <Chip tone="red">Tax −{fmtMoney(split.tax)}</Chip>
            <Chip tone="green">You keep {fmtMoney(split.net)}</Chip>
          </div>
        </>
      ) : null}

      {row && row.amateur && row.pos === 1 ? (
        <div className="small muted" style={{ marginTop: 10 }}>
          As an amateur you cannot accept the prize money. The trophy is yours, though.
        </div>
      ) : null}
    </Modal>
  )
}
