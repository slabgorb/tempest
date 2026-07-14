// tests/core/tp1-32.framing-viewport.test.ts
//
// Story tp1-32: THE FRAMING clips the tube off-screen. The shipped tp1-31 (#115,
// v1.0.13) per-well SCREEN Z translate (tube.screenZ) is OVER-SCALED: applied to
// every projected point (shell/render.ts:1001 `pctx.translate(0, s.camera.screenZ)`,
// the camera settling to tube.screenZ), it drives the near rim — and the Claw on
// it — past the viewport. Confirmed by play-test, visible even at level 1.
//
// THE VIEWPORT (shell/phosphor.ts:84-97): the vector scene is drawn into a box
// centred at the origin and uniformly scaled by `Math.min(W, H) / 720`. So the
// square that is GUARANTEED visible for ANY aspect ratio is ±360 scene units on
// BOTH axes — the min(W,H) axis is the binding one; the wider axis only ever
// shows MORE. A rim point p is drawn at (p.x, p.y + screenZ): screenZ is a
// canvas-y translate and NEVER touches x ("X SCREEN CENTER" = 0, ALDISP.MAC:2507).
// So the whole well fits iff every near-ring point's post-translate extent stays
// inside that ±360 box.
//
// THE INVARIANT (pure geometry over tube.near + tube.screenZ — no canvas):
//   for every one of the 16 wells, and every near-ring rim point,
//     |p.x| <= SAFE_HALF   and   |p.y + tube.screenZ| <= SAFE_HALF
//   SAFE_HALF = SCENE_HALF - MARGIN. MARGIN is a small viewport-safety band for
//   the rim STROKE (~2px) plus a hair of headroom. It is deliberately NOT sized
//   to contain the glow bloom (soft, may fade off-edge) or the Claw glyph — the
//   remaining magnitude 'feel' is a play-test tune, out of this test's scope.
//
// This story fixes the SHIPPED #115 code (tube.screenZ in core, applied by the
// camera). It must NOT reintroduce PR #116's separate framing.ts approach, and it
// must NOT flip the established per-well direction (see the sign guard below and
// tp1-31.screen-z.test.ts) — only reduce the magnitude / clamp it to a safe band.
import { describe, it, expect } from 'vitest'
import { tubeForLevel } from '../../src/core/geometry'

// The phosphor scene half-box, in scene units (shell/phosphor.ts: min(W,H)/720).
const SCENE_HALF = 360
// Small viewport-safety margin: the rim stroke half-width plus a hair of headroom.
// Small on purpose (~5.5% of the half-box); the Claw/glow fit is a play-test tune.
const MARGIN = 20
const SAFE_HALF = SCENE_HALF - MARGIN // 340

// WELSEQ (ALDISP.MAC:1384) + HOLZAD/HOLZDH (ALDISP.MAC:1387-1388): the per-well
// SCREEN Z VANISH PT bytes, needed only for the sign/direction guard.
const WELSEQ = [0, 1, 2, 3, 4, 5, 6, 7, 13, 9, 8, 12, 14, 15, 10, 11] as const
const ZADJ = [-192, -224, -192, -128, -192, -192, -144, 96, 256, -224, 64, 0, -352, 320, -192, 256] as const
const shapeForLevel = (level: number): number => WELSEQ[(level - 1) % 16]

// The rim points as the shell draws them: x unchanged, y translated by screenZ.
function nearOnScreen(level: number): { x: number; y: number }[] {
  const t = tubeForLevel(level)
  return t.near.map((p) => ({ x: p.x, y: p.y + t.screenZ }))
}

describe('tp1-32 — the whole tube stays inside the ±360 viewport for ALL 16 wells', () => {
  it('every near-ring rim point of every well lands within the safe box after screenZ', () => {
    // Collect EVERY violation across all 16 wells so a failure names them all,
    // not just the first. On shipped #115 this fails for ~half the wells (the
    // deepest, e.g. level 12 reaching |y| ~447 — far past 360).
    const violations: string[] = []
    for (let level = 1; level <= 16; level++) {
      const t = tubeForLevel(level)
      for (const p of nearOnScreen(level)) {
        if (Math.abs(p.x) > SAFE_HALF || Math.abs(p.y) > SAFE_HALF) {
          const axis = Math.abs(p.y) >= Math.abs(p.x) ? 'y' : 'x'
          const v = axis === 'y' ? p.y : p.x
          violations.push(
            `level ${level} (shape ${shapeForLevel(level)}, screenZ ${t.screenZ.toFixed(1)}): ` +
            `${axis}=${v.toFixed(1)} exceeds ±${SAFE_HALF}`,
          )
        }
      }
    }
    expect(violations, `\n  ${violations.join('\n  ')}\n`).toEqual([])
  })

  it('reports the MAX rim extent per well — every well must clear the safe box', () => {
    for (let level = 1; level <= 16; level++) {
      const pts = nearOnScreen(level)
      const maxExtent = Math.max(...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
      expect(maxExtent, `level ${level} max rim extent`).toBeLessThanOrEqual(SAFE_HALF)
    }
  })
})

describe('tp1-32 — guards that must hold before AND after the fix', () => {
  it('screenZ never moves X: the x-extent already fits and must stay put', () => {
    // screenZ is a y-only translate ("X SCREEN CENTER" = 0). The x-extent is the
    // untranslated ring (~±300) and already clears the full box — this passes on
    // shipped code and pins that the fix must not start scaling/shifting x.
    for (let level = 1; level <= 16; level++) {
      const xs = tubeForLevel(level).near.map((p) => Math.abs(p.x))
      expect(Math.max(...xs), `level ${level} x-extent`).toBeLessThanOrEqual(SCENE_HALF)
    }
  })

  it('the safety margin is real and small (not cheesed to 0, not larger than the box)', () => {
    expect(MARGIN).toBeGreaterThan(0)
    expect(SAFE_HALF).toBeLessThan(SCENE_HALF)
    expect(MARGIN / SCENE_HALF).toBeLessThan(0.1) // "small": under 10% of the half-box
  })

  it('the fix must PRESERVE the per-well direction — no sign flip while rescaling', () => {
    // The story asks to re-confirm the sign reads as the ROM "MOVE UP" for the
    // negative-ZADJ majority. tp1-32 is a MAGNITUDE fix, so screenZ must keep the
    // sign it ships with today (= -sign(ZADJ)) for every translated well, and stay
    // NONZERO — a fix that zeroed the framing would erase the ROM's high/low intent.
    for (let level = 1; level <= 16; level++) {
      const z = tubeForLevel(level).screenZ
      const zadj = ZADJ[shapeForLevel(level)]
      if (zadj === 0) {
        expect(z, `level ${level} untranslated well stays 0`).toBeCloseTo(0, 9)
      } else {
        expect(Math.sign(z), `level ${level} direction = -sign(ZADJ)`).toBe(-Math.sign(zadj))
        expect(Math.abs(z), `level ${level} framing not zeroed`).toBeGreaterThan(1e-6)
      }
    }
  })
})
