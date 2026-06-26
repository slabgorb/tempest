// src/shell/storage.ts
//
// Shell-side persistence seam for the high-score table, backed by localStorage.
// This is IO (shell), not simulation (core): it imports the table TYPES from
// core but the pure core never imports this module. Every failure mode
// (missing, corrupt, unavailable, quota-exceeded storage) degrades gracefully —
// the game keeps playing, scores just don't persist.

import type { HighScoreTable } from '../core/highscore'

const STORAGE_KEY = 'tempest-high-scores'

// Access localStorage defensively: in private-browsing / sandboxed contexts even
// *reading* the global can throw, and outside a browser it is simply absent.
function getStorage(): Storage | null {
  try {
    const ls = globalThis.localStorage
    return ls ?? null
  } catch {
    return null
  }
}

// Load the persisted table. Returns [] for any unhappy path (absent key,
// unavailable storage, corrupt JSON, or JSON that is not a table array).
export function loadHighScores(): HighScoreTable {
  const storage = getStorage()
  if (!storage) return []

  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (raw === null) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn(`[storage] high-score data is not a table array; ignoring`)
      return []
    }
    return parsed as HighScoreTable
  } catch {
    console.warn(`[storage] high-score data is corrupt JSON; ignoring`)
    return []
  }
}

// Persist the table. Swallows write failures (quota exceeded, unavailable
// storage) so a failed save never crashes the game.
export function saveHighScores(table: HighScoreTable): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(table))
  } catch {
    console.warn(`[storage] could not persist high scores (storage full or unavailable)`)
  }
}
