// src/shell/render.ts
import { GameState, Enemy } from '../core/state'
import type { HighScoreTable } from '@arcade/shared/highscore'
import { glowStrokePasses, blitGlowDot, glowSprite, cappedDpr } from './glow'
import { Tube, Point, currentLane, project, laneWidth, flipPivot, clawTransform, warpDiveTube, warpEyeDest } from '../core/geometry'
import { isJumping, jumpProgress } from '../core/enemies/interpreter'
import { Fx, EnemyBurst, PlayerSplat, PlayerSpark, FuseScorePop } from './fx'
import { createPhosphor, phosphorAlpha } from './phosphor'
import { createStarfield, STAR_SPAWN_Z, STAR_RETIRE_Z, starReachFraction } from './starfield'
import { titleLogoPasses } from './titleLogo'
import {
  flipperGlyph, tankerGlyph, spikerGlyph, fuseballGlyph,
  pulsarBar, pulsarVariant, pulsarColor, enemyBoltGlyph, playerBulletGlyph,
  playerBulletColor, playerClawGlyph, lifeIconGlyph, wellColor, starColor,
  splatGlyph, sparkGlyph, logoGlyph, starPictureGlyph, fuseScoreGlyph,
  type Glyph, type GlyphColor, type PaletteColor,
} from './glyphs'
import { layoutText, CELL_H } from './font'
import { WARP_STARFIELD_GATE, ROM_FPS, EYE_FLYIN_START } from '../core/rules'

// The Superzapper strobe ramp (Story 10-15): eight hues the well flashes through
// while a zap is active, indexed by the core's flash counter. The per-level WELL
// colour is no longer taken from here — it comes from the COLTAB palette (tp1-12,
// glyphs.ts `wellColor`).
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
  blue: '#2b6bff', // tp1-12: the ROM's ZBLUE — distinct from `cyan` (ZTURQOI)
}

// The invisible well (bank 4, ZBLACK): black on black. Resolve a palette colour
// NAME to a pixel — the seven visible names go through GLYPH_HEX, `black` renders
// as the background so the well/rim/spokes vanish (the famous waves 65-80).
const WELL_BLACK_HEX = '#000000'
function paletteHex(color: PaletteColor): string {
  return color === 'black' ? WELL_BLACK_HEX : GLYPH_HEX[color]
}

/**
 * The well's colour hex for a frame. While a superzapper flash is active it OVERRIDES
 * the well with the strobe ramp (Story 10-15, `QFRAME AND 7`); otherwise the well is
 * its per-bank COLTAB slot-6 colour — `#000000` (background) on the invisible-well
 * waves 65-80. Pure and level-keyed, so the wiring is testable without a canvas —
 * this replaces the mutation-gameable well-wiring source-scan of tp1-12.
 */
export function resolveWellColor(level: number, zapFlash: number | null): string {
  if (zapFlash != null) return LEVEL_COLORS[zapFlash % LEVEL_COLORS.length]
  return paletteHex(wellColor(level))
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

// The layered glow envelope (tp1-40). Same GlowStyle shape the shared module
// used, same call sites — but the halo is now wider low-alpha UNBLURRED passes
// under 'lighter' (glowStrokePasses), never a live canvas shadow. `draw` builds
// the path and strokes it; it is invoked once per pass, so it must be a pure
// path+stroke thunk (every call site here is). Halo passes stroke in
// `style.color` (the old shadowColor semantics — a gradient can't tint a halo);
// the core pass strokes the real `style.stroke` at full ambient alpha. Each
// pass alpha MULTIPLIES the caller's ambient globalAlpha (drawWarp's faded
// streaks keep their fade), and both alpha and blend mode are restored on exit.
interface GlowStyle {
  stroke: string | CanvasGradient
  width: number
  blur: number
  color?: string
}

function withGlow(ctx: CanvasRenderingContext2D, style: GlowStyle, draw: () => void): void {
  const passes = glowStrokePasses(style.blur, style.width)
  const halo = style.color ?? (typeof style.stroke === 'string' ? style.stroke : '#ffffff')
  const baseAlpha = ctx.globalAlpha
  const mode = ctx.globalCompositeOperation
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i]
    const isCore = i === passes.length - 1
    ctx.strokeStyle = isCore ? style.stroke : halo
    ctx.lineWidth = pass.width
    ctx.globalAlpha = baseAlpha * pass.alpha
    if (!isCore) ctx.globalCompositeOperation = 'lighter'
    draw()
    if (!isCore) ctx.globalCompositeOperation = mode
  }
  ctx.globalAlpha = baseAlpha
}

