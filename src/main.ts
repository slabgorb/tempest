// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { render } from './shell/render'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize(): void {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
window.addEventListener('resize', resize)
resize()

const input = createInputController(canvas)
const loop = createLoop(
  initialState(12345),
  () => input.sample(),
  (s) => render(ctx, s, canvas.width, canvas.height),
  () => performance.now(),
)
loop.start()
