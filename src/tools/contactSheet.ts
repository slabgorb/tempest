// src/tools/contactSheet.ts
//
// Model contact sheet — a standalone dev page (/models.html) that renders every
// Tempest actor (the five enemies + the player Claw) in a grid, each looping its
// CHARACTERISTIC MOTION on a neutral flat three-lane board. Drawn through the
// SAME pipeline the game uses (shell/render.ts's per-element draws), so glyph or
// projection edits show up here with no extra wiring — handy for eyeballing
// shape AND motion at a glance.
//
// This is the Tempest analog of star-wars/src/tools/contactSheet.ts. There the
// reveal is auto-rotation of a 3D form; Tempest is 2.5D, so the reveal is motion
// on the tube — the flipper tumbles lane→lane, the fuseball writhes and hops the
// rim, the spiker spins and lays spike, the pulsar strobes its lane, the claw
// walks the rim.
//
//   [SPACE]  pause / resume all motion
//
// DOM/shell tool — NEVER imported by the deterministic core or its tests. The
// per-cell choreography below is a clean approximation of in-game motion (not the
// real AI): the tool scripts the state-driven fields each frame; the frame-driven
// animation (spins, writhe, strobe, gait) comes free from render.ts.

import {
  GameState, initialState,
  Flipper, Tanker, Spiker, Fuseball, Pulsar, TankerCargo,
} from '../core/state'
import { currentLane } from '../core/geometry'
import { CAM_ENTRY } from '../core/enemies/cam'
import { JUMP_ANGLE_STEPS } from '../core/enemies/interpreter'
import { cellRects, flatTube } from '../core/modelView'
import {
  drawTube, drawSpikes, drawEnemy, drawPlayer, advanceRenderClock,
} from '../shell/render'

const LANES = 3
const COLS = 3
const LABEL_FONT = "700 14px 'Orbitron', monospace"
const HINT_COLOR = '#7a8699'

// Neutral cool board so the coloured actor glyphs pop against it. Each label
// uses the actor's own glyph colour (mirroring the Star Wars sheet), drawn from
// render.ts's GLYPH_HEX palette / CLAW_COLOR.
const TUBE_COLOR = '#1f8fff'
const COLOR = {
  flipper: '#ff2f4f', // red bowtie
  tanker: '#39ff14', // green X-diamond
  spiker: '#39ff14', // green spiral
  fuseball: '#ffe600', // one of its five leg colours
  pulsar: '#00e5ff', // cyan zig-zag
  claw: '#ffe600', // CLAW_COLOR
} as const

interface Rect { x: number; y: number; w: number; h: number }

interface ModelCell {
  name: string
  descriptor: string
  color: string
  state: GameState
  // Advance this cell's state-driven choreography by `dt` seconds (looping).
  step: (dt: number) => void
}

// A synthetic, single-actor GameState on the flat board. Built from initialState
// for valid scaffolding, then stripped to just the flat tube + one actor.
function baseState(): GameState {
  const s = initialState(1)
  s.mode = 'playing'
  s.tube = flatTube(LANES)
  s.spikes = new Array(LANES).fill(0)
  s.enemies = []
  s.bullets = []
  s.enemyBullets = []
  s.player.alive = true
  s.player.lane = 1
  return s
}

// The CAM registers every invader carries. The contact sheet does not run the
// interpreter — each cell hand-animates its model so the SHAPE can be eyeballed —
// so these are just the quiescent values render.ts reads. `slotId` is unused here
// (no MAYBLR gate runs off-sim), so every cell gets the same fixed placeholder.
const regs = () => ({
  camPc: CAM_ENTRY.NOJUMP, camLoop: 0, rot: 1 as const, direction: 1 as const, slotId: 0,
})

