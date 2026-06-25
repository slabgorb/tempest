// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { createFx } from './shell/fx'
import { render } from './shell/render'

const canvas = document.getElementById('game') as HTMLCanvasElement
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

const input = createInputController(canvas)
const fx = createFx()
let lastDraw = performance.now()

const loop = createLoop(
  initialState((Math.random() * 0xffffffff) >>> 0),
  () => input.sample(),
  (s) => {
    const t = performance.now()
    let rdt = (t - lastDraw) / 1000
    lastDraw = t
    if (rdt > 0.05) rdt = 0.05
    fx.detect(s, rdt)
    fx.update(rdt)
    render(ctx, s, W, H, fx, dpr)
  },
  () => performance.now(),
)
loop.start()
