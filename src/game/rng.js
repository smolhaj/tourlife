// Small deterministic PRNG. The whole game state (including this generator's
// cursor) is serialisable, so a save file replays identically.

export function hashSeed(str) {
  let h = 2166136261 >>> 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export class Rng {
  constructor(seed = 1) {
    this.s = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)
    if (this.s === 0) this.s = 0x9e3779b9
    this._spare = null
  }

  static from(state) {
    const r = new Rng(1)
    r.s = state >>> 0
    return r
  }

  // mulberry32
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  float(min, max) {
    return min + this.next() * (max - min)
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.float(min, max + 1))
  }

  chance(p) {
    return this.next() < p
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)]
  }

  /** Weighted pick. `weightOf` returns a non-negative number. */
  pickWeighted(arr, weightOf) {
    let total = 0
    for (const item of arr) total += Math.max(0, weightOf(item))
    if (total <= 0) return this.pick(arr)
    let roll = this.next() * total
    for (const item of arr) {
      roll -= Math.max(0, weightOf(item))
      if (roll <= 0) return item
    }
    return arr[arr.length - 1]
  }

  shuffle(arr) {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  /** Box–Muller, one cached spare. */
  gauss(mean = 0, sd = 1) {
    if (this._spare !== null) {
      const v = this._spare
      this._spare = null
      return mean + sd * v
    }
    let u = 0
    let v = 0
    let s = 0
    do {
      u = this.next() * 2 - 1
      v = this.next() * 2 - 1
      s = u * u + v * v
    } while (s >= 1 || s === 0)
    const mul = Math.sqrt((-2 * Math.log(s)) / s)
    this._spare = v * mul
    return mean + sd * u * mul
  }

  /** Gaussian clamped to +/- `limit` sds — keeps outliers plausible. */
  gaussClamped(mean, sd, limit = 3) {
    const z = Math.max(-limit, Math.min(limit, this.gauss(0, 1)))
    return mean + sd * z
  }
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}
