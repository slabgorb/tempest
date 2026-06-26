// tests/core/helpers.ts
//
// Shared test helper. Story 4-2 moves initialState() from 'playing' to 'attract'
// (the new title/attract entry point). Gameplay tests must NOT depend on the
// framing entry mode, so they build a mid-game 'playing' state through this
// helper instead of reading initialState()'s starting mode.
//
// Forcing mode = 'playing' is a no-op while initialState() still returns
// 'playing' (pre-GREEN) and remains correct once it returns 'attract'
// (post-GREEN), so the gameplay suite stays green across the transition.
import { GameState, initialState } from '../../src/core/state'

export function playingState(seed: number): GameState {
  const s = initialState(seed)
  s.mode = 'playing'
  return s
}