// Flipper — climbs far→near and tumbles lane→lane, bouncing across the board's
// three lanes (0→1→2→1→0). render.ts supplies the bowtie spin + mid-flip half-turn.
function flipperCell(): ModelCell {
  const s = baseState()
  const f: Flipper = { kind: 'flipper', lane: 0, depth: 0, ...regs() }
  s.enemies = [f]
  let settled = 0.8 // seconds on this lane before the next tumble
  const step = (dt: number) => {
    f.depth = (f.depth + dt * 0.18) % 1 // slow climb, loops at the rim
    if (f.jumpAngle !== undefined) {
      f.jumpAngle += dt * JUMP_ANGLE_STEPS * 2 // ~0.5s per flip
      if (f.jumpAngle >= JUMP_ANGLE_STEPS) {
        f.lane = Math.max(0, Math.min(LANES - 1, f.lane + f.rot)) // settle (open board clamps)
        f.jumpAngle = undefined
        settled = 0.7
      }
      return
    }
    settled -= dt
    if (settled <= 0) {
      // Bounce off the edges, hold course in the middle.
      f.rot = f.lane >= LANES - 1 ? -1 : f.lane <= 0 ? 1 : f.rot
      f.jumpAngle = 0
    }
  }
  return { name: 'FLIPPER', descriptor: 'flips lane→lane', color: COLOR.flipper, state: s, step }
}

// Tanker — climbs while cycling its cargo so the split emblem (flipper/fuseball/
// pulsar) is visible in turn. render.ts supplies the X-diamond + emblem.
function tankerCell(): ModelCell {
  const s = baseState()
  const t: Tanker = { kind: 'tanker', lane: 1, depth: 0, ...regs(), contains: 'flipper' }
  s.enemies = [t]
  const cargo: TankerCargo[] = ['flipper', 'fuseball', 'pulsar']
  let clock = 0
  const step = (dt: number) => {
    clock += dt
    t.depth = (t.depth + dt * 0.16) % 1
    t.contains = cargo[Math.floor(clock / 1.6) % cargo.length]
  }
  return { name: 'TANKER', descriptor: 'carries its cargo', color: COLOR.tanker, state: s, step }
}

// Spiker — climbs the centre lane laying a growing spike trail behind it, then
// resets at the rim to re-lay. render.ts supplies the 4-frame pinwheel spin.
function spikerCell(): ModelCell {
  const s = baseState()
  const LANE = 1
  const sp: Spiker = { kind: 'spiker', lane: LANE, depth: 0, ...regs() }
  s.enemies = [sp]
  const step = (dt: number) => {
    const next = sp.depth + dt * 0.22
    if (next >= 1) {
      sp.depth = 0
      s.spikes[LANE] = 0 // reached the rim → clear the trail and start over
    } else {
      sp.depth = next
      s.spikes[LANE] = Math.max(s.spikes[LANE], sp.depth) // spike grows behind it (far→spiker)
    }
  }
  return { name: 'SPIKER', descriptor: 'spins & lays spike', color: COLOR.spiker, state: s, step }
}

// Fuseball — hops across the three lanes on a beat and bobs along its lane.
// render.ts supplies the 4-frame ball-of-legs writhe.
function fuseballCell(): ModelCell {
  const s = baseState()
  const fb: Fuseball = { kind: 'fuseball', lane: 1, depth: 0.5, ...regs(), jitterTimer: 0, vulnerable: true }
  s.enemies = [fb]
  const hop = [0, 1, 2, 1] // bounce across the lanes, staying on the open board
  let clock = 0
  const step = (dt: number) => {
    clock += dt
    fb.lane = hop[Math.floor(clock / 0.45) % hop.length]
    fb.depth = 0.55 + 0.35 * Math.sin(clock * 2.2)
  }
  return { name: 'FUSEBALL', descriptor: 'writhes the rim', color: COLOR.fuseball, state: s, step }
}

// Pulsar — holds a lane and toggles `pulsing` on a beat; render.ts supplies the
// zig-zag jaggedness + cyan/white colour strobe and the electrified lane quad.
function pulsarCell(): ModelCell {
  const s = baseState()
  const pu: Pulsar = { kind: 'pulsar', lane: 1, depth: 0.5, ...regs(), pulsing: true }
  s.enemies = [pu]
  let clock = 0
  const step = (dt: number) => {
    clock += dt
    pu.pulsing = Math.floor(clock / 1.1) % 2 === 0 // on for a beat, off for a beat
    pu.depth = 0.5 + 0.08 * Math.sin(clock * 1.3) // gentle drift so it never looks frozen
  }
  return { name: 'PULSAR', descriptor: 'strobes its lane', color: COLOR.pulsar, state: s, step }
}

