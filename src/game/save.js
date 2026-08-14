import { SAVE_KEY, SETTINGS_KEY, GAME_VERSION } from './constants.js'

export function cloneState(state) {
  if (typeof structuredClone === 'function') return structuredClone(state)
  return JSON.parse(JSON.stringify(state))
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) }
  }
}

/**
 * Is this actually a career, or just JSON that happens to parse? Validated in
 * one place so a corrupt autosave is *rejected* rather than crashing the app
 * on first render — the difference between "that save could not be read" and
 * a stack trace.
 */
export function isPlayableSave(s) {
  return !!(
    s &&
    typeof s === 'object' &&
    s.player &&
    typeof s.player === 'object' &&
    s.player.ratings &&
    typeof s.player.ratings === 'object' &&
    typeof s.player.age === 'number' &&
    s.world &&
    Array.isArray(s.world.players) &&
    s.world.players.length > 0
  )
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const state = parsed.format === 'tourlife-career' ? parsed.state : parsed
    if (!isPlayableSave(state)) return null
    return migrate(state)
  } catch {
    return null
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* private browsing */
  }
}

/** Only offer "Continue" for a save we can actually load. */
export function hasSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    const state = parsed && parsed.format === 'tourlife-career' ? parsed.state : parsed
    return isPlayableSave(state)
  } catch {
    return false
  }
}

/**
 * Every container the engine appends to or reads without guarding. Anything
 * missing from an older save is filled in here — a save that predates a field
 * used to crash on the first tournament of the restored career.
 */
const REQUIRED_SHAPE = {
  career: {
    highlights: [],
    seasons: [],
    allResults: [],
    winsList: [],
    majorWins: [],
    rivals: [],
    h2h: {},
    venueWins: {},
    wins: 0,
    majors: 0,
    seniorWins: 0,
    seniorMajors: 0,
    amateurWins: 0,
    top10s: 0,
    starts: 0,
    cutsMade: 0,
    careerEarnings: 0,
    careerGross: 0,
    endorsementTotal: 0,
    weeksAtNo1: 0,
    weeksTop10: 0,
    seasonsTop10: 0,
    asianOrderOfMeritWins: 0,
  },
  finance: { cash: 0, lifestyle: 'modest', dependents: 0, passiveIncome: 0, history: [] },
  sponsors: { deals: [], offers: [] },
  staff: { coach: null, caddie: null, physio: null, psych: null, agent: null },
  training: { choice: 'balanced' },
  settings: { autoAdvance: true },
}

const REQUIRED_TOP = {
  news: [],
  log: [],
  season: [],
  nextSeason: [],
  entered: {},
  nextEntered: {},
  seasonResults: {},
  seasonLog: [],
  bag: {},
  majorExemptUntil: 0,
  tourWinExemptUntil: 0,
  asianOMExemptUntil: 0,
  yearsElapsed: 0,
}

function fillDefaults(target, shape) {
  for (const [k, v] of Object.entries(shape)) {
    if (target[k] === undefined || target[k] === null) {
      target[k] = Array.isArray(v) ? [] : typeof v === 'object' ? { ...v } : v
    }
  }
}

/** Older saves may lack fields added later; fill in whatever is missing. */
function migrate(s) {
  if (!s.version) s.version = GAME_VERSION
  fillDefaults(s, REQUIRED_TOP)
  for (const [key, shape] of Object.entries(REQUIRED_SHAPE)) {
    s[key] = s[key] || {}
    fillDefaults(s[key], shape)
  }
  if (!s.cards) s.cards = {}
  for (const c of ['domestic', 'intl', 'asian', 'emerging', 'senior']) {
    if (!s.cards[c]) s.cards[c] = { status: 'none', until: 0 }
  }
  s.version = GAME_VERSION
  return s
}

// ------------------------------------------------------------- export/import

export function exportSave(state) {
  const payload = {
    format: 'tourlife-career',
    version: GAME_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  }
  return JSON.stringify(payload)
}

export function downloadSave(state) {
  const name = `${(state.player?.name || 'career').replace(/\W+/g, '-').toLowerCase()}-${state.year}.tourlife.json`
  const blob = new Blob([exportSave(state)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function importSave(text) {
  const parsed = JSON.parse(text)
  const state = parsed && parsed.format === 'tourlife-career' ? parsed.state : parsed
  if (!isPlayableSave(state)) throw new Error('That does not look like a Tour Life career file.')
  return migrate(state)
}

// ------------------------------------------------------------------ settings

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

// ----------------------------------------------------------------- undo ring

export class History {
  constructor(limit = 24) {
    this.limit = limit
    this.stack = []
    this.redoStack = []
  }

  push(state, label) {
    this.stack.push({ label, snapshot: cloneState(state) })
    if (this.stack.length > this.limit) this.stack.shift()
    this.redoStack.length = 0
  }

  canUndo() {
    return this.stack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  undo(current) {
    if (!this.stack.length) return null
    const entry = this.stack.pop()
    this.redoStack.push({ label: entry.label, snapshot: cloneState(current) })
    return entry
  }

  redo(current) {
    if (!this.redoStack.length) return null
    const entry = this.redoStack.pop()
    this.stack.push({ label: entry.label, snapshot: cloneState(current) })
    return entry
  }

  labels() {
    return this.stack.map((e) => e.label)
  }

  clear() {
    this.stack.length = 0
    this.redoStack.length = 0
  }
}
