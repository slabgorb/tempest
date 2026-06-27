**Scene 1 — Title & Setup (0:00–0:30) | Slide 1: Title**
Open with the slide. Introduce the story in one sentence: "We hardened the high-score save system so corrupt data never reaches the player screen." No live app needed yet.

**Scene 2 — The Problem (0:30–1:30) | Slide 2: Problem**
Walk through the problem with a concrete example. Point to the bullet: "Imagine the browser saves `[{name: 9, score: 'x'}]` — numbers and strings flipped." Before this fix, that exact payload would be handed to the renderer. The screen would show numeric garbage where initials should appear. Transition: "Here's what we built to stop that."

**Scene 3 — What We Built (1:30–3:00) | Slide 3: What We Built**
Switch to terminal. Run the test suite live:

```bash
npm test tests/shell/storage.test.ts
```

Expected output: all tests pass, including the new `loadHighScores — per-entry validation guard` block. Point out the test names as you scroll:
- `drops an empty-object entry ([{}] → [])`
- `keeps only the well-formed rows from a mixed array, preserving order and date`
- `never throws on a garbage array payload`

**Fallback:** If the test run fails or the terminal is unavailable, switch to Slide 3 and read the test names aloud from the bullet list — they tell the story clearly without execution.

**Scene 4 — Architecture (3:00–4:00) | Slide 4: Why This Approach**
Show the Mermaid diagram (rendered). Walk the arrows: browser storage → load function → inspector guard → valid entries only → game core. Point out: "The game core never sees the storage. The inspector lives in the shell layer. That separation is what lets us test everything without a browser."

**Scene 5 — Before/After (4:00–5:00) | Before/After Slide**
Two-column view:
- Before: `JSON.parse → Array.isArray check → return as-is`
- After: `JSON.parse → Array.isArray check → filter(isHighScoreEntry) → return clean table`

Read aloud: "One `.filter()` call. That's the entire behavioral change. Everything else is documentation and type hygiene."

**Scene 6 — Roadmap (5:00–5:30) | Roadmap Slide**
"This unlocks Wave 4 and Wave 5 with confidence — the leaderboard layer is now production-safe."

**Scene 7 — Questions (5:30+) | Questions Slide**

---