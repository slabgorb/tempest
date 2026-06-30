// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { createFx } from './shell/fx'
import { createAudioEngine } from './shell/audio'
import { playEventSounds } from './shell/audio-dispatch'
import { render } from './shell/render'
import { loadHighScores, saveHighScores } from './shell/storage'

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
const audio = createAudioEngine()
let lastDraw = performance.now()

// Browsers forbid starting an AudioContext before a user gesture, so the engine
// stays inert until the first click/keypress unlocks it. resume() is idempotent
// (only the first call builds the context and loads samples), so leaving both
// listeners attached makes every later gesture a harmless no-op.
function unlockAudio(): void {
  audio.resume()
}
canvas.addEventListener('click', unlockAudio)
window.addEventListener('keydown', unlockAudio)

// Seed the in-memory high-score table from persisted storage so saved scores
// appear on the attract screen immediately at boot.
const initial = initialState((Math.random() * 0xffffffff) >>> 0)
initial.highScoreTable = loadHighScores()

const loop = createLoop(
  initial,
  () => input.sample(),
  (s, frameEvents) => {
    const t = performance.now()
    let rdt = (t - lastDraw) / 1000
    lastDraw = t
    if (rdt > 0.05) rdt = 0.05
    fx.detect(s, rdt, frameEvents)
    fx.update(rdt)
    // Play one sound per gameplay event the core emitted this frame. The dispatch
    // table lives in the pure, unit-tested shell/audio-dispatch module (6-12, AC#2)
    // — extracted from this loop so the wiring can be tested behaviourally instead
    // of by a brittle source text-match.
    playEventSounds(audio, frameEvents)
    render(ctx, s, W, H, fx, dpr, rdt)
  },
  () => performance.now(),
  // The 4-3 state machine inserts the committed entry and transitions
  // 'highscore' → 'attract'. That is the only exit from 'highscore', so saving
  // whenever the OLD mode was 'highscore' persists the updated table. Referencing
  // `loop` here is safe: this callback only runs at frame time, after `loop` is
  // assigned (createLoop never invokes it synchronously).
  (oldMode) => {
    if (oldMode === 'highscore') saveHighScores(loop.getState().highScoreTable)
  },
)
loop.start()
