# Changelog

All notable changes to **Tempest** — a faithful browser clone of Atari's 1981 vector classic.

Play it at **[tempest.slabgorb.com](https://tempest.slabgorb.com)**.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries describe what changed
for the player. Purely internal work is summarised under *Internal*.

## [1.0.10] - 2026-07-13

### Changed
- **The enemies run the cabinet's own behaviour programs now.** Tempest's invaders were
  never five hard-coded behaviours — each one runs a little bytecode program out of the
  ROM's own table, and the game now runs those programs. The clearest consequence is the
  first wave: **a wave-1 flipper climbs straight up its lane and does not flip.** Wave 1 is
  the shooting gallery it was in 1981, not a swarm strobing sideways five times a second.
- **The spiker hops to the emptiest lane**, picked from a random starting line the way the
  ROM picks it, instead of piling onto the tallest spike.
- **A fuseball can only be shot while it is rolling**, never while it sits on the rim.

### Fixed
- **Firing and killing played each other's sounds.** Pulling the trigger played the enemy
  explosion, and killing an enemy played the warp-dive thrust — the two most-heard cues in
  the game, wired backwards. All three now play what the cabinet's own sound table names
  them.
- **The warp dive ran a wave ahead of itself.** Its acceleration was fed the level you see
  on screen rather than the ROM's internal count, which starts at zero — so every dive
  accelerated as though you were one wave further on, and the ramp topped out a wave early.
- Shooting a spike segment scores 1 point, not 3.
- Only the first frame of an enemy's death burst is dim; the rest are bright.
- The pulsar's colour-strobe is gone. It was invented — the cabinet simply toggles it.
- The spiker is green, the death burst is white, and the lives icon is the Claw's own
  silhouette rather than a hand-drawn chevron.

## [1.0.9] - 2026-07-13

Version bump only.

## [1.0.8] - 2026-07-13

### Changed
- **The whole game runs on the cabinet's clock: 28.44 frames a second, not 60.** The
  simulation had been running **2.11× too fast**, and the warp dive — which carries the
  frame rate squared — **4.45× too fast**. Enemy climbs, your shots, and the dive now move
  at the speed the 1981 machine moved them.
- **The keyboard behaves like a spinner.** Holding a direction used to advance the Claw a
  fixed step per tick; it now banks simulation time the way the real spinner does, so held
  movement is smooth and no longer depends on your monitor's refresh rate.

### Internal
- The first audit of this clone against Dave Theurer's original 1981 Atari source — 236
  findings, every citation verified byte-for-byte on both sides. Every fidelity claim in
  this repo up to now came from *secondary* sources: a book and a third-party
  disassembly. The frame-rate error above was the audit's headline finding, and it gates
  everything else — any numeric fix landing before it would have baked the wrong clock
  into its own baseline and then confirmed itself against it.

## [1.0.7] - 2026-07-12

No player-visible changes. Documentation only.

## [1.0.6] - 2026-07-12

### Added
- **Your best score now shows on Tempest's tile in the arcade lobby.** The game publishes
  its top score where the lobby can read it, across subdomains (ADR-0004).

## [1.0.5] - 2026-07-12

No player-visible changes. Documentation only — this changelog was added.

## [1.0.4] - 2026-07-12

### Changed
- Pause now works the same way across the whole arcade: **Esc** pauses and brings up
  the overlay, in Tempest exactly as in every other cabinet.

## [1.0.3] - 2026-07-11

No player-visible changes. Version bump only, published as part of a fleet-wide release.

## [1.0.2] - 2026-07-11

### Internal
- Sound effects now play through the arcade's shared audio engine. Same sounds, one engine.

## [1.0.1] - 2026-07-11

### Internal
- The tube's glow and the canvas letterboxing now come from the arcade's shared rendering
  code, so every game in the cabinet scales and glows identically.

## [1.0.0] - 2026-07-10

First stable release. No code changes from 0.0.5 — this version marks Tempest as complete:
all sixteen levels, the full enemy roster, authentic sound, and the Superzapper, all matching
the 1981 cabinet.

## [0.0.5] - 2026-07-10

### Added
- **Type your initials on the high-score table.** Previously you dialled each letter with
  the mousewheel; now you just type them.

## [0.0.4] - 2026-07-10

No player-visible changes. Documentation only.

## [0.0.3] - 2026-07-10

No player-visible changes. Version bump only.

## [0.0.2] - 2026-07-10

No player-visible changes. Fixed a test that was too slow on the build servers.

## [0.0.1] - 2026-07-10

**Initial release** — the complete game. Everything below shipped in this first version.

### Added

**The tube**
- All 16 authentic level geometries, taken from the original ROM, with the correct
  open and closed well shapes.
- True perspective depth: enemies scale to the width of their lane as they climb toward you.
- Vector phosphor afterglow, so lines linger and bloom the way they did on a real tube.

**The enemies**
- The full roster — flippers, tankers, spikers, fuseballs and pulsars — each with the
  cabinet's own movement and behaviour.
- Flippers cartwheel end-over-end around the web, using the original per-level flip patterns.
- Tankers split into two cargo enemies when destroyed or when they reach the rim.
- Spikers lay persistent spikes that your shots grind away.
- Pulsars climb, flip, and electrify their lane on a pulse.
- Fuseballs climb erratically and grab at the rim.
- Enemies shoot back with energy bolts.
- Authentic spawn schedule and per-level enemy mix, reconciled against the ROM.

**Your Claw**
- Spin around the rim and fire down the lanes, with a shot cap and fast auto-fire when
  you hold the button.
- Bullets change colour — yellow, blue, red — with the number of shots in flight.
- The **Superzapper**: one full-board blast, then a weak second shot, recharging each level.
- Safe respawn after death, so you can't be chain-killed.

**Between levels**
- The warp dive: an accelerating slow-to-fast ramp through an eight-plane starfield,
  with an AVOID SPIKES grace period — and a crash if you hit one.

**Sound and presentation**
- Authentic POKEY sound effects, extracted and baked from the original ROM, with
  per-channel voice-stealing playback just like the hardware.
- The genuine Tempest stroke-vector font, lifted from the ROM, for all on-screen text.
- Authentic vector explosions and the cabinet's real colours — green spikes, purple tankers.
- The approaching rainbow title logo.
- On-screen banners: SUPERZAPPER RECHARGE, the RATE YOURSELF ladder, BONUS and TIME.

**Framing**
- Attract mode with a self-playing demo that moves and fires on its own.
- Start-level select, scoring with extra lives, and a difficulty ramp that keeps climbing
  past the last geometry.
- High-score table that persists between sessions.
- Mousewheel spinner and keyboard controls.
