
export interface Rng {
  readonly s: number
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 }
}

// mulberry32 — deterministic, no Math.random
export function rngNext(rng: Rng): { value: number; rng: Rng } {
  const a = (rng.s + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, rng: { s: a } }
}

export function rngInt(rng: Rng, maxExclusive: number): { value: number; rng: Rng } {
  const next = rngNext(rng)
  return { value: Math.floor(next.value * maxExclusive), rng: next.rng }
}
