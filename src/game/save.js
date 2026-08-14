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

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return migrate(parsed)
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

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY)
  } catch {
    return false
  }
}

/** Older saves may lack fields added later; fill in whatever is missing. */
function migrate(s) {
  if (!s.version || s.version > GAME_VERSION) {
    if (!s.version) s.version = GAME_VERSION
  }
  s.career = s.career || {}
  s.career.highlights = s.career.highlights || []
  s.career.seasons = s.career.seasons || []
  s.career.h2h = s.career.h2h || {}
  s.career.winsList = s.career.winsList || []
  s.career.majorWins = s.career.majorWins || []
  s.career.venueWins = s.career.venueWins || {}
  s.sponsors = s.sponsors || { deals: [], offers: [] }
  s.sponsors.deals = s.sponsors.deals || []
  s.sponsors.offers = s.sponsors.offers || []
  s.news = s.news || []
  s.log = s.log || []
  s.settings = s.settings || { autoAdvance: true }
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
  if (!state || !state.player || !state.world) throw new Error('That does not look like a Tour Life career file.')
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
