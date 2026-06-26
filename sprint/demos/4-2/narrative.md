# Narrative

## Problem Statement
Problem: The game dropped players straight into action with no title screen or way to choose a starting level. Why it matters: Authentic arcade games greet players with an attract screen that draws in passersby and lets experienced players skip ahead to harder levels — without this, the experience feels unfinished and new players have no graceful entry point.

---

## What Changed
Think of it like a movie theater. Before this change, buying a ticket dropped you directly into the middle of the film. Now there's a lobby.

When you launch the game, you see a **title/attract screen** — a static holding screen that signals the game is ready and waiting. Press Start and you're taken to a **level select** screen where a spinner lets you dial up your starting level (1 through 16). Spin right to go higher, spin left to go lower — it stops at the edges, no wrap-around. Press Start again and the game kicks off exactly at that level with a fresh score and fresh lives.

One more change: when you get a game over, pressing Start no longer dumps you back into a new game immediately. Instead, it returns you to the attract screen, so you (or the next player) can choose a level again. The whole flow now goes: **Attract → Level Select → Play → (Game Over) → Attract**.

---

## Why This Approach
The game's engine is built around a strict rule: the simulation core knows nothing about screens, graphics, or user interfaces. So rather than bolting an attract screen onto the renderer, the team added "attract" and "select" as first-class *game states* — the same way "playing," "dying," and "game over" are already tracked.

This matters because it keeps everything testable and predictable. The engine can be asked "what happens when I press Start on the attract screen?" and give the same answer every single time, regardless of what frame rate the game is running at or what hardware it's on. The level select's spinner is also clamped (hard stops at level 1 and 16) rather than looping, which mirrors the original 1981 Atari cabinet behavior.

The team also added a shared test helper so existing gameplay tests didn't need to be rewritten — they just tell the engine "pretend we're already playing" and continue as before.

---