// Player Claw — WALKS the rim: strides one lane, then HOLDS at the lane centre
// (the pose freezes — proving the roll is driven by MOVEMENT, not a free loop),
// then strides again, bouncing across the board so the lean is shown BOTH ways.
// The continuous lane feeds clawTransform, whose authentic ROM roll leans the
// cursor into its direction of travel and wraps exactly as it steps.
function playerCell(): ModelCell {
  const s = baseState()
  s.enemies = []
  const HOLD = 0.5 // s parked at a lane centre → the pose holds (static, not a loop)
  const STRIDE = 0.6 // s to walk one lane → the 8 poses roll once, leaning in
  let clock = 0
  let from = 0
  let dir = 1
  const step = (dt: number) => {
    clock += dt
    while (clock >= HOLD + STRIDE) {
      clock -= HOLD + STRIDE
      from += dir
      if (from >= LANES - 1) dir = -1
      else if (from <= 0) dir = 1
    }
    const t = clock > HOLD ? (clock - HOLD) / STRIDE : 0 // hold at `from`, then stride
    s.player.lane = from + dir * t
  }
  return { name: 'CLAW', descriptor: 'walks the rim', color: COLOR.claw, state: s, step }
}

const cells: ModelCell[] = [
  flipperCell(), tankerCell(), spikerCell(), fuseballCell(), pulsarCell(), playerCell(),
]

// Board extents (board-local px), derived from the flat tube itself so the
// fit-shrink stays correct if flatTube's proportions change.
const board = flatTube(LANES)
const boardXs = [...board.near, ...board.far].map((p) => p.x)
const boardYs = [...board.near, ...board.far].map((p) => p.y)
const BOARD_W = Math.max(...boardXs) - Math.min(...boardXs)
const BOARD_H = Math.max(...boardYs) - Math.min(...boardYs)

const canvas = document.getElementById('sheet') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let dpr = Math.min(2, window.devicePixelRatio || 1)
let W = window.innerWidth
let H = window.innerHeight

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
}
window.addEventListener('resize', resize)
resize()

let paused = false
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    paused = !paused
  }
})

function drawCell(cell: ModelCell, r: Rect): void {
  const s = cell.state
  const enemy = s.enemies[0]
  const hlLane = enemy ? enemy.lane : currentLane(s.tube, s.player.lane)
  // Centre the origin-centred board in the cell, shrinking only if it would
  // overflow (never enlarging — the glyphs are pixel-tuned at the game's scale).
  const scale = Math.min(1, (r.w * 0.82) / BOARD_W, (r.h * 0.62) / BOARD_H)

  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + r.h * 0.06) // nudge down so the labels clear the board
  ctx.scale(scale, scale)
  drawTube(ctx, s, TUBE_COLOR, hlLane)
  drawSpikes(ctx, s)
  if (enemy) drawEnemy(ctx, s, enemy)
  else drawPlayer(ctx, s)
  ctx.restore()
}

function drawLabel(cell: ModelCell, r: Rect): void {
  ctx.save()
  ctx.translate(r.x, r.y)
  ctx.font = LABEL_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = cell.color
  ctx.shadowColor = cell.color
  ctx.shadowBlur = 6
  ctx.fillText(cell.name, 12, 24)
  ctx.fillText(cell.descriptor, 12, 42)
  ctx.shadowBlur = 0
  ctx.restore()
}

let last = 0
function frame(now: number): void {
  let dt = last ? (now - last) / 1000 : 0
  last = now
  if (dt > 0.1) dt = 0.1 // clamp tab-switch / first-frame jumps
  if (paused) dt = 0

  for (const cell of cells) cell.step(dt)
  advanceRenderClock(dt) // one bump per frame → every cell animates on the same clock

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const rects = cellRects(W, H, cells.length, COLS)
  for (let i = 0; i < cells.length; i++) {
    drawCell(cells[i], rects[i])
    drawLabel(cells[i], rects[i])
  }

  // Footer hint.
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = HINT_COLOR
  ctx.shadowBlur = 0
  ctx.fillText(`[SPACE] ${paused ? 'play' : 'pause'}`, W / 2, H - 10)

  ctx.restore()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
