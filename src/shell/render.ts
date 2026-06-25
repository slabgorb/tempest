// src/shell/render.ts
import { GameState } from '../core/state'
import { Tube, currentLane, project } from '../core/geometry'

const TUBE_COLOR = '#1e90ff'
const CLAW_COLOR = '#ffea00'

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

export function render(
  ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number,
): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  drawTube(ctx, s.tube)
  drawPlayer(ctx, s)
  ctx.restore()
  ctx.shadowBlur = 0
}
