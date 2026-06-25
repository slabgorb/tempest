import { GameState } from './state'
import { Input } from './input'
import { wrapLane } from './geometry'
import { SPIN_SENSITIVITY } from './rules'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spawn: { ...s.spawn },
  }
}

function stepPlayer(s: GameState, input: Input): void {
  if (!s.player.alive) return
  s.player.lane = wrapLane(s.tube, s.player.lane + input.spin * SPIN_SENSITIVITY)
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  void dt // unused until bullets/enemies (Task 9+)
  const s = cloneState(state)
  if (s.mode === 'playing') {
    stepPlayer(s, input)
  }
  return s
}
