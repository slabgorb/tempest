// src/core/input.ts

export interface Input {
  spin: number    // signed spinner intent for this step (lane units, applied via SPIN_SENSITIVITY)
  fire: boolean   // fire edge (true only on the step the trigger goes down)
  zap: boolean    // superzapper activation edge (true only on the step the key goes down)
  start: boolean  // start/restart (used by gameover in this slice)
}
