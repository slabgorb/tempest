// src/core/input.ts

export interface Input {
  spin: number    // signed spinner intent for this step (lane units, applied via SPIN_SENSITIVITY)
  fire: boolean   // fire edge (true only on the step the trigger goes down)
  zap: boolean    // superzapper (reserved for Wave 4)
  start: boolean  // start/restart (used by gameover in this slice)
}
