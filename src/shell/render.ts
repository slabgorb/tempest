// src/shell/render.ts
import { GameState, Enemy } from '../core/state'
import { HighScoreTable } from '../core/highscore'
import { Tube, Point, currentLane, project, laneWidth, flipPivot } from '../core/geometry'
import { Fx, EnemyBurst, PlayerSplat } from './fx'
import { createPhosphor, phosphorAlpha } from './phosphor'
import { createStarfield, STAR_SPAWN_Z, STAR_RETIRE_Z } from './starfield'
import { titleLogoPasses } from './titleLogo'
import {
  flipperGlyph, tankerGlyph, spikerGlyph, fuseballGlyph,
  pulsarBar, pulsarVariant, pulsarColor, enemyBoltGlyph, playerBulletGlyph,
  playerBulletColor,
  type Glyph, type GlyphColor,
} from './glyphs'
import { layoutText, CELL_H } from './vecfont'

// Per-level color cycling — index by (level-1) mod palette length.
const LEVEL_COLORS = [
  '#1f8fff', '#ff2f4f', '#ffd400', '#23e8a6',
  '#b14cff', '#00d6ff', '#ff7a18', '#46ff5a',
]
const CLAW_COLOR = '#ffe600'

// Attract title "approaching rainbow" tuning (Story 10-6). TITLE_BASE_PX is the
// near-plane TEMPEST size in px; each pass shrinks it by its perspective scale.
// LOGO_RAINBOW_SPEED is how fast the stack marches forward, in phase-cycles/sec
// (one cycle advances the stack by one depth slot, i.e. a fresh far pass enters).
const TITLE_BASE_PX = 112
const LOGO_RAINBOW_SPEED = 0.9

// Phosphor afterglow retention per 1/60 s frame (0 = instant clear, 1 = never
// fades). 0.55 ≈ the authentic Color-XY short glow; tune by eye while running.
const PHOSPHOR_DECAY = 0.55

// Neon hues for the authentic-glyph palette colours (Story 6-8). The glyph
// library names colours semantically; this is the one place they become pixels.
const GLYPH_HEX: Record<GlyphColor, string> = {
  red: '#ff2f4f',
  green: '#39ff14',
  yellow: '#ffe600',
  cyan: '#00e5ff',
  white: '#ffffff',
  orange: '#ffa500',
  purple: '#9b30ff',
}

// Swing `from` to `to` along the circular arc about `pivot`, interpolating BOTH
// angle and radius so the path rides over the pivot and lands EXACTLY on `to` at
// t=1. Story 6-18 uses this to tumble a mid-flip flipper about its rim spoke —
// render-space only. Returns the position plus the total swing angle so the glyph
// can rotate in step (end-over-end).
function arcAbout(
  from: Point, to: Point, pivot: Point, t: number,
): { pos: Point; swing: number } {
  const a0 = Math.atan2(from.y - pivot.y, from.x - pivot.x)
  const a1 = Math.atan2(to.y - pivot.y, to.x - pivot.x)
  let dA = a1 - a0
  if (dA > Math.PI) dA -= 2 * Math.PI
  if (dA < -Math.PI) dA += 2 * Math.PI
  const r0 = Math.hypot(from.x - pivot.x, from.y - pivot.y)
  const r1 = Math.hypot(to.x - pivot.x, to.y - pivot.y)
  const a = a0 + dA * t
  const r = r0 + (r1 - r0) * t
  return { pos: { x: pivot.x + Math.cos(a) * r, y: pivot.y + Math.sin(a) * r }, swing: dA }
}

// Stroke an authentic glyph (Story 6-8) at (cx,cy), scaled and rotated into
// place. A single-point sub-stroke renders as a dot (e.g. the spike tip / bolt
// cross). `override` recolours every sub-stroke (the pulsar's cyan<->white
// strobe). lineWidth is divided by scale so the stroke stays ~2px on screen.
function strokeGlyph(
  ctx: CanvasRenderingContext2D, glyph: Glyph, cx: number, cy: number,
  scale: number, rotation: number, blur: number, override?: GlyphColor,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  if (rotation) ctx.rotate(rotation)
  ctx.scale(scale, scale)
  const lw = 2 / scale
  const dot = 1.8 / scale
  for (const stroke of glyph) {
    const hex = GLYPH_HEX[override ?? stroke.color]
    ctx.strokeStyle = hex
    ctx.fillStyle = hex
    ctx.shadowColor = hex
    ctx.shadowBlur = blur
    ctx.lineWidth = lw
    if (stroke.points.length === 1) {
      const p = stroke.points[0]
      ctx.beginPath(); ctx.arc(p.x, p.y, dot, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.beginPath()
      stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      if (stroke.closed) ctx.closePath()
      ctx.stroke()
    }
  }
  ctx.restore()
}

// Animation accumulators (render-only; never feeds back into the sim).
let renderTime = 0

// SUPERZAPPER RECHARGE banner latch (Story 10-9). The once-per-level Superzapper
// rearms to 'full' on level entry; we flash the authentic recharge banner for a
// beat when the level changes. Render-only state keyed on the level number — no
// new core/sim field. `-1` so the first played level latches.
let superzapBannerLevel = -1        // level we last announced the recharge for
let superzapBannerUntil = 0         // renderTime at which the flash stops

// Advance the shared render clock by `dt` seconds. The game's render() bumps
// `renderTime` itself each frame; the model contact-sheet dev tool
// (tools/contactSheet.ts) calls the per-element draws below DIRECTLY (bypassing
// render()), so it needs this seam to drive the frame-derived animation —
// flipper spin, fuseball writhe, spiker pinwheel, pulsar strobe, claw gait. Not
// called by the game; purely additive, no behaviour change.
export function advanceRenderClock(dt: number): void {
  renderTime += dt
}

// Persistence buffer for the vector scene (shell-only afterglow). Lazily builds
// its offscreen canvases on first beginScene/composite/clear.
const phosphor = createPhosphor()
let clawPrevLane: number | null = null
let walkPhase = 0

// Warp-dive starfield (Story 10-4): the lifecycle lives in the pure ./starfield
// model; render strokes its live planes as blue dots rushing out from centre.
const starfield = createStarfield()
const STAR_COLOR = '#7fc3ff' // blue star dots
// The 4 reused star "pictures": fixed unit directions from screen centre. Each
// plane scatters its picture's dots outward as it dives, so 8 planes share 4
// constellations (the book's "4 reused star pictures").
const STAR_PICTURE_DOTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[-0.8, -0.5], [0.3, -0.9], [0.9, 0.2], [-0.2, 0.7], [0.6, 0.6]],
  [[0.7, -0.4], [-0.6, -0.7], [-0.9, 0.3], [0.1, 0.9], [0.4, 0.1]],
  [[-0.5, 0.8], [0.8, -0.6], [0.2, -0.3], [-0.85, -0.15], [0.55, 0.75]],
  [[0.0, -0.95], [-0.7, 0.55], [0.95, 0.05], [-0.3, -0.4], [0.45, 0.85]],
]

