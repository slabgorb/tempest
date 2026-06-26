**Pre-demo setup:** Have the game running in a browser tab at `http://localhost:5173`. Open a second tab with the test suite output ready.

---

**Scene 1 — The Problem (Slide 2: Problem) [~60 seconds]**

"Before this sprint, every time the game loaded, it threw you straight into level one with no warning. There was no title screen, no way to choose a harder starting level, and if you lost, it just reset immediately. That's not how the original arcade worked — and it's not a great first impression."

> Show the old behavior if a pre-patch build is available; otherwise narrate from the slide.

---

**Scene 2 — The Attract Screen (Slide 3: What We Built) [~90 seconds]**

"Now when you load the game, this is what you see." 

> Point to the browser tab showing the attract/title screen.

"Nothing moves. The game is waiting. This is what arcade operators called the 'attract mode' — it drew people to the cabinet. Press Start…"

> Press Start (spacebar or mapped key).

"…and now we're on the level select screen. Notice `selectedLevel: 1` in the bottom corner [or wherever the state is surfaced]. Spin the mousewheel to the right."

> Spin mousewheel right several clicks, pausing at each.

"Level 2… 3… 4. Keep going all the way to 16 — and watch what happens when I try to go past it." 

> Spin past 16. "Hard stop. No wrap-around to level 1. Intentional — same as the original cabinet."

"Spin it back to, say, level 5. Press Start."

> Press Start. "Fresh game, level 5, three lives, score zero. Exactly the level we chose."

---

**Scene 3 — Game Over Returns to Attract (Slide 3 continued) [~45 seconds]**

"One more thing. Let's lose all our lives."

> Either die deliberately or fast-forward to game over state.

"Game over. Old behavior: press Start and you'd be back in a new game instantly. Watch."

> Press Start. "Attract screen. The game is ready for the next player — or for you to pick a new starting level. That's the full loop."

---

**Scene 4 — Under the Hood, Simply (Slide 4: Why This Approach) [~60 seconds]**

"Here's why this was done cleanly." 

> Switch to test suite output.

"Run the framing tests."

```bash
npm test -- sim.framing
```

"Every scenario — attract to select, level clamping, starting at level 7, game over back to attract — verified in under a second, with no browser needed. The simulation core has no idea what a screen looks like. It just knows states and transitions. That's what keeps this game trustworthy as we add more features."

> **Fallback:** If tests fail to run, show Slide 4 and read out the test names: "attract ignores spin/fire/zap," "clamps selectedLevel at maximum of 16 on repeated spin," "start commits to playing at the selected level."

---

**Scene 5 — What's Next (Slide: Roadmap) [~30 seconds]**

"The attract and select states are wired up in the engine. Story 4-7 will render them visually — the title graphic, the level preview, the glowing tube geometry for whichever level you've dialed in. Today's work is the plumbing; 4-7 is the paint."

---