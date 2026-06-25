// src/shell/render.ts
import { GameState } from '../core/state'
import { Tube, currentLane, project } from '../core/geometry'

const TUBE_COLOR = '#1e90ff'
const CLAW_COLOR = '#ffea00'
const BULLET_COLOR = '#ffffff'
const FLIPPER_COLOR = '#ff2bd6'

function strokePoly(
  ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], closed: boolean,
): void {
  if (pts.length === 0) return
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  if (closed) ctx.closePath()
  ctx.stroke()
}

function drawTube(ctx: CanvasRenderingContext2D, tube: Tube): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = TUBE_COLOR
  ctx.shadowColor = TUBE_COLOR
  ctx.shadowBlur = 12
  strokePoly(ctx, tube.far, tube.closed)
  strokePoly(ctx, tube.near, tube.closed)
  for (let i = 0; i < tube.far.length; i++) {
    ctx.beginPath()
    ctx.moveTo(tube.far[i].x, tube.far[i].y)
    ctx.lineTo(tube.near[i].x, tube.near[i].y)
    ctx.stroke()
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.fillStyle = BULLET_COLOR
  ctx.shadowColor = BULLET_COLOR
  ctx.shadowBlur = 10
  for (const b of s.bullets) {
    const p = project(s.tube, b.lane, b.depth)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = FLIPPER_COLOR
  ctx.shadowColor = FLIPPER_COLOR
  ctx.shadowBlur = 14
  for (const e of s.enemies) {
    const p = project(s.tube, e.lane, e.depth)
    const r = 5 + e.depth * 9 // grows as it approaches the near rim
    ctx.beginPath()
    ctx.moveTo(p.x - r, p.y)
    ctx.lineTo(p.x, p.y - r)
    ctx.lineTo(p.x + r, p.y)
    ctx.lineTo(p.x, p.y + r)
    ctx.closePath()
    ctx.stroke()
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState): void {
  if (!s.player.alive) return
  const lane = currentLane(s.tube, s.player.lane)
  const p = project(s.tube, lane, 1.0)
  ctx.lineWidth = 3
  ctx.strokeStyle = CLAW_COLOR
  ctx.shadowColor = CLAW_COLOR
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
  ctx.stroke()
}

function drawHud(ctx: CanvasRenderingContext2D, s: GameState, width: number): void {
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.font = '20px monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(`SCORE ${s.score}`, 16, 16)
  ctx.fillText(`LEVEL ${s.level}`, 16, 40)
  ctx.textAlign = 'right'
  ctx.fillText(`LIVES ${s.lives}`, width - 16, 16)

  if (s.mode === 'gameover') {
    ctx.textAlign = 'center'
    ctx.font = '48px monospace'
    ctx.fillText('GAME OVER', width / 2, 80)
    ctx.font = '20px monospace'
    ctx.fillText('press ENTER to restart', width / 2, 140)
  }
}

export function render(
  ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number,
): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  drawTube(ctx, s.tube)
  drawBullets(ctx, s)
  drawEnemies(ctx, s)
  drawPlayer(ctx, s)
  ctx.restore()
  drawHud(ctx, s, width)
  ctx.shadowBlur = 0
}