// Stroke a glowing polyline through `pts` — the drop-in for the shared
// glowPolyline this file used to import, riding the layered envelope above.
function glowPolyline(
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<readonly [number, number]>,
  style: GlowStyle,
  close = false,
): void {
  if (pts.length === 0) return
  withGlow(ctx, style, () => {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    if (close) ctx.closePath()
    ctx.stroke()
  })
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
  // The glyph's glow reach was authored in SCREEN px (the old shadow radius was
  // pre-transform); divide by scale like the line width so it stays that size.
  const glowReach = blur / scale
  for (const stroke of glyph) {
    const hex = GLYPH_HEX[override ?? stroke.color]
    if (stroke.points.length === 1) {
      const p = stroke.points[0]
      blitGlowDot(ctx, hex, p.x, p.y, dot)
    } else {
      withGlow(ctx, { stroke: hex, width: lw, blur: glowReach }, () => {
        ctx.beginPath()
        stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        if (stroke.closed) ctx.closePath()
        ctx.stroke()
      })
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

// Warp-dive starfield (Story 10-4): the lifecycle lives in the pure ./starfield
// model; render strokes its live planes as blue dots rushing out from centre.
const starfield = createStarfield()

/**
 * Advance the warp starfield by `dt` seconds of SIM time (FR-017).
 *
 * Wired to createLoop's onStep in main.ts, so it ticks on the game's clock — not on
 * requestAnimationFrame — and freezes with the rest of the sim when paused. Only the
 * dive uses it; every other mode resets the field (see render()).
 */
export function advanceStarfield(dt: number): void {
  starfield.step(dt)
}
// The 4 reused star "pictures" are the ROM's own MSTAR1-4 (tp1-19 / V-015): 22/20/
// 21/20 dots at authored absolute coordinates, in glyphs.ts. Each plane scatters its
// picture's dots outward as it dives, so 8 planes share 4 constellations. (The old
// table here was four EYEBALLED 5-dot pictures of unit vectors — a quarter of the
// arcade's density, and a ring rather than a scatter.)

// Step the starfield one frame and stroke every live plane. A plane's Z maps to
// a radial reach: far (Z≈STAR_SPAWN_Z) sits near centre, near (Z≈STAR_RETIRE_Z)
// flings its dots to the edges — the "flying down the tube" rush. Warp-only.
export function drawStarfield(ctx: CanvasRenderingContext2D, level: number): void {
  // NOTE: this no longer STEPS the starfield — it only strokes it. Advancing state
  // inside a draw call was the whole defect (FR-017): draw runs once per rendered
  // frame, so the dive's speed tracked the monitor and kept running while paused.
  // advanceStarfield() below is driven from the sim's per-step hook instead.
  //
  // tp1-31: anchored at the SCENE ORIGIN — DSTARF draws each plane at the world
  // centre (PXL = PZL = 0x80, ALDISP.MAC:2945-2948), which is (0,0) in the
  // phosphor scene space. (The old W/2,H/2 anchor predated the phosphor
  // refactor's centre-origin scene transform and displaced the whole field by
  // half a screen — see sprint/archive/tp1-9-session-superseded-a1.md.)
  const reach = 720 * 0.6 // scene units — the phosphor scene is a 720-unit box
  const span = STAR_SPAWN_Z - STAR_RETIRE_Z
  // DB-017: each plane takes its own colour through the palette (blue until wave 5,
  // then per-plane index). starColor may resolve to black in the invisible-well
  // waves, which paletteHex renders as background — a faithful vanish.
  // tp1-9 (DB-016): radial reach is the ROM's hyperbolic divide 40/(z+24), not a
  // linear spread from centre — a fresh plane already sits ~15% out, not piled on
  // the centre point, and it whips past at the end.
  starfield.planes.forEach((plane, i) => {
    const t = (STAR_SPAWN_Z - plane.z) / span // 0 (far, centre) → 1 (near, edge)
    const r = starReachFraction(plane.z) * reach
    const size = 0.6 + t * 1.8
    const hex = paletteHex(starColor(level, i))
    ctx.globalAlpha = 0.25 + t * 0.7
    // The picture's dots are normalised to the largest MSTAR's extent, so scaling by
    // the plane's reach expands the whole authored constellation outward as it dives
    // — the dots keep their own radii instead of riding one circle. Sprite blits
    // (tp1-40): this loop peaked at ~160 blurred fills per warp frame, the single
    // densest glow-tax site in the game.
    for (const dot of starPictureGlyph(plane.picture)) {
      const p = dot.points[0]
      blitGlowDot(ctx, hex, p.x * r, p.y * r, size)
    }
  })
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

export function drawTube(
  ctx: CanvasRenderingContext2D, s: GameState, color: string, playerLane: number,
): void {
  const tube = s.tube
  // Spokes: per-boundary gradient, dim at the far rim → bright at the near rim.
  // The far→near depth gradient IS the GlowStyle.stroke (a CanvasGradient). Since a
  // gradient can't double as a shadowColor, the level `color` is passed explicitly so
  // the halo glows the level colour, not fall back to an empty shadow. Blur 8/width 2
  // are tempest's own tube constants — withGlow owns only the set/draw/reset envelope.
  for (let i = 0; i < tube.far.length; i++) {
    const f = tube.far[i]
    const near = tube.near[i]
    const g = ctx.createLinearGradient(f.x, f.y, near.x, near.y)
    g.addColorStop(0, 'rgba(255,255,255,0.04)')
    g.addColorStop(1, color)
    withGlow(ctx, { stroke: g, width: 2, blur: 8, color }, () => {
      ctx.beginPath()
      ctx.moveTo(f.x, f.y)
      ctx.lineTo(near.x, near.y)
      ctx.stroke()
    })
  }
  // Far ring (dim). The dim blue is the STROKE; its halo keeps the inherited level
  // `color`, passed explicitly — without it withGlow would default the shadowColor to
  // the dim-blue stroke and flatten the halo. glowPolyline wants [x,y] pairs.
  glowPolyline(
    ctx, tube.far.map((p) => [p.x, p.y] as [number, number]),
    { stroke: 'rgba(150,190,255,0.28)', width: 1.5, blur: 6, color }, tube.closed,
  )
  // Near ring (bright rim). Stroke === halo === level colour, so GlowStyle.color's
  // default (?? stroke) already resolves to the level colour.
  glowPolyline(
    ctx, tube.near.map((p) => [p.x, p.y] as [number, number]),
    { stroke: color, width: 3.5, blur: 18 }, tube.closed,
  )
  // Rim vertex sparks (sprite blits, tp1-40).
  for (const p of tube.near) {
    blitGlowDot(ctx, '#ffffff', p.x, p.y, 1.6)
  }
  // Highlight the player's lane spokes (boundary-safe for open tubes).
  const ia = bIndex(tube, playerLane)
  const ib = bIndex(tube, playerLane + 1)
  const a = tube.near[ia]
  const b = tube.near[ib]
  const fa = tube.far[ia]
  const fb = tube.far[ib]
  const laneStyle: GlowStyle = { stroke: 'rgba(255,255,255,0.35)', width: 2, blur: 10, color: '#fff' }
  withGlow(ctx, laneStyle, () => {
    ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(a.x, a.y); ctx.stroke()
  })
  withGlow(ctx, laneStyle, () => {
    ctx.beginPath(); ctx.moveTo(fb.x, fb.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  })
  // Vanishing-point glow. tp1-31: since tp1-9 the far ring converges on the
  // PER-WELL vanishing point, not the origin — anchor the glow on the far
  // ring's own centre (its centroid tracks the VP displacement) so it sits in
  // the hole on every well, not floating ~109 ring units off the level-1 ring.
  if (tube.closed) {
    let gx = 0
    let gy = 0
    for (const p of tube.far) { gx += p.x; gy += p.y }
    gx /= tube.far.length
    gy /= tube.far.length
    ctx.globalAlpha = 0.5
    blitGlowDot(ctx, color, gx, gy, 5 + Math.sin(renderTime * 3) * 1.5)
    ctx.globalAlpha = 1
  }
}

// SPARK1 / SPARK2 (ALVROM.MAC:672-697): the two yellow four-dot sparkles a SHATTERED
// spike tip shows — four dots on the AXES (SPARK1) or the DIAGONALS (SPARK2) at ±0x10,
// alternated at random to twinkle. The projected ±16 radius and twinkle rate are
// render tunables (the ROM's CASCAL depth-scales them); the topology is the fidelity.
const SPIKE_SPARK_AXES: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const SPIKE_SPARK_DIAGONALS: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const SPIKE_SPARK_RADIUS = 3.5    // px — the projected ±0x10 sparkle offset
const SPIKE_SPARK_TWINKLE_HZ = 15 // SPARK1<->SPARK2 alternation

function drawSpikeSparkle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const dots =
    Math.floor(renderTime * SPIKE_SPARK_TWINKLE_HZ) % 2 === 0 ? SPIKE_SPARK_AXES : SPIKE_SPARK_DIAGONALS
  for (const [dx, dy] of dots) {
    blitGlowDot(ctx, '#ffe600', x + dx * SPIKE_SPARK_RADIUS, y + dy * SPIKE_SPARK_RADIUS, 1.8)
  }
}

export function drawSpikes(ctx: CanvasRenderingContext2D, s: GameState): void {
  // Spike line is GREEN in the authentic ROM (Story 10-7); the tip dot below is the
  // ROM JADOT white cap — replaced by the yellow SPARK sparkle while it is shattered.
  for (let lane = 0; lane < s.spikes.length; lane++) {
    const h = s.spikes[lane]
    if (h <= 0) continue
    const a = project(s.tube, lane, 0)
    const b = project(s.tube, lane, h)
    withGlow(ctx, { stroke: '#39ff14', width: 2, blur: 10 }, () => {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    })
    if (s.spikeShattered[lane]) {
      // A charge is biting this spike this frame (LINSTA D6): the ROM swaps the white
      // cap for a random SPARK1/SPARK2 sparkle (TIPACT, ALDISP.MAC:3188-3210).
      drawSpikeSparkle(ctx, b.x, b.y)
    } else {
      // Single white tip dot (Story 6-8): authentic ROM cap (JADOT: VCTR 0,0) —
      // one white point, no flicker. Supersedes the earlier purple barb.
      blitGlowDot(ctx, '#ffffff', b.x, b.y, 2.0)
    }
  }
}

// Player charges render as the ROM's DIARA2 — 17 loose dots in two rings, the
// inner ring ammo-tinted (tp1-17) — with a short motion streak behind for travel.
function drawBullets(ctx: CanvasRenderingContext2D, s: GameState): void {
  // Story 10-8: the whole volley shares one CHACOU tint set by how many charges
  // are in flight this frame (the count is constant across these bullets). Per DA-004
  // the tint lands on the INNER ring only — pass it INTO the glyph, never as a
  // strokeGlyph override (which would also recolour the fixed-yellow outer ring).
  const tint = playerBulletColor(s.bullets.length)
  for (const b of s.bullets) {
    const p = project(s.tube, b.lane, b.depth)
    const tail = project(s.tube, b.lane, Math.min(1, b.depth + 0.05))
    withGlow(ctx, { stroke: '#eaffff', width: 2.5, blur: 14, color: '#7fdfff' }, () => {
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    })
    strokeGlyph(ctx, playerBulletGlyph(tint), p.x, p.y, 0.45 + b.depth * 0.35, renderTime * 5, 14)
  }
}

// Enemy energy bolts (Story 6-5, glyph fidelity 6-8): the authentic white
// The ROM's ESHOT1-4 (four white diagonal ticks + red dots) shimmering down its lane
// toward the rim. The ROM selects the frame off the GLOBAL frame counter QFRAME
// (ALDISP.MAC:910-914), NOT the bullet depth (V-009 / DA-018) — every bolt on screen
// shares one phase and cycles once every 4 game frames (ROM_FPS/4 ≈ 7.1 Hz). So drive it
// off `renderTime * ROM_FPS` (a QFRAME analog, shared across bolts, as fuseball/pulsar use
// the shell clock). It is a table-SWAP shimmer, not a spin, so no per-bullet rotation.
function drawEnemyBullets(ctx: CanvasRenderingContext2D, s: GameState): void {
  const frame = Math.floor(renderTime * ROM_FPS) // ≙ QFRAME; enemyBoltGlyph wraps on & 3 → 7.1 Hz
  for (const b of s.enemyBullets) {
    const p = project(s.tube, b.lane, b.depth)
    const scale = 0.4 + b.depth * 0.5 // grows as it nears the player
    strokeGlyph(ctx, enemyBoltGlyph(frame), p.x, p.y, scale, 0, 12)
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
      if (isJumping(e)) {
        // The jump's direction is the invader's rotation bit (INVROT), which the
        // CAM sets by rule and keeps across jumps (tp1-4, W-007).
        const dir = e.rot
        const pivot = flipPivot(tube, e.lane, dir, e.depth)
        const to = project(tube, e.lane + dir, e.depth)
        const t = jumpProgress(e)
        const arc = arcAbout(p, to, pivot, t)
        fp = arc.pos
        spin = baseAngle + arc.swing * t
      }
      strokeGlyph(ctx, flipperGlyph(s.level), fp.x, fp.y, r / 4, spin, 14)
      break
    }
    case 'tanker': {
      // X-diamond body (recolours per bank) + the cargo emblem (keeps its hue).
      strokeGlyph(ctx, tankerGlyph(s.level, e.contains), p.x, p.y, r / 9, 0, 14)
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
      // Zig-zag bar whose jaggedness animates while pulsing (PULTAB). The COLOUR is a
      // two-state SLOT toggle, not fixed hues: PULPIC (ALDISP.MAC:861-867) picks COLRAM
      // slot 0 (white) while pulsing and slot 4 (per-bank PULSARS) when idle, both
      // resolved through the wave-group bank. `beat` drives only the glow (no ROM
      // counterpart); it must not reach the colour.
      const beat = e.pulsing ? 0.5 + 0.5 * Math.sin(renderTime * 18) : 0
      // Feed pulsarVariant the ROM's PULSON domain, ~[-63,15] (ALWELG.MAC:1557-1570), so
      // PULPIC's index (PULSON+64)>>4 sweeps 0..4 (flat→sharp→flat) — NOT a full byte,
      // which would sit on the idx>=5 flat clamp for most of the cycle and read flat (V-005).
      const variant = e.pulsing
        ? pulsarVariant(Math.round(-63 + (0.5 + 0.5 * Math.sin(renderTime * 12)) * 78))
        : 4 // flat bar (PULS0) when dormant
      const color = pulsarColor(s.level, e.pulsing)
      strokeGlyph(ctx, pulsarBar(variant), p.x, p.y, r / 4, 0, e.pulsing ? 22 + beat * 18 : 12, color)
      if (e.pulsing) {
        // Electrify the whole lane as a warning (boundary-safe quad).
        const i0 = bIndex(tube, e.lane)
        const i1 = bIndex(tube, e.lane + 1)
        const f0 = tube.far[i0]
        const f1 = tube.far[i1]
        const n0 = tube.near[i0]
        const n1 = tube.near[i1]
        // A translucent additive quad needs no halo of its own (tp1-40): its
        // edges sit on the lane's already-glowing spokes.
        ctx.globalAlpha = 0.12 + beat * 0.16
        ctx.fillStyle = GLYPH_HEX[color]
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
  // Rim-anchored, fixed-size ROM CURSOR (Story 12-1). The pure transform gives
  // the near-rim anchor, a lane-width-proportional scale, the lane's radial
  // rotation, and the authentic per-sub-lane roll — NO interior-depth projection.
  const { anchor, scale, rotation, roll } = clawTransform(s.tube, s.player.lane)

  ctx.globalAlpha = s.mode === 'dying' ? 0 : 1
  // The claw glyph is CLAW_COLOR yellow (GLYPH_HEX.yellow); strokeGlyph strokes
  // and glows it. playerClawGlyph(roll) selects the authentic NCRS shape.
  strokeGlyph(ctx, playerClawGlyph(roll), anchor.x, anchor.y, scale, rotation, 18)
  // Bright white muzzle-tip spark at the claw centre.
  blitGlowDot(ctx, '#fff', anchor.x, anchor.y, 2.6)
  ctx.globalAlpha = 1
}

// Particles blit the cached additive glow sprite — the pattern that first
// proved live shadow-blur was the lag (it ran 100+ Gaussian fills a frame
// during bursts before being baked). tp1-40 moved the sprite cache to ./glow
// and extended it to EVERY glowing dot in the scene; particles keep their own
// sizing curve here (they shrink as they fade).
function drawParticles(ctx: CanvasRenderingContext2D, fx: Fx): void {
  for (const p of fx.particles) {
    const t = Math.max(0, p.life / p.max)
    // Blit the cached glow scaled to roughly the old footprint (core 1.4–3.2px +
    // a ~10-unit glow reach), shrinking as the particle fades.
    const size = 6 + t * 14
    ctx.globalAlpha = t
    const spr = glowSprite(p.color)
    if (spr) ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size)
  }
  ctx.globalAlpha = 1
}

// Story 10-5: authentic vector explosions. The enemy burst is a 16-spoke star
// that doubles in size with a two-tier brightness; the player splat is a
// concentric jagged star that grows/shrinks while its colour cycles.
const ENEMY_BURST_BASE_LEN = 3 // spoke length at scale 1
const ENEMY_BURST_COLOR = '#fff' // EXPCOL=WHITE (ALCOMN.MAC:366); EXPL1-4 each open `CSTAT WHITE`

function drawEnemyBurst(ctx: CanvasRenderingContext2D, ex: EnemyBurst): void {
  const len = ENEMY_BURST_BASE_LEN * ex.scale
  const tail = Math.max(0.35, ex.life / ex.max) // gentle fade in the final frame
  ctx.globalAlpha = (ex.brightness / 15) * tail
  withGlow(ctx, { stroke: ENEMY_BURST_COLOR, width: 1.5, blur: 8 }, () => {
    ctx.beginPath()
    for (let i = 0; i < ex.spokes; i++) {
      const a = (i / ex.spokes) * Math.PI * 2
      ctx.moveTo(ex.x, ex.y)
      ctx.lineTo(ex.x + Math.cos(a) * len, ex.y + Math.sin(a) * len)
    }
    ctx.stroke()
  })
}

// The ROM player-death SPLAT (V-013/DA-009): one closed ragged tri-colour ring
// (splatGlyph, normalised to unit extent), scaled by the grow/shrink radius, its
// three colours spun by ROTCOL (`rot`). Replaces the eyeballed two procedural rings.
function drawPlayerSplat(ctx: CanvasRenderingContext2D, ex: PlayerSplat): void {
  if (ex.radius < 0.5) return
  ctx.globalAlpha = Math.max(0.25, ex.life / ex.max)
  strokeGlyph(ctx, splatGlyph(ex.rot), ex.x, ex.y, ex.radius, 0, 12)
}

// The ROM invader-collision SPARK1 (DA-007): a static yellow 4-dot axis cross.
const SPARK_RADIUS = 14 // on-screen half-extent of the cross
function drawPlayerSpark(ctx: CanvasRenderingContext2D, ex: PlayerSpark): void {
  ctx.globalAlpha = Math.max(0.25, ex.life / ex.max)
  strokeGlyph(ctx, sparkGlyph(), ex.x, ex.y, SPARK_RADIUS, 0, 12)
}

// The ROM fuseball score pop-up (V-022, FUSEX1/2/3): the white 750/500/250 that
// blooms where a fuseball died. Fades out over its life; the ROM's `SCAL 1,20` is a
// fixed size, so it does not grow with the burst underneath it.
const FUSE_SCORE_PX = 15 // on-screen cap height of the number
function drawFuseScore(ctx: CanvasRenderingContext2D, ex: FuseScorePop): void {
  ctx.globalAlpha = Math.max(0, ex.life / ex.max)
  strokeGlyph(ctx, fuseScoreGlyph(ex.tier), ex.x, ex.y, FUSE_SCORE_PX, 0, 10)
}

function drawExplosions(ctx: CanvasRenderingContext2D, fx: Fx): void {
  for (const ex of fx.explosions) {
    if (ex.kind === 'enemy') drawEnemyBurst(ctx, ex)
    else if (ex.kind === 'player') drawPlayerSplat(ctx, ex)
    else if (ex.kind === 'spark') drawPlayerSpark(ctx, ex)
    else drawFuseScore(ctx, ex)
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

// The lives-HUD claw: the ROM's own LIFE1 picture (V-016), not the hand-drawn
// chevron-with-crossbar we used to stroke here — and not the invented white apex
// dot either, which no ROM picture has. The geometry is pure and lives in glyphs.ts;
// this is only its canvas consumer. LIFE1 spans 8 units wide, so `size` is the icon's
// width; the chain hangs below its origin, so lift it half its height to sit centred
// on (cx, cy). Colour comes from the glyph itself (`CSTAT YELLOW`).
function drawClawIcon(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number,
): void {
  const scale = size / 8
  strokeGlyph(ctx, lifeIconGlyph(), cx, cy - scale * 1.5, scale, 0, 10)
}

// Draw stroke-vector text in the authentic VGMSGA font (@arcade/shared/font, via
// ./font) with the neon glow. `sizePx` is the cap height — the 24-unit glyph cell
// maps onto it.
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
  glowTrace(ctx, trace, color, blur, Math.max(1, sizePx / 18))
}

// Stroke a traced path as glowing vectors: layered additive halo passes, then
// the crisp core on top (tp1-40 — the passes used to be blurred; the two-halo/
// one-core STRUCTURE is unchanged). Shared by the message-font text above and
// the ROM logo picture below, which needs the same glow at an arbitrary hex hue
// (the rainbow's per-pass colour) rather than a GlyphColor name.
function glowTrace(
  ctx: CanvasRenderingContext2D,
  trace: () => void, color: string, blur: number, lineWidth: number,
): void {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  withGlow(ctx, { stroke: color, width: lineWidth, blur }, () => {
    trace()
    ctx.stroke()
  })
  ctx.restore()
}

// Draw a glyph as glowing vectors centred on (cx, cy) at an arbitrary hex hue —
// the picture analogue of drawGlowText. `sizePx` is the cap height, matching
// vecText, so a caller can swap a string for a ROM picture and keep its sizing.
function drawGlowGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph, cx: number, cy: number, sizePx: number, color: string, blur: number,
): void {
  const trace = (): void => {
    ctx.beginPath()
    for (const s of glyph) {
      s.points.forEach((p, i) => {
        const sx = cx + p.x * sizePx
        const sy = cy + p.y * sizePx
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
    }
  }
  glowTrace(ctx, trace, color, blur, Math.max(1, sizePx / 18))
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
  table: HighScoreTable<'level'>, cx: number, top: number, color: string, maxRows: number,
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
  // Title as the approaching rainbow (Story 10-6): the logo stacked across ~19
  // depth passes from the far horizon to the viewer, each a rainbow colour, the
  // whole stack marching forward every frame (the book's SCARNG/LOGPRO
  // "approaching logo process"). renderTime drives the advance so it animates;
  // far passes draw first (behind) small and faint, near passes large and bright.
  //
  // tp1-19 (V-017): the word is now the ROM's OWN picture (TEMLIT's back-slanted
  // alphabet), not the message font blown up. The ROM agrees the two belong
  // together — `VORLIT::` is the label immediately above `TEMLIT:` (ALVROM.MAC:1301),
  // and VORLIT is exactly what LOGPRO's rainbow stacks. Built once, outside the
  // loop: the geometry is identical for all ~19 passes; only hue/size/alpha differ.
  const titleY = H * 0.18
  const logo = logoGlyph()
  for (const pass of titleLogoPasses(renderTime * LOGO_RAINBOW_SPEED)) {
    const size = Math.max(1, Math.round(TITLE_BASE_PX * pass.scale))
    ctx.globalAlpha = 0.35 + 0.65 * pass.depth
    drawGlowGlyph(ctx, logo, W / 2, titleY, size, pass.color, 8 + Math.round(20 * pass.depth))
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
  // Three initial slots (SH2-13 typed entry): typed chars bright, the next
  // empty slot carries the highlighted cursor, remaining slots dim blanks.
  const slotW = 84
  const startX = W / 2 - slotW
  const y = H * 0.54
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 3; i++) {
    const x = startX + i * slotW
    const typed = entry.initials[i]
    const active = i === entry.initials.length
    if (typed !== undefined) {
      drawGlowText(ctx, typed, x, y, 64, color, 12)
    } else if (active) {
      drawGlowText(ctx, '_', x, y, 64, CLAW_COLOR, 22)
      withGlow(ctx, { stroke: CLAW_COLOR, width: 3, blur: 14 }, () => {
        ctx.beginPath(); ctx.moveTo(x - 26, y + 44); ctx.lineTo(x + 26, y + 44); ctx.stroke()
      })
    } else {
      drawGlowText(ctx, '_', x, y, 64, 'rgba(150,190,255,0.4)', 0)
    }
  }
  const blink = 0.5 + 0.5 * Math.sin(renderTime * 4)
  ctx.globalAlpha = blink
  drawGlowText(
    ctx, 'TYPE A-Z - BACKSPACE FIXES - FIRE TO CONFIRM', W / 2, H * 0.78,
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
    drawClawIcon(ctx, 36 + i * 26, H - 30, 18)
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

// End-of-level warp (tp1-10, WD-012): the ROM dives the CAMERA with the Claw. MOVCUD
// advances the eye by the SAME velocity as the cursor every frame ("LDA EYLL / CLC /
// ADC CURSVL", ALWELG.MAC:1049-1057), so (CURSY - EY) is invariant — the Claw's
// projected size and screen position DO NOT change; the well rushes outward around
// it. So the Claw is drawn rim-anchored and fixed through the same clawTransform as
// normal play (NOT marched down a static tube at a receding depth), and the well
// itself is scaled up about its vanishing point as the dive progresses (the caller
// applies that zoom to the tube). Speed streaks rush outward along every spoke for
// the dive sensation; spikes stay drawn (by the caller) so the spike crash reads.
function drawWarp(ctx: CanvasRenderingContext2D, s: GameState, color: string): void {
  const tube = s.tube
  const progress = Math.max(0, Math.min(1, s.warp.progress))

  // Speed streaks along each spoke, faster and brighter as the warp progresses.
  const speed = 1.5 + progress * 4
  const streaks = 3
  const segLen = 0.14
  for (let i = 0; i < tube.far.length; i++) {
    const f = tube.far[i]
    const n = tube.near[i]
    for (let k = 0; k < streaks; k++) {
      const t = (((renderTime * speed + k / streaks) % 1) + 1) % 1
      const a = lerpP(f, n, t)
      const b = lerpP(f, n, Math.min(1, t + segLen))
      // The streak's fade rides the ambient globalAlpha; withGlow multiplies
      // its pass alphas into it and restores it (tp1-40).
      ctx.globalAlpha = 0.15 + t * 0.6
      withGlow(ctx, { stroke: color, width: 1 + t * 2.5, blur: 6 + t * 12 }, () => {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      })
    }
  }
  ctx.globalAlpha = 1

  // The Claw is CONSTANT during the dive — rim-anchored and fixed, exactly as in
  // normal play (drawPlayer). clawTransform(tube, lane) is progress-independent
  // (geometry.claw-transform.test.ts), so the camera-with-the-Claw invariant holds:
  // the Claw neither shrinks nor slides toward the vanishing point as the well
  // expands past it.
  const { anchor, scale, rotation, roll } = clawTransform(tube, s.player.lane)
  strokeGlyph(ctx, playerClawGlyph(roll), anchor.x, anchor.y, scale, rotation, 18)
  blitGlowDot(ctx, '#fff', anchor.x, anchor.y, 2.6)
  ctx.globalAlpha = 1
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
  // tp1-1: was `renderTime += 1 / 60` — a hard-coded frame rate inside a function
  // that is HANDED the real dt. It drives every glyph animation phase, so on a 144 Hz
  // display the whole game's animation ran at the wrong speed too. Render-side phases
  // legitimately track the DISPLAY's clock (they are decoration, not simulation), so
  // this takes the true frame dt rather than the sim's step.
  renderTime += dt
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

  // tp1-12: the well and the per-level accent come from the COLTAB palette
  // (glyphs.ts `wellColor`), not an arbitrary 8-hue list. `wellName` is the well
  // slot's colour for this wave-group — `black` on waves 65-80 (the invisible well).
  // The HUD/frame/warp accent must stay VISIBLE, so it falls back to white when the
  // well itself is invisible.
  const wellName = wellColor(s.level)
  const color = wellName === 'black' ? GLYPH_HEX.white : paletteHex(wellName)

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
  //
  // tp1-40 (AC-4): the SCENE renders at a capped dpr — all the per-pixel
  // compositing work lives in these buffers, and the production trace showed
  // the GPU saturating at display dpr. composite() scales the accumulator back
  // up to the main canvas, which keeps its full dpr for HUD/text crispness.
  const pctx = phosphor.beginScene(W, H, cappedDpr(dpr))
  // Superzapper well-color flash (Story 10-15): while a zap is active the FX
  // layer surfaces the core's `superzapper-flash` index (QFRAME AND 7) as
  // `fx.zapFlash`; tint the whole well/web with that flash hue so it strobes
  // through the spectrum, then revert to the wave-group well colour the frame the
  // flashes stop. The renderer owns the index→hue mapping (events.ts: "the renderer
  // maps it to the palette"); LEVEL_COLORS' eight hues remain the strobe ramp.
  const wellHex = resolveWellColor(s.level, fx.zapFlash)
  // tp1-31 (DB-008): the per-well SCREEN Z VANISH PT translate + its level-start
  // slide. The ROM adds ZADJL to every projected point inside WORSCR
  // (ALDISP.MAC:2274), so the WHOLE scene shifts — tube, spikes, enemies, claw,
  // and the warp starfield (DSTARF swaps the eye but keeps ZADJL). The sim owns
  // the animation: render just applies the current camera.screenZ.
  // tp1-33 (WD-012): during the dive the well EXPANDS past the fixed Claw. The eye
  // tracks the cursor (MOVCUD), so the far ring rushes outward toward the rim while
  // the near ring stays put — warpDiveTube returns that progress-driven diving well.
  // Draw the tube AND spikes against it, so the well and any spike grow around the
  // stationary Claw (the spike growing up to meet the Claw, WD-012). drawWarp keeps
  // the Claw on the base near ring (identical to the diving near ring), so it does
  // not move. Non-warp frames pass the well through unchanged.
  // tp1-37 (WD-018): during the post-descent eye FLY-IN (flyIn > 0) the new well is NOT
  // static — the eye walks in from EYE_FLYIN_START to EYLDES (-H), so drive warpDiveTube
  // from the eye's fraction of that span: the new well starts FLAT (progress 1, continuous
  // with the descent's flattened bottom — no hard cut) and un-flattens to the normal well
  // (progress 0) as the eye lands. The descent itself uses s.warp.progress directly.
  const flyingIn = (s.warp.flyIn ?? 0) > 0
  const dest = warpEyeDest(s.tube)
  const warpProgress = flyingIn
    ? (dest - (s.warp.eyeY ?? EYE_FLYIN_START)) / (dest - EYE_FLYIN_START)
    : Math.min(1, s.warp.progress)
  const scene =
    s.mode === 'warp' ? { ...s, tube: warpDiveTube(s.tube, warpProgress) } : s
  pctx.translate(0, s.camera.screenZ)
  drawTube(pctx, scene, wellHex, currentLane(scene.tube, scene.player.lane))
  drawSpikes(pctx, scene)
  if (s.mode === 'warp') {
    // tp1-10 (WD-013): the starfield does not open until the dive is ~29% down the
    // well (WARP_STARFIELD_GATE) — gated on the dive progress, not merely on the warp
    // mode, so it stays dark through the AVOID-SPIKES hold (progress 0).
    if (s.warp.progress >= WARP_STARFIELD_GATE) drawStarfield(pctx, s.level)
    // Diving warp transition; spikes above stay drawn so a crash reads. drawWarp
    // draws the streaks + the rim-anchored, constant Claw (WD-012, via clawTransform).
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
