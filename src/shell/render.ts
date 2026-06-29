// src/shell/render.ts
import { GameState, Enemy } from '../core/state'
import { HighScoreTable } from '../core/highscore'
import { Tube, Point, currentLane, project, laneWidth } from '../core/geometry'
import { Fx } from './fx'
import { createPhosphor, phosphorAlpha } from './phosphor'
import {
  flipperGlyph, tankerGlyph, spikerGlyph, fuseballGlyph,
  pulsarBar, pulsarVariant, pulsarColor, enemyBoltGlyph, playerBulletGlyph,
  type Glyph, type GlyphColor,
} from './glyphs'

// Per-level color cycling — index by (level-1) mod palette length.
const LEVEL_COLORS = [
  '#1f8fff', '#ff2f4f', '#ffd400', '#23e8a6',
  '#b14cff', '#00d6ff', '#ff7a18', '#46ff5a',
]
const CLAW_COLOR = '#ffe600'

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

// Persistence buffer for the vector scene (shell-only afterglow). Lazily builds
// its offscreen canvases on first beginScene/composite/clear.
const phosphor = createPhosphor()
let clawPrevLane: number | null = null
let walkPhase = 0

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

function drawTube(
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

function drawSpikes(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.strokeStyle = '#9b30ff'
  ctx.shadowColor = '#9b30ff'
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
  for (const b of s.bullets) {
    const p = project(s.tube, b.lane, b.depth)
    const tail = project(s.tube, b.lane, Math.min(1, b.depth + 0.05))
    ctx.strokeStyle = '#eaffff'
    ctx.shadowColor = '#7fdfff'
    ctx.shadowBlur = 14
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    strokeGlyph(ctx, playerBulletGlyph(), p.x, p.y, 0.45 + b.depth * 0.35, renderTime * 5, 14)
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
function drawEnemy(ctx: CanvasRenderingContext2D, s: GameState, e: Enemy): void {
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
      // RED bowtie/butterfly. Mid-flip (6-14) it SLIDES from its source lane to
      // the adjacent target, tumbling a half-turn across the flip; settled, it
      // sits on its lane with the idle runtime spin.
      let fp = p
      let spin = renderTime * 4 + e.lane
      if (e.flipping) {
        const to = project(tube, e.lane + (e.flipDir ?? 1), e.depth)
        const t = e.flipProgress ?? 0
        fp = { x: p.x + (to.x - p.x) * t, y: p.y + (to.y - p.y) * t }
        spin += t * Math.PI
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

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState): void {
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

// Draw `text` at (x, y) with a neon bloom and return the cursor untouched.
// Vector Battle's thin monoline strokes carry far less "ink" than the old bold
// face, so a single glow pass reads dim. Stack two additive blurred passes (a
// wide bloom + a tighter inner glow) under a crisp core so the thin vectors light
// up like neon without losing definition. Respects the caller's current font /
// textAlign / textBaseline; save/restore keeps the 'lighter' blend from leaking.
function glowText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, color: string, blur: number,
): void {
  // Tracking: Vector Battle is a tight vector face, so add ~0.1em letter-spacing
  // for an airy arcade-marquee look that also helps the thin caps read. Derived
  // from the current font's px size so every text size gets proportional spacing.
  // textAlign keeps centred/right text correctly positioned with tracking applied.
  const px = /(\d+(?:\.\d+)?)px/.exec(ctx.font)
  ctx.letterSpacing = `${((px ? parseFloat(px[1]) : 16) * 0.1).toFixed(2)}px`
  ctx.fillStyle = color
  ctx.shadowColor = color
  if (blur > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.shadowBlur = blur * 1.5
    ctx.fillText(text, x, y)
    ctx.shadowBlur = blur * 0.8
    ctx.fillText(text, x, y)
    ctx.restore()
  }
  ctx.shadowBlur = 0
  ctx.fillText(text, x, y)
}

// Centered glowing vector-style text in screen space. Vector Battle is caps-only,
// so uppercase here keeps the fallback fonts in caps and any dynamic text (e.g.
// initials) consistent.
function drawGlowText(
  ctx: CanvasRenderingContext2D,
  text: string, cx: number, y: number, font: string, color: string, blur: number,
): void {
  ctx.textAlign = 'center'
  ctx.font = font
  glowText(ctx, text.toUpperCase(), cx, y, color, blur)
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
  drawGlowText(ctx, 'HIGH SCORES', cx, top, "700 20px 'Vector Battle', 'Orbitron', monospace", color, 14)
  if (table.length === 0) {
    drawGlowText(
      ctx, '- NO SCORES YET -', cx, top + 40,
      "500 18px 'Vector Battle', 'Orbitron', monospace", 'rgba(150,190,255,0.6)', 0,
    )
    ctx.restore()
    return
  }
  ctx.font = "500 18px 'Vector Battle', 'Orbitron', monospace"
  for (let i = 0; i < Math.min(maxRows, table.length); i++) {
    const e = table[i]
    const rank = String(i + 1).padStart(2, ' ')
    const name = (e.name || '???').toUpperCase().slice(0, 3).padEnd(3, ' ')
    const score = String(e.score).padStart(7, '0')
    const rowColor = i === 0 ? color : '#cfe3ff'
    glowText(ctx, `${rank}   ${name}   ${score}`, cx, top + 36 + i * 26, rowColor, i === 0 ? 14 : 10)
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
  drawGlowText(ctx, 'TEMPEST', W / 2, H * 0.18, "900 96px 'Vector Battle', 'Orbitron', monospace", color, 30)
  drawGlowText(
    ctx, 'A VECTOR ARENA', W / 2, H * 0.18 + 74,
    "500 16px 'Vector Battle', 'Orbitron', monospace", 'rgba(150,190,255,0.7)', 8,
  )
  drawHighScoreTable(ctx, s.highScoreTable, W / 2, H * 0.42, color, 10)
  const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
  ctx.globalAlpha = blink
  drawGlowText(ctx, 'PRESS START', W / 2, H * 0.86, "700 26px 'Vector Battle', 'Orbitron', monospace", CLAW_COLOR, 18)
  ctx.globalAlpha = 1
  drawGlowText(
    ctx, 'CLICK OR ENTER TO START - SPINNER + SPACE TO PLAY', W / 2, H * 0.86 + 34,
    "500 13px 'Vector Battle', 'Orbitron', monospace", 'rgba(150,190,255,0.6)', 0,
  )
}

function drawSelect(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  drawGlowText(ctx, 'SELECT START LEVEL', W / 2, H * 0.28, "700 30px 'Vector Battle', 'Orbitron', monospace", color, 16)
  drawGlowText(
    ctx, `START LEVEL  ${String(s.select.selectedLevel).padStart(2, '0')}`, W / 2, H * 0.5,
    "900 72px 'Vector Battle', 'Orbitron', monospace", CLAW_COLOR, 28,
  )
  drawGlowText(
    ctx, 'SPIN OR ARROW KEYS TO CHANGE', W / 2, H * 0.72,
    "500 16px 'Vector Battle', 'Orbitron', monospace", 'rgba(150,190,255,0.7)', 6,
  )
  const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
  ctx.globalAlpha = blink
  drawGlowText(
    ctx, 'PRESS START / ENTER TO BEGIN', W / 2, H * 0.72 + 32,
    "700 18px 'Vector Battle', 'Orbitron', monospace", color, 12,
  )
  ctx.globalAlpha = 1
}

function drawEntry(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  drawGlowText(ctx, 'NEW HIGH SCORE', W / 2, H * 0.2, "900 44px 'Vector Battle', 'Orbitron', monospace", color, 24)
  const entry = s.entry
  if (!entry) {
    // Defensive: 'highscore' mode should always carry an entry.
    drawGlowText(ctx, 'ENTER YOUR INITIALS', W / 2, H * 0.5, "700 24px 'Vector Battle', 'Orbitron', monospace", CLAW_COLOR, 14)
    return
  }
  drawGlowText(
    ctx, `SCORE  ${String(s.score).padStart(6, '0')}`, W / 2, H * 0.34,
    "700 22px 'Vector Battle', 'Orbitron', monospace", '#cfe3ff', 10,
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
      drawGlowText(ctx, ch, x, y, "900 64px 'Vector Battle', 'Orbitron', monospace", CLAW_COLOR, 22)
      ctx.strokeStyle = CLAW_COLOR
      ctx.shadowColor = CLAW_COLOR
      ctx.shadowBlur = 14
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x - 26, y + 44); ctx.lineTo(x + 26, y + 44); ctx.stroke()
    } else {
      const dim = ch === '_'
      drawGlowText(
        ctx, ch, x, y, "900 64px 'Vector Battle', 'Orbitron', monospace",
        dim ? 'rgba(150,190,255,0.4)' : color, dim ? 0 : 12,
      )
    }
  }
  const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
  ctx.globalAlpha = blink
  drawGlowText(
    ctx, 'SPIN TO CHANGE - START TO CONFIRM', W / 2, H * 0.78,
    "500 16px 'Vector Battle', 'Orbitron', monospace", 'rgba(150,190,255,0.7)', 6,
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
  ctx.textBaseline = 'top'
  // Labels: the thin face is fragile small, so render the HUD captions at 13px
  // (up from 11) in a bright steel-blue with a touch of glow for legibility.
  const NUM_FONT = "700 22px 'Vector Battle', 'Orbitron', monospace"
  const LABEL_FONT = "700 13px 'Vector Battle', 'Orbitron', monospace"
  const LABEL_COLOR = 'rgba(175,210,255,0.9)'
  // Score (left).
  ctx.textAlign = 'left'
  ctx.font = NUM_FONT
  glowText(ctx, String(s.score).padStart(6, '0'), 26, 22, color, 12)
  ctx.font = LABEL_FONT
  glowText(ctx, 'SCORE', 26, 50, LABEL_COLOR, 5)
  // Level (right).
  ctx.textAlign = 'right'
  ctx.font = NUM_FONT
  glowText(ctx, String(s.level).padStart(2, '0'), W - 26, 22, color, 12)
  ctx.font = LABEL_FONT
  glowText(ctx, 'LEVEL', W - 26, 50, LABEL_COLOR, 5)
  // High score (top center): the leading board entry, or 0 when the board is empty.
  const hi = s.highScoreTable.length ? s.highScoreTable[0].score : 0
  ctx.textAlign = 'center'
  ctx.font = NUM_FONT
  glowText(ctx, String(hi).padStart(6, '0'), W / 2, 22, color, 12)
  ctx.font = LABEL_FONT
  glowText(ctx, 'HI-SCORE', W / 2, 50, LABEL_COLOR, 5)
  // Remaining lives as little Claw-icon glyphs (the player ship in miniature).
  for (let i = 0; i < s.lives; i++) {
    drawClawIcon(ctx, 36 + i * 26, H - 30, 18, CLAW_COLOR)
  }

  if (s.mode === 'gameover') {
    // Dim the still-drawn play scene so the overlay text + high-score table read
    // clearly instead of fighting the tube/enemies behind them.
    drawScrim(ctx, W, H)
    ctx.textBaseline = 'middle'
    drawGlowText(ctx, 'GAME OVER', W / 2, H * 0.28, "900 64px 'Vector Battle', 'Orbitron', monospace", '#ff3b5c', 26)
    drawGlowText(
      ctx, `FINAL SCORE  ${String(s.score).padStart(6, '0')}`, W / 2, H * 0.28 + 50,
      "700 22px 'Vector Battle', 'Orbitron', monospace", '#cfe3ff', 12,
    )
    drawHighScoreTable(ctx, s.highScoreTable, W / 2, H * 0.46, color, 8)
    const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
    ctx.globalAlpha = blink
    drawGlowText(
      ctx, 'CLICK OR PRESS ENTER TO PLAY AGAIN', W / 2, H * 0.84,
      "500 18px 'Vector Battle', 'Orbitron', monospace", '#cfe3ff', 14,
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
    drawWarp(pctx, s, color)
  } else {
    // Far enemies first so near ones overdraw them.
    const ordered = s.enemies.slice().sort((a, b) => a.depth - b.depth)
    for (const e of ordered) drawEnemy(pctx, s, e)
    drawBullets(pctx, s)
    drawEnemyBullets(pctx, s)
    drawPlayer(pctx, s)
  }
  drawParticles(pctx, fx)
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
    drawGlowText(ctx, 'AVOID SPIKES', W / 2, H * 0.32, "700 28px 'Vector Battle', 'Orbitron', monospace", '#ff5a3c', 18)
    ctx.shadowBlur = 0
  }

  drawHud(ctx, s, W, H, color)
  ctx.shadowBlur = 0
}
