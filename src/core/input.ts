// src/core/input.ts

export interface Input {
  spin: number    // signed spinner intent for this step (lane units, applied via SPIN_SENSITIVITY)
  fire: boolean   // fire requested this step — NOT an edge: the shell asserts it
                  // on every step a button is held (autofire); consumers needing
                  // a press must latch (see SelectState.fireHeld, tp2-2)
  zap: boolean    // superzapper activation edge (true only on the step the key goes down)
  start: boolean  // start/restart (used by gameover in this slice)
}
