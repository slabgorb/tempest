# Changelog

All notable changes to **Tempest** — a faithful browser clone of Atari's 1981 vector classic.

Play it at **[tempest.slabgorb.com](https://tempest.slabgorb.com)**.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries describe what changed
for the player. Purely internal work is summarised under *Internal*.

## [1.0.13] - 2026-07-14

### Changed
- **Every well now has its own camera.** The far end of the tube was a fixed
  one-fifth the size of the near rim on every level; the cabinet computes the
  ratio per well — between a tenth and a sixth — and builds the far ring around
  the well's own vanishing point, which sits off-centre on every well but one.
  The warp starfield recedes on the ROM's hyperbolic depth curve instead of a
  straight line.
- **Each well sits where the cabinet framed it on screen**, and at the start of
  a new wave the camera glides into the next well's framing over about a
  quarter of a second instead of cutting. A fresh life still snaps straight
  into place.
- **The enemies wear the well's colours now.** Flippers, tankers and pulsars
  take their colours from the same per-wave-group palette bank as the well —
  the recolouring 1.0.12's palette work promised. A pulsing pulsar strobes
  white and shows its wave group's colour between pulses; the tanker keeps its
  cargo emblem. The warp starfield follows: plain blue over the first four
  waves, then from wave 5 each plane of stars takes its own colour from the
  bank.

### Fixed
- The warp starfield had been drawn half a screen off-centre since an earlier
  rendering refactor; it is back at the centre of the scene.
- The glow at the vanishing point follows the well's actual far ring instead of
  being nailed to the middle of the screen.

## [1.0.12] - 2026-07-14

### Changed
- **The well changes colour as you go deeper — and for sixteen waves it
  vanishes.** Colours now come from the cabinet's own palette table: six banks,
  one per group of sixteen waves, driving the well and the HUD. One bank paints
  the well black, so **waves 65–80 are played on an invisible well** — the
  difficulty spike the 1981 cabinet actually shipped. (Enemies still wear their
  fixed colours; recolouring them from the same table is next.) With six or
  seven shots in flight, your ammo tint is now blue — a colour the palette
  keeps distinct from cyan.
- **Enemies enter the wave as a queue of nymphs, at most seven on the board.**
  The whole wave's budget is seeded up front as staggered nymphs, and one
  hatches only when a slot frees up — how fast you clear the board is what lets
  more in. The old spawn timer is gone, tanker splits pass through the same
  seven-slot gate, and firing the Superzapper freezes the queue rather than
  letting it dump on you.
- While nymphs are still queued on the early waves, **the fuseball patrols the
  middle of the lane** instead of riding the rim — and its touch kills only at
  the rim itself.

### Fixed
- **An enemy can only grab your Claw from the rim itself.** The old grab line
  was an invented threshold slightly below the rim, so an invader still
  climbing could grab a player the cabinet would never have touched.

## [1.0.11] - 2026-07-14

### Changed
- **An enemy that reaches the rim now hunts you along it.** It pins to the top
  of the well and circles toward your Claw — and when a second one arrives
  while the first is still circling, it takes the opposite way round, so the
  pair pinches you from both flanks. Invaders used to reach the rim and simply
  stand there.
- **All pulsars strobe in unison** — one global pulse, nine frames in every
  forty, not a private timer each. And a pulsing lane kills only within the
  pulse's actual reach, not from anywhere on the lane.
- **The fuseball was never a hunter.** Ours steered at the player from wave 1;
  the cabinet's chase rule does not exist until wave 18 — before that, every
  move is a coin flip — and from wave 18 on, the table deliberately steers it
  *away* from your Claw. Waves 100 and beyond now keep the deep-wave rule
  instead of walking off the end of the cabinet's table.
- **Tanker children are born at their parent's exact depth.** A tanker bursting
  near the rim used to have its children pushed back down to a safer distance;
  the cabinet has no such clamp.

### Fixed
- The arrow keys were inverted: holding LEFT or RIGHT now turns the Claw the
  way it reads on screen. The mousewheel spinner is untouched — it was always
  right.

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
