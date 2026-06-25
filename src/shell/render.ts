// src/shell/render.ts
import { GameState, Enemy } from '../core/state'
import { Tube, Point, currentLane, project } from '../core/geometry'
import { Fx } from './fx'

// Per-level color cycling — index by (level-1) mod palette length.
const LEVEL_COLORS = [
  '#1f8fff', '#ff2f4f', '#ffd400', '#23e8a6',
  '#b14cff', '#00d6ff', '#ff7a18', '#46ff5a',
]
const CLAW_COLOR = '#ffe600'
const ENEMY_COLOR: Record<Enemy['kind'], string> = {
  flipper: '#ff2bd6',
  tanker: '#39ff14',
  spiker: '#ffa500',
  fuseball: '#ff4b3e',
  pulsar: '#00e5ff',
}

// Animation accumulators (render-only; never feeds back into the sim).
let renderTime = 0
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
    // Barbed tip.
    ctx.fillStyle = '#c98bff'
    ctx.shadowBlur = 8
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2); ctx.fill()
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, s: GameState): void {
  for (const b of s.bullets) {
    const p = project(s.tube, b.lane, b.depth)
    const tail = project(s.tube, b.lane, Math.min(1, b.depth + 0.05))
    ctx.strokeStyle = '#eaffff'
    ctx.shadowColor = '#7fdfff'
    ctx.shadowBlur = 14
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.shadowBlur = 16
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill()
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, s: GameState, e: Enemy): void {
  const tube = s.tube
  const p = project(tube, e.lane, e.depth)
  const r = 5 + e.depth * 10
  const color = ENEMY_COLOR[e.kind]
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.lineWidth = 2

  switch (e.kind) {
    case 'flipper': {
      // Spinning bow-tie / pinwheel.
      const rot = renderTime * 4 + e.lane
      ctx.shadowBlur = 14
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.moveTo(-r, -r * 0.7)
      ctx.lineTo(r, -r * 0.7)
      ctx.lineTo(-r, r * 0.7)
      ctx.lineTo(r, r * 0.7)
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'tanker': {
      ctx.shadowBlur = 14
      ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2)
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.7
      ctx.strokeRect(p.x - r * 0.5, p.y - r * 0.5, r, r)
      ctx.globalAlpha = 1
      break
    }
    case 'spiker': {
      const rot = renderTime * 5
      ctx.shadowBlur = 12
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0)
      ctx.moveTo(0, -r); ctx.lineTo(0, r)
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'fuseball': {
      ctx.shadowBlur = 18
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.62, 0, Math.PI * 2); ctx.fill()
      // Crackling sparks.
      ctx.strokeStyle = '#ffd0c8'
      ctx.lineWidth = 1.4
      ctx.shadowBlur = 10
      for (let k = 0; k < 5; k++) {
        const a = renderTime * 7 + k * ((Math.PI * 2) / 5)
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + Math.cos(a) * r * 1.15, p.y + Math.sin(a) * r * 1.15)
        ctx.stroke()
      }
      break
    }
    case 'pulsar': {
      const beat = e.pulsing ? 0.5 + 0.5 * Math.sin(renderTime * 18) : 0
      ctx.shadowBlur = e.pulsing ? 22 + beat * 18 : 12
      ctx.lineWidth = e.pulsing ? 3 + beat * 2 : 2
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke()
      if (e.pulsing) {
        // Electrify the whole lane as a warning (boundary-safe quad).
        const i0 = bIndex(tube, e.lane)
        const i1 = bIndex(tube, e.lane + 1)
        const f0 = tube.far[i0]
        const f1 = tube.far[i1]
        const n0 = tube.near[i0]
        const n1 = tube.near[i1]
        ctx.globalAlpha = 0.12 + beat * 0.16
        ctx.fillStyle = color
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

function drawHud(
  ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, color: string,
): void {
  ctx.shadowBlur = 0
  ctx.textBaseline = 'top'
  // Score (left).
  ctx.font = "700 22px 'Orbitron', monospace"
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 14
  ctx.fillText(String(s.score).padStart(6, '0'), 26, 22)
  ctx.font = "500 11px 'Orbitron', monospace"
  ctx.fillStyle = 'rgba(150,190,255,0.6)'
  ctx.shadowBlur = 0
  ctx.fillText('SCORE', 26, 50)
  // Level (right).
  ctx.textAlign = 'right'
  ctx.font = "700 22px 'Orbitron', monospace"
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 14
  ctx.fillText(String(s.level).padStart(2, '0'), W - 26, 22)
  ctx.font = "500 11px 'Orbitron', monospace"
  ctx.fillStyle = 'rgba(150,190,255,0.6)'
  ctx.shadowBlur = 0
  ctx.fillText('LEVEL', W - 26, 50)
  // Lives as little claw glyphs.
  ctx.shadowColor = CLAW_COLOR
  ctx.shadowBlur = 10
  ctx.strokeStyle = CLAW_COLOR
  ctx.lineWidth = 2
  for (let i = 0; i < s.lives; i++) {
    const x = 28 + i * 26
    const y = H - 30
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y - 11); ctx.lineTo(x + 16, y); ctx.stroke()
  }

  if (s.mode === 'gameover') {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ff3b5c'
    ctx.shadowColor = '#ff3b5c'
    ctx.shadowBlur = 26
    ctx.font = "900 64px 'Orbitron', monospace"
    ctx.fillText('GAME OVER', W / 2, H / 2 - 70)
    ctx.fillStyle = '#cfe3ff'
    ctx.shadowColor = '#6da8ff'
    ctx.shadowBlur = 14
    ctx.font = "500 18px 'Orbitron', monospace"
    ctx.fillText('CLICK OR PRESS ENTER TO PLAY AGAIN', W / 2, H / 2 + 10)
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
  const scale = Math.min(W, H) / 720
  const sx = (Math.random() - 0.5) * fx.shake
  const sy = (Math.random() - 0.5) * fx.shake

  ctx.save()
  ctx.translate(W / 2 + sx, H / 2 + sy)
  ctx.scale(scale, scale)
  ctx.globalCompositeOperation = 'lighter' // additive vector bloom
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  drawTube(ctx, s, color, currentLane(s.tube, s.player.lane))
  drawSpikes(ctx, s)
  if (s.mode === 'warp') {
    // Diving-Claw warp transition; spikes above stay drawn so a crash reads.
    drawWarp(ctx, s, color)
  } else {
    // Far enemies first so near ones overdraw them.
    const ordered = s.enemies.slice().sort((a, b) => a.depth - b.depth)
    for (const e of ordered) drawEnemy(ctx, s, e)
    drawBullets(ctx, s)
    drawPlayer(ctx, s)
  }
  drawParticles(ctx, fx)
  ctx.restore()

  // Subtle CRT scanlines.
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(0,0,0,0.10)'
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)

  // Hit/death flash.
  if (fx.flash > 0) {
    ctx.fillStyle = fx.flashColor
    ctx.globalAlpha = fx.flash * 0.35
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }

  drawHud(ctx, s, W, H, color)
  ctx.shadowBlur = 0
}
