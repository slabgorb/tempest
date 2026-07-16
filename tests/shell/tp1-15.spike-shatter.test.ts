// tests/shell/tp1-15.spike-shatter.test.ts
//
// Story tp1-15 — THE SPIKE MODEL, the SHATTERED-tip visual (V-020 + DB-014).
// RED phase (O'Brien / TEA).
//
// When a charge bites a spike, the ROM does NOT cap the tip with the plain white
// JADOT dot — it draws a random YELLOW four-dot SPARKLE that twinkles until the
// tip settles. Ours always draws the white dot (render.ts drawSpikes), because
// our spikes carry no shattered state. tp1-15 adds the transient per-lane flag
// (core, see tp1-15.spike-burrow.test.ts) and the shell reads it here.
//
// PRIMARY SOURCE — ~/Projects/tempest-source-text (ALVROM.MAC is .RADIX 16):
//   SPARK1 (ALVROM.MAC:672-684)  CSTAT YELLOW, four dots on the AXES     at ±$10 (=16)
//   SPARK2 (ALVROM.MAC:685-697)  CSTAT YELLOW, four dots on the DIAGONALS at ±$10
//   TIPACT (ALDISP.MAC:3188-3210): if LINSTA bit 6 (SHATTERED) is set, JSR CASCAL
//     (depth scale) then splice a JSRL to PTSPAR or PTSPAR+2 chosen at random —
//     i.e. SPARK1/SPARK2 — INSTEAD of the WHITIP white dot.
//
// SEAM: drawSpikes is DOM-free (only ctx primitives + project), so — like
// render.tube-glow.test.ts — we drive the REAL drawSpikes() through a recording
// ctx. Every tip dot, drawn directly or via strokeGlyph, lands as ctx.fill() with
// fillStyle set to its colour (strokeGlyph renders a 1-point sub-stroke as
// arc()+fill(), render.ts:116-118). So we count fill() colours and stay agnostic
// to HOW the four dots are drawn — only WHAT colour and HOW MANY.
import { describe, it, expect } from 'vitest'
import { drawSpikes } from '../../src/shell/render'
import { makeCircleTube } from '../../src/core/geometry'
import type { GameState } from '../../src/core/state'

const YELLOW = '#ffe600' // GLYPH_HEX.yellow — CSTAT YELLOW (ALVROM.MAC:673, 686)
const WHITE = '#ffffff' // the ROM JADOT white tip cap (render.ts drawSpikes)
const SPIKE_LANE = 1

// A minimal recording CanvasRenderingContext2D: captures the fillStyle at every
// fill() (each tip dot) and the strokeStyle at every stroke(). Everything
// drawSpikes / strokeGlyph might touch is a no-op.
function makeRecCtx(): { ctx: CanvasRenderingContext2D; fills: string[]; strokes: string[] } {
  const fills: string[] = []
  const strokes: string[] = []
  const rec: Record<string, unknown> = {
    strokeStyle: '',
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    save(): void {},
    restore(): void {},
    translate(): void {},
    rotate(): void {},
    scale(): void {},
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    closePath(): void {},
    arc(): void {},
    fill(): void {
      fills.push(String(rec.fillStyle))
    },
    stroke(): void {
      strokes.push(String(rec.strokeStyle))
    },
  }
  return { ctx: rec as unknown as CanvasRenderingContext2D, fills, strokes }
}

// tp1-15 adds the transient per-lane flag; type it loosely so this file compiles
// before Dev adds it (drawSpikes ignores it pre-GREEN → the intact white dot).
type SpikeRenderState = Pick<GameState, 'tube' | 'spikes'> & { spikeShattered: boolean[] }

function drawOneTip(shatteredTip: boolean): { fills: string[]; strokes: string[] } {
  const rec = makeRecCtx()
  const tube = makeCircleTube(4, { x: 0, y: 0 }, 20, 200)
  const spikes = [0, 0, 0, 0]
  spikes[SPIKE_LANE] = 0.6
  const shatterFlags = [false, false, false, false]
  shatterFlags[SPIKE_LANE] = shatteredTip
  const s = { tube, spikes, spikeShattered: shatterFlags } as unknown as SpikeRenderState
  drawSpikes(rec.ctx, s as unknown as GameState)
  return { fills: rec.fills, strokes: rec.strokes }
}

describe('tp1-15 drawSpikes — shattered tip shows a yellow sparkle (V-020/DB-014)', () => {
  it('caps an INTACT spike tip with a single WHITE dot (unchanged)', () => {
    const { fills } = drawOneTip(false)
    expect(fills.filter((c) => c === WHITE)).toHaveLength(1)
    expect(fills.filter((c) => c === YELLOW)).toHaveLength(0)
  })

  it('replaces the white cap with a YELLOW four-dot sparkle at a SHATTERED tip', () => {
    const { fills } = drawOneTip(true)
    // The white JADOT cap is gone…
    expect(fills.filter((c) => c === WHITE)).toHaveLength(0)
    // …replaced by SPARK1/SPARK2 — four yellow dots (ALVROM.MAC:672-697), not one
    // recoloured dot.
    expect(fills.filter((c) => c === YELLOW).length).toBeGreaterThanOrEqual(4)
  })
})