// Step the starfield one frame and stroke every live plane. A plane's Z maps to
// a radial reach: far (Z≈STAR_SPAWN_Z) sits near centre, near (Z≈STAR_RETIRE_Z)
// flings its dots to the edges — the "flying down the tube" rush. Warp-only.
function drawStarfield(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  starfield.step()
  const cx = W / 2
  const cy = H / 2
  const reach = Math.hypot(W, H) * 0.6
  const span = STAR_SPAWN_Z - STAR_RETIRE_Z
  ctx.fillStyle = STAR_COLOR
  ctx.shadowColor = STAR_COLOR
  for (const plane of starfield.planes) {
    const t = (STAR_SPAWN_Z - plane.z) / span // 0 (far, centre) → 1 (near, edge)
    const r = t * reach
    const size = 0.6 + t * 1.8
    ctx.globalAlpha = 0.25 + t * 0.7
    ctx.shadowBlur = 4 + t * 8
    for (const [ux, uy] of STAR_PICTURE_DOTS[plane.picture]) {
      ctx.beginPath()
      ctx.arc(cx + ux * r, cy + uy * r, size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

// Boundary-safe index: closed tubes wrap, open tubes clamp. Mirrors the core's
// private boundaryIndex so spokes/rim highlights work on both tube families.
function bIndex(tube: Tube, i: number): number {
  if (tube.closed) {
    return ((i % tube.laneCount) + tube.laneCount) % tube.laneCount
  }
  return Math.max(0, Math.min(tube.far.length - 1, i))
}

function lerpP(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function radialUnit(p: Point): Point {
  const d = Math.hypot(p.x, p.y) || 1
  return { x: p.x / d, y: p.y / d }
}

function strokePoly(
  ctx: CanvasRenderingContext2D, pts: readonly Point[], closed: boolean,
): void {
  if (pts.length === 0) return
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  if (closed) ctx.closePath()
  ctx.stroke()
}

export function drawTube(
  ctx: CanvasRenderingContext2D, s: GameState, color: string, playerLane: number,
): void {
  const tube = s.tube
  // Spokes: per-boundary gradient, dim at the far rim → bright at the near rim.
  for (let i = 0; i < tube.far.length; i++) {
    const f = tube.far[i]
    const near = tube.near[i]
    const g = ctx.createLinearGradient(f.x, f.y, near.x, near.y)
    g.addColorStop(0, 'rgba(255,255,255,0.04)')
    g.addColorStop(1, color)
    ctx.strokeStyle = g
    ctx.lineWidth = 2
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(f.x, f.y)
    ctx.lineTo(near.x, near.y)
    ctx.stroke()
  }
  // Far ring (dim).
  ctx.lineWidth = 1.5
  ctx.shadowBlur = 6
  ctx.strokeStyle = 'rgba(150,190,255,0.28)'
  strokePoly(ctx, tube.far, tube.closed)
  // Near ring (bright rim).
  ctx.lineWidth = 3.5
  ctx.shadowColor = color
  ctx.shadowBlur = 18
  ctx.strokeStyle = color
  strokePoly(ctx, tube.near, tube.closed)
  // Rim vertex sparks.
  ctx.fillStyle = '#ffffff'
  ctx.shadowBlur = 12
  for (const p of tube.near) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  // Highlight the player's lane spokes (boundary-safe for open tubes).
  const ia = bIndex(tube, playerLane)
  const ib = bIndex(tube, playerLane + 1)
  const a = tube.near[ia]
  const b = tube.near[ib]
  const fa = tube.far[ia]
  const fb = tube.far[ib]
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.shadowColor = '#fff'
  ctx.shadowBlur = 10
  ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(a.x, a.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(fb.x, fb.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  // Vanishing-point glow (closed tubes converge on the center).
  if (tube.closed) {
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 24
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.arc(0, 0, 5 + Math.sin(renderTime * 3) * 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

export function drawSpikes(ctx: CanvasRenderingContext2D, s: GameState): void {
  // Spike line is GREEN in the authentic ROM (Story 10-7); the white tip dot below
  // is the ROM JADOT cap and stays white.
  ctx.strokeStyle = '#39ff14'
  ctx.shadowColor = '#39ff14'
  for (let lane = 0; lane < s.spikes.length; lane++) {
    const h = s.spikes[lane]
    if (h <= 0) continue
    const a = project(s.tube, lane, 0)
    const b = project(s.tube, lane, h)
    ctx.lineWidth = 2
    ctx.shadowBlur = 10
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    // Single white tip dot (Story 6-8): authentic ROM cap (JADOT: VCTR 0,0) —
    // one white point, no flicker. Supersedes the earlier purple barb.
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = '#ffffff'
    ctx.shadowBlur = 8
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.0, 0, Math.PI * 2); ctx.fill()
  }
}

// Player bullets render as the authentic two concentric dotted octagon rings
// (Story 6-8), with a short motion streak behind for the sense of travel.
function drawBullets(ctx: CanvasRenderingContext2D, s: GameState): void {
  // Story 10-8: the whole volley shares one CHACOU tint set by how many charges
  // are in flight this frame (the count is constant across these bullets). Only
  // the bullet body (glyph) is recoloured; the travel streak keeps its hue.
  const tint = playerBulletColor(s.bullets.length)
  for (const b of s.bullets) {
    const p = project(s.tube, b.lane, b.depth)
    const tail = project(s.tube, b.lane, Math.min(1, b.depth + 0.05))
    ctx.strokeStyle = '#eaffff'
    ctx.shadowColor = '#7fdfff'
    ctx.shadowBlur = 14
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    strokeGlyph(ctx, playerBulletGlyph(), p.x, p.y, 0.45 + b.depth * 0.35, renderTime * 5, 14, tint)
  }
}

// Enemy energy bolts (Story 6-5, glyph fidelity 6-8): the authentic white
// 4-hook pinwheel + red 4-dot cross, spinning through its 4 ROM frames as it
// rides down its lane toward the rim. Frame + rotation derive from depth so the
// spin stays deterministic with the sim.
function drawEnemyBullets(ctx: CanvasRenderingContext2D, s: GameState): void {
  for (const b of s.enemyBullets) {
    const p = project(s.tube, b.lane, b.depth)
    const scale = 0.4 + b.depth * 0.5 // grows as it nears the player
    strokeGlyph(ctx, enemyBoltGlyph(Math.floor(b.depth * 8)), p.x, p.y, scale, b.depth * Math.PI * 4, 12)
  }
}

// Enemies render as authentic rev-3 ROM vector glyphs (Story 6-8): the flipper
// bowtie, tanker X-diamond + cargo emblem, spiker pinwheel, fuseball ball-of-
// legs, and pulsar zig-zag bar — each animated through its glyph's frame arg.
export function drawEnemy(ctx: CanvasRenderingContext2D, s: GameState, e: Enemy): void {
  const tube = s.tube
  const p = project(tube, e.lane, e.depth)
  // Story 6-17: size enemies to the lane they ride, not a fixed pixel ramp. An
  // enemy is a fixed object in perspective, so its size is a constant fraction
  // of the lane width at its depth — tiny at the far vanishing point, ~full
  // width at the near rim. The flipper bowtie (8 glyph-units wide, drawn at
  // r/4) renders 8*(r/4) = 2r px, so r = 0.425*laneWidth fills ~85% of the lane
  // rail-to-rail; every other kind keeps its authentic Story 6-8 proportion via
  // the same r and its own divisor.
  const r = laneWidth(tube, e.lane, e.depth) * 0.425

  switch (e.kind) {
    case 'flipper': {
      // RED bowtie/butterfly. Authentic flippers do NOT idle-spin — a settled
      // one is a still bowtie spanning its lane rail-to-rail, so its wide (claw)
      // axis sits TANGENT to the rim (perpendicular to the lane's far->near
      // axis). Story 6-18: mid-flip it tumbles END-OVER-END, pivoting about the
      // shared web spoke (the rim vertex) between its lane and the adjacent
      // target — the arc carries it onto the next lane and rotates it over, so
      // it hand-over-hands around the rim instead of sliding with a centre-spin.
      const far = project(tube, e.lane, 0)
      const near = project(tube, e.lane, 1)
      const baseAngle = Math.atan2(near.y - far.y, near.x - far.x) + Math.PI / 2
      let fp = p
      let spin = baseAngle
      if (e.flipping) {
        const dir = e.flipDir ?? 1
        const pivot = flipPivot(tube, e.lane, dir, e.depth)
        const to = project(tube, e.lane + dir, e.depth)
        const t = e.flipProgress ?? 0
        const arc = arcAbout(p, to, pivot, t)
        fp = arc.pos
        spin = baseAngle + arc.swing * t
      }
      strokeGlyph(ctx, flipperGlyph(), fp.x, fp.y, r / 4, spin, 14)
      break
    }
    case 'tanker': {
      // X-diamond body + the emblem of whatever it splits into.
      strokeGlyph(ctx, tankerGlyph(e.contains), p.x, p.y, r / 9, 0, 14)
      break
    }
    case 'spiker': {
      // 4 spin frames cycled like the ROM's `timectr & 3`.
      strokeGlyph(ctx, spikerGlyph(Math.floor(renderTime * 8)), p.x, p.y, r / 6, 0, 12)
      break
    }
    case 'fuseball': {
      // 4 writhe frames — legs fully redrawn each frame.
      strokeGlyph(ctx, fuseballGlyph(Math.floor(renderTime * 12)), p.x, p.y, r / 9, 0, 16)
      break
    }
    case 'pulsar': {
      // Zig-zag bar whose jaggedness + colour strobe together while pulsing.
      const beat = e.pulsing ? 0.5 + 0.5 * Math.sin(renderTime * 18) : 0
      const variant = e.pulsing
        ? pulsarVariant(Math.floor((0.5 + 0.5 * Math.sin(renderTime * 12)) * 0xff))
        : 4 // flat bar when dormant
      const color = pulsarColor(e.pulsing && beat > 0.5)
      strokeGlyph(ctx, pulsarBar(variant), p.x, p.y, r / 4, 0, e.pulsing ? 22 + beat * 18 : 12, color)
      if (e.pulsing) {
        // Electrify the whole lane as a warning (boundary-safe quad).
        const i0 = bIndex(tube, e.lane)
        const i1 = bIndex(tube, e.lane + 1)
        const f0 = tube.far[i0]
        const f1 = tube.far[i1]
        const n0 = tube.near[i0]
        const n1 = tube.near[i1]
        ctx.globalAlpha = 0.12 + beat * 0.16
        ctx.fillStyle = GLYPH_HEX[color]
        ctx.shadowColor = GLYPH_HEX[color]
        ctx.shadowBlur = 16
        ctx.beginPath()
        ctx.moveTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y)
        ctx.lineTo(n1.x, n1.y); ctx.lineTo(n0.x, n0.y)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }
      break
    }
  }
}

export function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState): void {
  if (!s.player.alive) return
  const tube = s.tube
  const cont = s.player.lane

  // Walk cadence: a constant idle shuffle, faster the quicker you spin.
  let dl = 0
  if (clawPrevLane !== null) {
    const n = tube.laneCount
    dl = ((((cont - clawPrevLane + n / 2) % n) + n) % n) - n / 2
  }
  clawPrevLane = cont
  const speed = Math.min(0.5, Math.abs(dl))
  walkPhase += Math.min(0.5, 0.16 + speed * 1.2)

  const lane = currentLane(tube, cont)
  const a = tube.near[bIndex(tube, lane)]
  const b = tube.near[bIndex(tube, lane + 1)]

  // Legs lift in alternation → a stepping gait; body rocks toward the planted foot.
  const liftL = Math.max(0, Math.sin(walkPhase))
  const liftR = Math.max(0, Math.sin(walkPhase + Math.PI))
  const apex = project(tube, lane, 0.74 + Math.sin(walkPhase) * 0.05)
  const apexIn = project(tube, lane, 0.9)

  const ua = radialUnit(a)
  const ub = radialUnit(b)
  const footA = { x: a.x + ua.x * liftL * 10, y: a.y + ua.y * liftL * 10 }
  const footB = { x: b.x + ub.x * liftR * 10, y: b.y + ub.y * liftR * 10 }

  const kneeAbase = lerpP(a, apex, 0.5)
  const kneeBbase = lerpP(b, apex, 0.5)
  const uka = radialUnit(kneeAbase)
  const ukb = radialUnit(kneeBbase)
  const kneeA = { x: kneeAbase.x + uka.x * (4 + liftL * 16), y: kneeAbase.y + uka.y * (4 + liftL * 16) }
  const kneeB = { x: kneeBbase.x + ukb.x * (4 + liftR * 16), y: kneeBbase.y + ukb.y * (4 + liftR * 16) }

  ctx.globalAlpha = s.mode === 'dying' ? 0 : 1
  ctx.strokeStyle = CLAW_COLOR
  ctx.shadowColor = CLAW_COLOR
  ctx.shadowBlur = 18
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Two articulated legs: foot → knee → apex.
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(footA.x, footA.y); ctx.lineTo(kneeA.x, kneeA.y); ctx.lineTo(apex.x, apex.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(footB.x, footB.y); ctx.lineTo(kneeB.x, kneeB.y); ctx.lineTo(apex.x, apex.y); ctx.stroke()
  // Cross-brace body between the knees.
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(kneeA.x, kneeA.y); ctx.lineTo(kneeB.x, kneeB.y); ctx.stroke()
  // Inner muzzle chevron.
  const ka = lerpP(kneeA, apexIn, 0.4)
  const kb = lerpP(kneeB, apexIn, 0.4)
  ctx.beginPath(); ctx.moveTo(ka.x, ka.y); ctx.lineTo(apexIn.x, apexIn.y); ctx.lineTo(kb.x, kb.y); ctx.stroke()
  // Toe ticks splaying outward from each foot.
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(footA.x, footA.y); ctx.lineTo(footA.x + ua.x * 6, footA.y + ua.y * 6); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(footB.x, footB.y); ctx.lineTo(footB.x + ub.x * 6, footB.y + ub.y * 6); ctx.stroke()
  // Bright muzzle tip.
  ctx.fillStyle = '#fff'
  ctx.shadowBlur = 14
  ctx.beginPath(); ctx.arc(apexIn.x, apexIn.y, 2.6, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
}

function drawParticles(ctx: CanvasRenderingContext2D, fx: Fx): void {
  for (const p of fx.particles) {
    const t = Math.max(0, p.life / p.max)
    ctx.globalAlpha = t
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = 10
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 + t * 1.8, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

// Story 10-5: authentic vector explosions. The enemy burst is a 16-spoke star
// that doubles in size with a two-tier brightness; the player splat is a
// concentric jagged star that grows/shrinks while its colour cycles.
const ENEMY_BURST_BASE_LEN = 3 // spoke length at scale 1
const ENEMY_BURST_COLOR = '#ffe66b'

function drawEnemyBurst(ctx: CanvasRenderingContext2D, ex: EnemyBurst): void {
  const len = ENEMY_BURST_BASE_LEN * ex.scale
  const tail = Math.max(0.35, ex.life / ex.max) // gentle fade in the final frame
  ctx.globalAlpha = (ex.brightness / 15) * tail
  ctx.strokeStyle = ENEMY_BURST_COLOR
  ctx.shadowColor = ENEMY_BURST_COLOR
  ctx.shadowBlur = 8
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < ex.spokes; i++) {
    const a = (i / ex.spokes) * Math.PI * 2
    ctx.moveTo(ex.x, ex.y)
    ctx.lineTo(ex.x + Math.cos(a) * len, ex.y + Math.sin(a) * len)
  }
  ctx.stroke()
}

// One jagged star outline (alternating outer/inner radius) centred on (cx, cy).
function jaggedStarPath(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, points: number, outerR: number, innerR: number,
): void {
  ctx.beginPath()
  const steps = points * 2
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const r = i % 2 === 0 ? outerR : innerR
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
}

function drawPlayerSplat(ctx: CanvasRenderingContext2D, ex: PlayerSplat): void {
  if (ex.radius < 0.5) return
  ctx.globalAlpha = Math.max(0.25, ex.life / ex.max)
  ctx.strokeStyle = ex.color
  ctx.shadowColor = ex.color
  ctx.shadowBlur = 12
  ctx.lineWidth = 2
  // Two concentric jagged rings for the "concentric jagged star" splat.
  jaggedStarPath(ctx, ex.x, ex.y, ex.spokes, ex.radius, ex.radius * 0.45)
  ctx.stroke()
  jaggedStarPath(ctx, ex.x, ex.y, ex.spokes, ex.radius * 0.55, ex.radius * 0.25)
  ctx.stroke()
}

function drawExplosions(ctx: CanvasRenderingContext2D, fx: Fx): void {
  for (const ex of fx.explosions) {
    if (ex.kind === 'enemy') drawEnemyBurst(ctx, ex)
    else drawPlayerSplat(ctx, ex)
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

// A compact Claw glyph for the lives HUD and framing screens — the same
// chevron-with-crossbar silhouette the player ship and warp-dive Claw use,
// shrunk to an icon. Drawn around (cx, cy) in whatever space the caller is in.
function drawClawIcon(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string,
): void {
  const w = size
  const h = size * 0.85
  const lx = cx - w / 2
  const rx = cx + w / 2
  const apexY = cy - h / 2
  const baseY = cy + h / 2
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Two legs meeting at the muzzle apex.
  ctx.beginPath()
  ctx.moveTo(lx, baseY); ctx.lineTo(cx, apexY); ctx.lineTo(rx, baseY)
  ctx.stroke()
  // Cross-brace body.
  ctx.beginPath()
  ctx.moveTo(lx + w * 0.2, baseY - h * 0.32)
  ctx.lineTo(rx - w * 0.2, baseY - h * 0.32)
  ctx.stroke()
  // Bright muzzle tip.
  ctx.fillStyle = '#fff'
  ctx.shadowBlur = 8
  ctx.beginPath(); ctx.arc(cx, apexY, 1.6, 0, Math.PI * 2); ctx.fill()
}

// Draw stroke-vector text in the authentic VGMSGA font (src/shell/vecfont.ts) with
// the neon glow. `sizePx` is the cap height — the 24-unit glyph cell maps onto it.
// `align`/`vAlign` anchor the text box on (x,y). Two additive blurred passes (a
// wide bloom + a tighter inner glow) under a crisp core light the thin vectors up
// like neon without losing definition. The font is caps-only, so text is
// uppercased here (matches the ROM and keeps dynamic text consistent). save/
// restore keeps the 'lighter' blend / stroke state from leaking.
function vecText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, sizePx: number, color: string, blur: number,
  align: 'left' | 'center' | 'right' = 'center',
  vAlign: 'top' | 'middle' | 'bottom' = 'middle',
): void {
  const scale = sizePx / CELL_H
  const { strokes, width } = layoutText(text.toUpperCase())
  const w = width * scale
  const ox = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  // Glyph space is y-up with the baseline at 0; map to screen (y grows down).
  const baseY = vAlign === 'top' ? y + sizePx : vAlign === 'middle' ? y + sizePx / 2 : y
  const trace = (): void => {
    ctx.beginPath()
    for (const s of strokes) {
      s.points.forEach((p, i) => {
        const sx = ox + p.x * scale
        const sy = baseY - p.y * scale
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
    }
  }
  ctx.save()
  ctx.lineWidth = Math.max(1, sizePx / 18)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.shadowColor = color
  if (blur > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.shadowBlur = blur * 1.5
    trace(); ctx.stroke()
    ctx.shadowBlur = blur * 0.8
    trace(); ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.shadowBlur = 0
  trace(); ctx.stroke()
  ctx.restore()
}

// Centered glowing vector text (the common framing-screen case). `sizePx` is the
// cap height; text is vertically centered on `y`.
function drawGlowText(
  ctx: CanvasRenderingContext2D,
  text: string, cx: number, y: number, sizePx: number, color: string, blur: number,
): void {
  vecText(ctx, text, cx, y, sizePx, color, blur, 'center', 'middle')
}

// The high-score board (rank · initials · score), monospace-aligned and centered
// on cx. Shared by the attract and game-over screens.
function drawHighScoreTable(
  ctx: CanvasRenderingContext2D,
  table: HighScoreTable, cx: number, top: number, color: string, maxRows: number,
): void {
  // Self-contained: set our own text alignment rather than inheriting whatever a
  // prior drawGlowText left behind, and restore on exit so we leak no state.
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Authentic ROM: the HIGH SCORES header is red (Story 10-7), independent of the
  // level-cycling `color` still used for the top-rank row highlight below.
  drawGlowText(ctx, 'HIGH SCORES', cx, top, 20, '#ff2f4f', 14)
  if (table.length === 0) {
    drawGlowText(ctx, '- NO SCORES YET -', cx, top + 40, 18, 'rgba(150,190,255,0.6)', 0)
    ctx.restore()
    return
  }
  // The vector font is fixed-advance, so the padded rank/name/score columns line
  // up without a monospace face.
  for (let i = 0; i < Math.min(maxRows, table.length); i++) {
    const e = table[i]
    const rank = String(i + 1).padStart(2, ' ')
    const name = (e.name || '???').toUpperCase().slice(0, 3).padEnd(3, ' ')
    const score = String(e.score).padStart(7, '0')
    const rowColor = i === 0 ? color : '#cfe3ff'
    vecText(ctx, `${rank}   ${name}   ${score}`, cx, top + 36 + i * 26, 18, rowColor, i === 0 ? 14 : 10)
  }
  ctx.restore()
}

// Subtle CRT scanlines, drawn in raw screen space over everything else.
function drawScanlines(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(0,0,0,0.10)'
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
}

// A dark modal backdrop behind the framing text/table so they read with good
// contrast. MUST composite source-over: the scene is drawn additively
// ('lighter'), so a fill in that mode would brighten instead of darken. save/
// restore keeps the scrim from leaking compositing/alpha state to later draws.
function drawScrim(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

function drawAttract(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  // Backdrop behind the title + high-score table for consistent contrast (and a
  // safety net should the playing scene ever leak through here again — see 4-2 F1).
  drawScrim(ctx, W, H)
  // Title as the approaching rainbow (Story 10-6): TEMPEST stacked across ~19
  // depth passes from the far horizon to the viewer, each a rainbow colour, the
  // whole stack marching forward every frame (the book's SCARNG/LOGPRO
  // "approaching logo process"). renderTime drives the advance so it animates;
  // far passes draw first (behind) small and faint, near passes large and bright.
  const titleY = H * 0.18
  for (const pass of titleLogoPasses(renderTime * LOGO_RAINBOW_SPEED)) {
    const size = Math.max(1, Math.round(TITLE_BASE_PX * pass.scale))
    ctx.globalAlpha = 0.35 + 0.65 * pass.depth
    drawGlowText(ctx, 'TEMPEST', W / 2, titleY, size, pass.color, 8 + Math.round(20 * pass.depth))
  }
  ctx.globalAlpha = 1
  drawGlowText(ctx, 'A VECTOR ARENA', W / 2, H * 0.18 + 74, 16, 'rgba(150,190,255,0.7)', 8)
  drawHighScoreTable(ctx, s.highScoreTable, W / 2, H * 0.42, color, 10)
  const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
  ctx.globalAlpha = blink
  drawGlowText(ctx, 'PRESS START', W / 2, H * 0.86, 26, '#ff2f4f', 18)
  ctx.globalAlpha = 1
  drawGlowText(
    ctx, 'CLICK OR ENTER TO START - SPINNER + SPACE TO PLAY', W / 2, H * 0.86 + 34,
    13, 'rgba(150,190,255,0.6)', 0,
  )
}

function drawSelect(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  // Authentic skill-select framing (Story 10-9): the ROM's RATE YOURSELF / RANK
  // screen with a NOVICE→EXPERT skill ladder flanking the chooser. Colors come
  // from the 1981 Messages table — RATE YOURSELF is GREEN, RANK/NOVICE/EXPERT RED.
  drawGlowText(ctx, 'RATE YOURSELF', W / 2, H * 0.13, 40, '#39ff14', 22)
  drawGlowText(ctx, 'RANK', W / 2, H * 0.13 + 38, 16, '#ff2f4f', 8)
  drawGlowText(ctx, 'SELECT START LEVEL', W / 2, H * 0.3, 26, color, 14)
  drawGlowText(
    ctx, `START LEVEL  ${String(s.select.selectedLevel).padStart(2, '0')}`, W / 2, H * 0.5,
    64, CLAW_COLOR, 26,
  )
  // Skill ladder flanking the chooser: NOVICE (easiest) … EXPERT (hardest).
  drawGlowText(ctx, 'NOVICE', W * 0.17, H * 0.5, 18, '#ff2f4f', 8)
  drawGlowText(ctx, 'EXPERT', W * 0.83, H * 0.5, 18, '#ff2f4f', 8)
  drawGlowText(ctx, 'SPIN OR ARROW KEYS TO CHANGE', W / 2, H * 0.72, 16, 'rgba(150,190,255,0.7)', 6)
  const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
  ctx.globalAlpha = blink
  drawGlowText(ctx, 'PRESS START / ENTER TO BEGIN', W / 2, H * 0.72 + 32, 18, color, 12)
  ctx.globalAlpha = 1
}

function drawEntry(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  drawGlowText(ctx, 'NEW HIGH SCORE', W / 2, H * 0.2, 44, color, 24)
  const entry = s.entry
  if (!entry) {
    // Defensive: 'highscore' mode should always carry an entry.
    drawGlowText(ctx, 'ENTER YOUR INITIALS', W / 2, H * 0.5, 24, CLAW_COLOR, 14)
    return
  }
  drawGlowText(
    ctx, `SCORE  ${String(s.score).padStart(6, '0')}`, W / 2, H * 0.34,
    22, '#cfe3ff', 10,
  )
  // Three initial slots: confirmed chars, the active letter (highlighted), blanks.
  const slotW = 84
  const startX = W / 2 - slotW
  const y = H * 0.54
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 3; i++) {
    const x = startX + i * slotW
    let ch = '_'
    let active = false
    if (i < entry.charIndex) ch = entry.initials[i] ?? '_'
    else if (i === entry.charIndex) { ch = entry.currentLetter; active = true }
    if (active) {
      drawGlowText(ctx, ch, x, y, 64, CLAW_COLOR, 22)
      ctx.strokeStyle = CLAW_COLOR
      ctx.shadowColor = CLAW_COLOR
      ctx.shadowBlur = 14
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x - 26, y + 44); ctx.lineTo(x + 26, y + 44); ctx.stroke()
    } else {
      const dim = ch === '_'
      drawGlowText(
        ctx, ch, x, y, 64,
        dim ? 'rgba(150,190,255,0.4)' : color, dim ? 0 : 12,
      )
    }
  }
  const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
  ctx.globalAlpha = blink
  drawGlowText(
    ctx, 'SPIN TO CHANGE - START TO CONFIRM', W / 2, H * 0.78,
    16, 'rgba(150,190,255,0.7)', 6,
  )
  ctx.globalAlpha = 1
}

// Framing-screen dispatcher: owns the whole frame for non-scene modes.
function drawFrame(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.textBaseline = 'middle'
  switch (s.mode) {
    case 'attract': drawAttract(ctx, s, W, H, color); break
    case 'select': drawSelect(ctx, s, W, H, color); break
    case 'highscore': drawEntry(ctx, s, W, H, color); break
  }
  ctx.shadowBlur = 0
}

function drawHud(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  ctx.shadowBlur = 0
  // HUD readouts: 22px score/level/hi numbers; 13px captions in bright steel-blue
  // (the thin vector stroke is fragile small) with a touch of glow. Anchored to the
  // top edge (vAlign 'top') so the numbers tuck under the screen edge as before.
  const LABEL_COLOR = 'rgba(175,210,255,0.9)'
  // Score (left).
  vecText(ctx, String(s.score).padStart(6, '0'), 26, 22, 22, color, 12, 'left', 'top')
  vecText(ctx, 'SCORE', 26, 50, 13, LABEL_COLOR, 5, 'left', 'top')
  // Level (right).
  vecText(ctx, String(s.level).padStart(2, '0'), W - 26, 22, 22, color, 12, 'right', 'top')
  vecText(ctx, 'LEVEL', W - 26, 50, 13, LABEL_COLOR, 5, 'right', 'top')
  // High score (top center): the leading board entry, or 0 when the board is empty.
  const hi = s.highScoreTable.length ? s.highScoreTable[0].score : 0
  vecText(ctx, String(hi).padStart(6, '0'), W / 2, 22, 22, color, 12, 'center', 'top')
  vecText(ctx, 'HI-SCORE', W / 2, 50, 13, LABEL_COLOR, 5, 'center', 'top')
  // Remaining lives as little Claw-icon glyphs (the player ship in miniature).
  for (let i = 0; i < s.lives; i++) {
    drawClawIcon(ctx, 36 + i * 26, H - 30, 18, CLAW_COLOR)
  }

  if (s.mode === 'gameover') {
    // Dim the still-drawn play scene so the overlay text + high-score table read
    // clearly instead of fighting the tube/enemies behind them.
    drawScrim(ctx, W, H)
    drawGlowText(ctx, 'GAME OVER', W / 2, H * 0.28, 64, '#39ff14', 26)
    drawGlowText(
      ctx, `FINAL SCORE  ${String(s.score).padStart(6, '0')}`, W / 2, H * 0.28 + 50,
      22, '#cfe3ff', 12,
    )
    drawHighScoreTable(ctx, s.highScoreTable, W / 2, H * 0.46, color, 8)
    const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
    ctx.globalAlpha = blink
    drawGlowText(
      ctx, 'CLICK OR PRESS ENTER TO PLAY AGAIN', W / 2, H * 0.84,
      18, '#cfe3ff', 14,
    )
    ctx.globalAlpha = 1
  }
}

// End-of-level warp: the Claw dives down its lane from the near rim toward the
// vanishing point as warp.progress goes 0 -> 1 (mirrors the core's
// warpClawDepth = 1 - progress). Speed streaks rush outward along every spoke
// for the "flying down the tube" sensation; spikes stay drawn (by the caller)
// so the 3-3 spike crash reads on screen.
function drawWarp(ctx: CanvasRenderingContext2D, s: GameState, color: string): void {
  const tube = s.tube
  const progress = Math.max(0, Math.min(1, s.warp.progress))

  // Speed streaks along each spoke, faster and brighter as the warp progresses.
  const speed = 1.5 + progress * 4
  const streaks = 3
  const segLen = 0.14
  ctx.strokeStyle = color
  ctx.shadowColor = color
  for (let i = 0; i < tube.far.length; i++) {
    const f = tube.far[i]
    const n = tube.near[i]
    for (let k = 0; k < streaks; k++) {
      const t = (((renderTime * speed + k / streaks) % 1) + 1) % 1
      const a = lerpP(f, n, t)
      const b = lerpP(f, n, Math.min(1, t + segLen))
      ctx.globalAlpha = 0.15 + t * 0.6
      ctx.lineWidth = 1 + t * 2.5
      ctx.shadowBlur = 6 + t * 12
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  // The diving Claw, on the player's (still-rotatable) lane.
  const lane = currentLane(tube, s.player.lane)
  const clawDepth = 1 - progress
  const rim = project(tube, lane, 1)
  const p = project(tube, lane, clawDepth)

  // Dive trail from the rim down to the current Claw position.
  ctx.strokeStyle = CLAW_COLOR
  ctx.shadowColor = CLAW_COLOR
  ctx.globalAlpha = 0.25
  ctx.lineWidth = 2
  ctx.shadowBlur = 10
  ctx.beginPath(); ctx.moveTo(rim.x, rim.y); ctx.lineTo(p.x, p.y); ctx.stroke()
  ctx.globalAlpha = 1

  // Claw glyph: muzzle points inward (toward the vanishing point), shrinks with depth.
  const inward = project(tube, lane, Math.max(0, clawDepth - 0.1))
  const outward = project(tube, lane, Math.min(1, clawDepth + 0.1))
  let ux = outward.x - inward.x
  let uy = outward.y - inward.y
  const ulen = Math.hypot(ux, uy) || 1
  ux /= ulen
  uy /= ulen
  const wx = -uy
  const wy = ux
  const size = 6 + clawDepth * 14
  const apex = { x: p.x - ux * size * 0.8, y: p.y - uy * size * 0.8 }
  const footL = { x: p.x + wx * size + ux * size * 0.4, y: p.y + wy * size + uy * size * 0.4 }
  const footR = { x: p.x - wx * size + ux * size * 0.4, y: p.y - wy * size + uy * size * 0.4 }

  ctx.strokeStyle = CLAW_COLOR
  ctx.shadowColor = CLAW_COLOR
  ctx.shadowBlur = 16
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(footL.x, footL.y); ctx.lineTo(apex.x, apex.y); ctx.lineTo(footR.x, footR.y)
  ctx.stroke()
  ctx.beginPath(); ctx.moveTo(footL.x, footL.y); ctx.lineTo(footR.x, footR.y); ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.shadowBlur = 14
  ctx.beginPath(); ctx.arc(apex.x, apex.y, 2.4, 0, Math.PI * 2); ctx.fill()
}

export function render(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  W: number,
  H: number,
  fx: Fx,
  dpr: number,
  dt: number,
): void {
  renderTime += 1 / 60
  // Background (work in CSS pixels; the DPR scale makes it crisp).
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  // Radial vignette glow toward center.
  const vg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6)
  vg.addColorStop(0, 'rgba(20,40,80,0.18)')
  vg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, H)

  const color = LEVEL_COLORS[(s.level - 1) % LEVEL_COLORS.length]

  // Framing screens own the whole frame: draw them and SUPPRESS the (now stale)
  // playing scene entirely. This is the 4-2 F1 fix — on boot/attract and after
  // gameover→attract the renderer used to leak a ghost tube + frozen enemies.
  if (s.mode === 'attract' || s.mode === 'select' || s.mode === 'highscore') {
    drawFrame(ctx, s, W, H, color)
    drawScanlines(ctx, W, H)
    ctx.shadowBlur = 0
    phosphor.clear()
    return
  }

  // Draw the vector scene into the phosphor scratch (full brightness), fold it
  // into the persistence accumulator as an EMA, and blit that onto the main
  // canvas. Static geometry stays sharp; fast movers trail. The screen shake is
  // applied by composite() to the whole accumulated image.
  const pctx = phosphor.beginScene(W, H, dpr)
  drawTube(pctx, s, color, currentLane(s.tube, s.player.lane))
  drawSpikes(pctx, s)
  if (s.mode === 'warp') {
    // Diving-Claw warp transition; spikes above stay drawn so a crash reads.
    // The 8-plane starfield streams out behind the Claw for the dive spectacle.
    drawStarfield(pctx, W, H)
    drawWarp(pctx, s, color)
  } else {
    // Not warping — clear the starfield so the next dive starts from centre.
    starfield.reset()
    // Far enemies first so near ones overdraw them.
    const ordered = s.enemies.slice().sort((a, b) => a.depth - b.depth)
    for (const e of ordered) drawEnemy(pctx, s, e)
    drawBullets(pctx, s)
    drawEnemyBullets(pctx, s)
    drawPlayer(pctx, s)
  }
  drawParticles(pctx, fx)
  drawExplosions(pctx, fx)
  phosphor.composite(ctx, dpr, phosphorAlpha(PHOSPHOR_DECAY, dt), fx.shake)

  // Overlays (scanlines/flash/HUD) draw in CSS-pixel space with normal blending.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1

  // Subtle CRT scanlines.
  drawScanlines(ctx, W, H)

  // Hit/death flash.
  if (fx.flash > 0) {
    ctx.fillStyle = fx.flashColor
    ctx.globalAlpha = fx.flash * 0.35
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }

  // AVOID SPIKES countdown (Story 6-1): while the warp holds the Claw at the rim,
  // flash the warning so the player knows to rotate off a spiked lane. Blinks via
  // renderTime; the dive (warning === 0) clears it automatically.
  if (s.mode === 'warp' && s.warp.warning > 0 && Math.floor(renderTime * 4) % 2 === 0) {
    drawGlowText(ctx, 'AVOID SPIKES', W / 2, H * 0.32, 28, '#ffffff', 18)
    ctx.shadowBlur = 0
  }

  // Between-wave BONUS / TIME tally (Story 10-9): on the level-clear warp dive,
  // flash the authentic bonus banners. Both GREEN per the 1981 Messages table.
  // (Numeric tallies are a later-story concern; this lands the banners.)
  if (s.mode === 'warp') {
    drawGlowText(ctx, 'BONUS', W / 2, H * 0.16, 40, '#39ff14', 20)
    drawGlowText(ctx, 'TIME', W / 2, H * 0.16 + 38, 20, '#39ff14', 10)
    ctx.shadowBlur = 0
  }

  // SUPERZAPPER RECHARGE (Story 10-9): the Superzapper rearms to 'full' on each
  // new level — flash the authentic recharge banner for ~2 s when the level
  // changes. BLUE per the 1981 Messages table; blinks via renderTime like AVOID
  // SPIKES. Latch is render-only (keyed on s.level), no new core/sim state.
  if (s.mode === 'playing' && s.level !== superzapBannerLevel) {
    superzapBannerLevel = s.level
    superzapBannerUntil = renderTime + 2
  }
  if (
    s.mode === 'playing' && s.player.superzapper === 'full'
    && renderTime < superzapBannerUntil && Math.floor(renderTime * 4) % 2 === 0
  ) {
    drawGlowText(ctx, 'SUPERZAPPER RECHARGE', W / 2, H * 0.68, 26, '#1f8fff', 16)
    ctx.shadowBlur = 0
  }

  drawHud(ctx, s, W, H, color)
  ctx.shadowBlur = 0
}
