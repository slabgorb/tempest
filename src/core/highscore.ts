// src/core/highscore.ts
//
// High-score table shape. These types live in the PURE core so the high-score
// state machine (story 4-3) can depend on them without importing shell/. The
// localStorage persistence seam (shell/storage.ts, story 4-4) imports these
// types — the dependency points shell → core, never the reverse.

import { MAX_HIGH_SCORES } from './rules'

export interface HighScoreEntry {
  name: string          // player initials (3 chars, arcade convention)
  score: number         // points
  level: number         // level reached
  date?: string         // optional ISO-8601 timestamp of the entry
}

// Table: entries ordered descending by score. Ordering/truncation is the
// state machine's concern (4-3); the persistence seam stores whatever it is given.
export type HighScoreTable = HighScoreEntry[]

// Precondition: `table` is assumed sorted DESCENDING by score (lowest entry
// last) — the order insertHighScore maintains; the full-board branch below reads
// table[length-1] as the lowest qualifying score.
// True when `score` is worth recording. A non-positive score never qualifies.
// While the board has open slots, any positive score makes it; once full, the
// score must STRICTLY beat the lowest entry to displace it (a tie does not).
export function qualifiesForHighScore(table: HighScoreTable, score: number): boolean {
  if (score <= 0) return false
  if (table.length < MAX_HIGH_SCORES) return true
  const lowest = table[table.length - 1].score
  return score > lowest
}

// Returns a NEW table with `entry` inserted in descending-score order, truncated
// to MAX_HIGH_SCORES. Ties place the new entry AFTER existing equal-score entries
// (existing holders keep the higher rank). The input table is not mutated.
export function insertHighScore(table: HighScoreTable, entry: HighScoreEntry): HighScoreTable {
  const out = table.slice()
  let i = out.length
  for (let k = 0; k < out.length; k++) {
    if (out[k].score < entry.score) {
      i = k
      break
    }
  }
  out.splice(i, 0, entry)
  return out.slice(0, MAX_HIGH_SCORES)
}
