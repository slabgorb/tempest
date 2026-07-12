# Changelog

All notable changes to **Tempest** — a faithful browser clone of Atari's 1981 vector classic.

Play it at **[tempest.slabgorb.com](https://tempest.slabgorb.com)**.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries describe what changed
for the player. Purely internal work is summarised under *Internal*.

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
