**Pre-demo setup:** Have the game running in a browser tab at the title/attract screen. Have a second tab ready with the game mid-play.

**Slide 1 — Title (0:00–0:30)**
Introduce the story: "Today we're looking at a one-point polish story — the kind that separates a prototype from a shippable product."

**Slide 2 — Problem (0:30–1:30)**
Switch to the browser. Navigate to the attract screen. Point out (or show a screenshot from before the fix) how the high-score table overlaps the glowing vector graphics beneath it. Say: "Every player sees this screen. When it looks muddy, it signals the game isn't done."

Fallback if live demo isn't available: Show the before/after screenshot on Slide 5.

**Slide 3 — What We Built (1:30–2:30)**
Refresh to the patched build. Let the attract loop run. Point to the dark curtain behind the score table: "That dark wash — the scrim — is new. Notice how the scores pop now. You can read every number clearly regardless of what's animating behind it."

Then trigger a game-over (or show the Game Over screen). "Same fix applies here — the overlay is crisp, professional."

Fallback: Show the after screenshot on Slide 5.

**Slide 4 — Why This Approach (2:30–3:15)**
Return to slides. "We kept this change entirely in the display layer. None of the game's 272 tests needed to change. The build is clean. The fix is isolated."

Run this command live if desired:
```bash
npx tsc --noEmit && npm run build
```
Expected output: clean compile, no errors, build artifacts generated. "Zero warnings. Zero errors."

Fallback: Show the green CI badge or terminal screenshot on this slide.

**Slide 6 — Roadmap (3:15–3:45)**
"This polish lands as we head into the final audio and effects wave. A readable Game Over screen is the frame around everything else we ship."

**Questions (3:45+)**

---