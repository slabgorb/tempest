# Narrative

## Problem Statement
Problem: If a player's saved high-score data became corrupted in any way — a browser hiccup, a manual edit, an upgrade mismatch — the game would load the garbage and hand it directly to the display layer, producing garbled names, nonsensical scores, or a crash. Why it matters: High scores are a core player motivation loop in an arcade game. Silently corrupted leaderboards erode trust in the product and are the kind of bug that shows up in reviews ("my scores disappeared and the table showed junk"). A save-layer that can't protect its own data is a ticking liability.

---

## What Changed
Think of the high-score table like a safety deposit box at a bank. Before this change, the bank teller would hand you whatever was inside the box — even if someone had stuffed it full of shredded newspaper. Now, there's a trained inspector at the counter who checks every item before handing it over. Each saved score entry must have a player name (text), a numeric score, and a numeric level. Anything that doesn't pass inspection gets quietly set aside; the rest are returned in order. The box itself is also now marked "read-only" on the way in — the teller can look at your scores to save them, but cannot accidentally change them.

On the code organization side, a dependency that was buried in the middle of the file was promoted to the top where it belongs, and the function that decides whether a score is good enough for the leaderboard now has a clear note explaining one assumption it makes — keeping the codebase legible for the next developer.

---

## Why This Approach
Three principles guided the design:

**Fail gracefully, never crash.** Rather than rejecting the entire table if one entry is bad, the code filters out only the malformed rows. A player who has nine valid scores and one corrupt one loses one entry — not all nine. The game keeps playing regardless.

**Validate at the boundary, not inside the core.** The pure simulation engine (which handles all game logic) never touches browser storage. Validation lives in the shell layer — the thin seam between the game world and the real world — so the core stays clean, deterministic, and independently testable. This is the same architectural principle that makes the rest of the game unit-testable without a browser.

**Pin the contract in tests, not in hope.** The test suite now feeds arrays of deliberately broken data — empty objects, wrong types, nulls, garbage strings — and asserts that none of it reaches the renderer. This is a regression net: if someone changes the validation logic in the future, the tests catch it immediately.

---
