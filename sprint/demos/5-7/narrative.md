# Narrative

## Problem Statement
Problem: The "Game Over" screen and high-score leaderboard were nearly unreadable — game graphics bled through the text, and the score table could display incorrectly depending on what the game had drawn moments before. Why it matters: First impressions of a polished game live and die on these screens; a blurry, hard-to-read Game Over overlay signals unfinished work to players and stakeholders alike.

---

## What Changed
Imagine holding a sign in front of a neon light show — without anything behind it, the colors bleed through and the words are hard to read. We added a semi-transparent dark curtain (called a "scrim") that drops behind the Game Over and attract screens, giving the text a clean backdrop to sit against.

We also fixed a subtle but embarrassing bug: the high-score table was borrowing formatting settings left behind by whatever the game drew just before it. Like an actor walking on stage in someone else's costume, it sometimes appeared misaligned. The table now dresses itself properly every time, independent of what came before.

No game rules, physics, or scoring logic were touched — this was purely a cosmetic layer update.

---

## Why This Approach
The game's architecture keeps a strict separation between the "brain" (game rules and simulation) and the "face" (rendering). Fixing these visual issues entirely in the rendering layer means zero risk to game behavior. Every one of the 272 automated tests still passes — we didn't introduce any regressions.

The scrim approach is the industry-standard solution for overlay legibility: a simple dark wash that works across every level geometry and color scheme without hard-coding anything. The self-contained table fix follows the same principle — components that clean up after themselves are reliable components.

---
