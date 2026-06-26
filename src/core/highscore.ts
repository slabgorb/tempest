// src/core/highscore.ts
//
// High-score table shape. These types live in the PURE core so the high-score
// state machine (story 4-3) can depend on them without importing shell/. The
// localStorage persistence seam (shell/storage.ts, story 4-4) imports these
// types — the dependency points shell → core, never the reverse.

export interface HighScoreEntry {
  name: string          // player initials (3 chars, arcade convention)
  score: number         // points
  level: number         // level reached
  date?: string         // optional ISO-8601 timestamp of the entry
}

// Table: entries ordered descending by score. Ordering/truncation is the
// state machine's concern (4-3); the persistence seam stores whatever it is given.
export type HighScoreTable = HighScoreEntry[]
