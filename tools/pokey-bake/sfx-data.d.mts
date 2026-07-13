// Ambient type declaration for sfx-data.mjs, so the strict TS project (which does
// not enable allowJs) can import the bake data from tests/audit/alsoun-cue-mapping.test.ts
// without tripping noImplicitAny (TS7016). Co-located .d.mts is the standard
// companion-declaration convention for a plain .mjs ESM module — the same pattern
// tools/audit/check-citations.d.mts already uses.
//
// This declares the SHAPE the bake tool consumes, not the values. Story tp1-2
// corrects which ROM record each cue carries; the shape is unchanged.

/** One 6-byte ALSOUN envelope record: [value, beats, delta, count, restart, stop]. */
export type AlsounRecord = readonly number[]

export interface SfxSpec {
  /** Cue name. The bake writes `${name}.wav`. */
  readonly name: string
  /** CPU address of the ROM record, e.g. '$cbe9'. */
  readonly rom: string
  readonly gain: number
  /** A clean single-note record: one envelope for AUDF1, one for AUDC1. */
  readonly alsoun?: { readonly audf: AlsounRecord; readonly audc: AlsounRecord }
  /** A multi-note sound the engine streams out of ALSOUN_STREAM. */
  readonly stream?: { readonly audfStart: number; readonly audcStart: number }
}

/**
 * Lift a clean single-note cue out of the embedded ROM data region at its CPU
 * address. Throws RangeError if `rom` is unreadable or falls outside the region —
 * including the NaN case, where a bare range check would silently return an empty
 * envelope (which bakes to silence).
 */
export function alsounAt(rom: string): { audf: number[]; audc: number[] }

export const SFX: readonly SfxSpec[]
export const ALSOUN_STREAM: readonly number[]
export const ALSOUN_STREAM_BASE: number
export const DEFERRED: readonly { readonly name: string; readonly reason: string }[]
export default SFX
