import { SAVE_KEY, SETTINGS_KEY, GAME_VERSION } from './constants.js'

export function cloneState(state) {
  if (typeof structuredClone === 'function') return structuredClone(state)
  return JSON.parse(JSON.stringify(state))
}

/**
 * Optimistic concurrency for the autosave.
 *
 * Two tabs open on the same career used to take turns overwriting each other
 * with whatever state each happened to be holding: sim a year in one tab, click
 * anything in the other, and the year was gone with nothing said. Each tab
 * tracks the sequence number it believes is current and refuses to write over a
 * newer one.
 */
const OWNER_KEY = `${SAVE_KEY}:owner`
const TAB_ID = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
let ownedSeq = 0

function readOwner() {
  try {
    const raw = localStorage.getItem(OWNER_KEY)
    const o = raw ? JSON.parse(raw) : null
    return o && typeof o.seq === 'number' ? o : null
  } catch {
    return null
  }
}

/** Take ownership of whatever is on disk — after a load, import or new career. */
export function claimSave() {
  const cur = readOwner()
  ownedSeq = cur ? cur.seq : 0
}

export function saveGame(state) {
  try {
    const cur = readOwner()
    if (cur && cur.seq !== ownedSeq) {
      return {
        ok: false,
        conflict: true,
        error: 'This career is open in another tab, which has moved further on.',
      }
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    ownedSeq += 1
    localStorage.setItem(OWNER_KEY, JSON.stringify({ tab: TAB_ID, seq: ownedSeq }))
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
    claimSave()
    return migrate(state)
  } catch {
    return null
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
    localStorage.removeItem(OWNER_KEY)
    ownedSeq = 0
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
    venueStarts: {},
    ailmentHistory: {},
    teamCaps: 0,
    teamPicks: 0,
    teamCupWins: 0,
    teamRecord: { w: 0, l: 0, h: 0 },
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
    appearanceTotal: 0,
    raceWins: 0,
    raceBonusTotal: 0,
    raceHistory: [],
    weeksAtNo1: 0,
    weeksTop10: 0,
    seasonsTop10: 0,
    asianOrderOfMeritWins: 0,
  },
  finance: { cash: 0, lifestyle: 'modest', backing: 'club', backer: null, workedThrough: 0, dependents: 0, passiveIncome: 0, seasonAppearance: 0, appearancesTaken: 0, history: [] },
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
  prep: null,
  cupRota: [],
  cupHolders: {},
  cupHistory: [],
  courseRecords: {},
  majorExemptUntil: 0,
  tourWinExemptUntil: 0,
  asianOMExemptUntil: 0,
  yearsElapsed: 0,
}

function fillDefaults(target, shape) {
  for (const [k, v] of Object.entries(shape)) {
    if (target[k] !== undefined && target[k] !== null) continue
    // `typeof null === 'object'`, so a null default used to fall into the
    // spread branch and come back as {}. For the staff slots — whose empty
    // value *is* null — that turned "you have no coach" into a truthy
    // coach-shaped object with no fields on it on every single load.
    if (v === null) target[k] = null
    else if (Array.isArray(v)) target[k] = []
    else if (typeof v === 'object') target[k] = { ...v }
    else target[k] = v
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
  relinkPlayer(s)
  s.version = GAME_VERSION
  return s
}

/**
 * In a live game `state.player` *is* the entry for you in `state.world.players`
 * — one object, two references — which is how the world ranks you, puts you in
 * fields and compares you to everyone else. JSON has no way to express that, so
 * every save round-trip silently split you in two: the copy the world reasons
 * about froze at the moment you saved while the one the UI shows kept
 * improving. Reloading the page once a year cost a test career 8 points of
 * overall, its only win, and about $9m. Restore the link on the way in.
 */
export function relinkPlayer(s) {
  const list = s.world && Array.isArray(s.world.players) ? s.world.players : null
  if (!list || !s.player) return s
  // `pid` is the identity, and the user's is 0 — so compare against undefined
  // explicitly rather than leaning on truthiness.
  const pid = s.player.pid
  const i = pid === undefined ? list.findIndex((p) => p && p.isUser) : list.findIndex((p) => p && p.pid === pid)
  if (i >= 0) list[i] = s.player
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
  // An imported file replaces whatever was here, so this tab owns it now.
  claimSave()
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

  /**
   * Takes the *outgoing* state by reference rather than cloning it. Every
   * mutation in the app builds a fresh draft and swaps it in, so the state
   * handed here is never written to again — cloning it was a second full deep
   * copy of a ~1.4 MB object on every single tap, which is the kind of thing
   * you feel on a phone and not on a laptop.
   */
  push(state, label) {
    if (!state) return
    // Defensive: a caller that pushes the same object twice (a mutation that
    // threw before committing, say) would otherwise get an undo step that
    // goes nowhere.
    if (this.stack.length && this.stack[this.stack.length - 1].snapshot === state) return
    this.stack.push({ label, snapshot: state })
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
    // `current` is about to be replaced by the snapshot we return, so it is
    // safe to hold by reference for the same reason push() is.
    if (current) this.redoStack.push({ label: entry.label, snapshot: current })
    return entry
  }

  redo(current) {
    if (!this.redoStack.length) return null
    const entry = this.redoStack.pop()
    if (current) this.stack.push({ label: entry.label, snapshot: current })
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
