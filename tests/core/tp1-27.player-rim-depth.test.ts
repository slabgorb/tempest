// tests/core/tp1-27.player-rim-depth.test.ts
//
// Story tp1-27 — PLAYER_RIM_DEPTH = 0.92 is an invented constant.
//
// THE ANSWER IS NOT A BYTE. It is the absence of one.
//
// The story asked us to find "the byte the ROM compares INVAY against" in the kill
// check and derive 0.92 from it. There is no such byte, because JKITST — the grab —
// does not test depth AT ALL:
//
//     JKITST: LDA X,INVAC1
//             IFPL              ;MOVING (NOT JUMPING)     <- the only gate
//             LDA X,INVAL1      ;YES
//             CMP CURSL1
//             IFEQ              ;IS ANY INVADER LEG ON SAME LINE
//             LDA X,INVAL2      ;AS ANY CURSOR LEG?
//             CMP CURSL2
//             IFEQ
//             JSR INIPSQ        ;YES. DESTROY CURSOR
//                                                          (ALWELG.MAC:1980-1993)
//
// Not-jumping, and both legs on both of the cursor's legs. No INVAY, no threshold.
//
// The depth gate lives one level up, in WHO IS ALLOWED TO RUN IT. `VKITST` appears in
// exactly ONE cam program in the whole cabinet — TOPPER, the CHASER cam ("CHASE PLAYER
// AROUND TOP", ALWELG.MAC:2447-2452). Only a chaser can grab. And an invader becomes a
// chaser in exactly one place:
//
//     CHASER: LDA CURSY         ;PLACE EXACTLY AT TOP
//             STA X,INVAY                              (ALWELG.MAC:1824-1826)
//
// reached from JSMOVE's climb when `CMP CURSY / BEQ ATOP / IFCC` fires (1744-1747).
// So the grab line IS the rim — the line the cursor itself sits on:
//
//     CURSY = ILINLIY = $10          (ALWELG.MAC:57-58 · ALCOMN.MAC:820)
//     depth = (0xF0 - INVAY) / WARP_ALONG_SPAN
//           = (0xF0 - 0x10) / 224 = 224/224 = 1.0        <- EXACTLY the rim
//
// PLAYER_RIM_DEPTH is therefore 1, not 0.92. It is the same line `interpreter.ts`
// already calls RIM_DEPTH = 1 ("the ROM's CURSY, the line the cursor sits on") — so the
// codebase has been carrying TWO spellings of one ROM constant, and the grab used the
// wrong one. 0.92 let an invader that is still CLIMBING, eight units short of the rim,
// grab a player the cabinet would never have touched.
//
// ── WHAT THIS DOES TO THE STORY'S OWN PREMISE ────────────────────────────────────────
//
// The story (and tp1-24 before it) assumed the grab line sits BELOW the carrier's burst
// line, giving a sliver [0.92, 0.9286) where a split child is born "both LETHAL and
// FLIPPING". The real ordering is the other way round:
//
//     SPLIT_TOO_CLOSE_DEPTH = ($F0-$20)/224 = 0.9286    <- burst / no-flip line
//     PLAYER_RIM_DEPTH      = ($F0-$10)/224 = 1.0       <- grab line, ABOVE it
//
// so the band [PLAYER_RIM_DEPTH, SPLIT_TOO_CLOSE_DEPTH) is EMPTY. A carrier bursts at
// $20 and its children are seated at the parent's INVAY — strictly BELOW $10 in depth
// terms, i.e. below the rim. NO CHILD IS EVER BORN LETHAL. It has to climb to the rim
// and become a chaser first, which is ~11 frames of running room.
//
// tp1-24 ratified a difficulty change ("the children are born ABOVE PLAYER_RIM_DEPTH,
// therefore a player on a flanking lane dies on the burst frame") that the cabinet does
// not have. It was an artefact of the invented 0.92, and it is refuted below.
//
// ── TEST DISCIPLINE ──────────────────────────────────────────────────────────────────
//
// Every premise here is pinned to a LITERAL (0.92, 0.9286, 1.0), never to the constant
// under test. A premise written as `depth < PLAYER_RIM_DEPTH` re-derives from the very
// number this story is auditing and would go green against ANY value of it — which is
// precisely how 0.92 survived two stories that both leaned on it.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { playingState } from './helpers'
import { stepGame, makeEnemy, splitTanker } from '../../src/core/sim'
import { isJumping } from '../../src/core/enemies/interpreter'
import {
  levelParams, SIM_STEP, WARP_ALONG_SPAN,
  PLAYER_RIM_DEPTH, SPLIT_TOO_CLOSE_DEPTH, TANKER_SPLIT_DEPTH,
} from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'
import { Enemy, GameState } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

// The two ROM bytes this story is about, as LITERALS. Never import these from the code
// under test — the whole point is to check the code against them.
const CURSY_BYTE = 0x10        // ILINLIY — the line the cursor sits on (ALCOMN.MAC:820)
const TOO_CLOSE_BYTE = 0x20    // the carrier's "TOO CLOSE TO TOP" line (ALWELG.MAC:1749)
const INVENTED = 0.92          // the constant this story exists to kill
const RIM = 1                  // (0xF0 - 0x10) / 224, worked out by hand

// Wave 1's flipper cam is the generic NOJUMP cam (W-006): a flipper on wave 1 climbs
// its lane and never flips. That makes "did it grab?" unambiguous — a test that lets the
// enemy flip can pass for the wrong reason, because a MID-FLIP invader is excluded from
// the grab by JKITST's `IFPL` gate whatever the depth line says.
const WAVE = 1

function base(level: number, playerLane: number): GameState {
  const s = playingState(1)
  s.level = level
  s.tube = tubeForLevel(level)   // NOT optional: s.level alone leaves level 1's tube
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spawn.remaining = 0
  s.player.lane = playerLane
  s.enemies = []
  return s
}

/** A lone flipper, parked at `depth`, with its bolt disabled — a bolt is a second way to die. */
function flipperAt(level: number, lane: number, depth: number): Enemy {
  const f = makeEnemy('flipper', lane, depth, levelParams(level))
  f.fireCooldown = 999
  return f
}

const flippersOf = (s: GameState): Enemy[] => s.enemies.filter((e) => e.kind === 'flipper')

describe('tp1-27 — the grab line is the RIM ($10 = CURSY), derived, not invented', () => {
  it('inverts to a WHOLE ROM byte — 0.92 does not, and that is the tell', () => {
    // Every other constant in rules.ts is (0xF0 - byte) / WARP_ALONG_SPAN for some byte
    // the ROM actually contains. Invert ours and demand an integer back. 0.92 gives
    // 0xF0 - 0.92*224 = 33.92 — no such byte exists, which is what filed this story.
    const invay = 0xf0 - PLAYER_RIM_DEPTH * WARP_ALONG_SPAN

    expect(
      Math.abs(invay - Math.round(invay)),
      `PLAYER_RIM_DEPTH inverts to INVAY=${invay}, which is not a whole ROM byte — it is invented`,
    ).toBeLessThan(1e-9)
  })

  it('is CURSY = ILINLIY = $10 — the line the cursor itself sits on', () => {
    // CHASER seats the invader at CURSY ("PLACE EXACTLY AT TOP", ALWELG.MAC:1825-1826),
    // and only a chaser runs the grab. So the grab line IS the cursor's line.
    expect(PLAYER_RIM_DEPTH).toBe((0xf0 - CURSY_BYTE) / WARP_ALONG_SPAN)
    expect(PLAYER_RIM_DEPTH).toBe(RIM)

    // Refute the invented value by name, so it cannot quietly return as a "tuning" nudge.
    expect(PLAYER_RIM_DEPTH, 'the invented 0.92 is still in rules.ts').not.toBe(INVENTED)
  })

  it('sits ABOVE the carrier burst line — $10 and $20 are different bytes, in that order', () => {
    // The two-threshold structure is authentic, but the ORDER is the opposite of the one
    // tp1-24 assumed. The rim ($10) is SHALLOWER in INVAY and therefore DEEPER in depth
    // than the burst line ($20).
    expect(SPLIT_TOO_CLOSE_DEPTH).toBe((0xf0 - TOO_CLOSE_BYTE) / WARP_ALONG_SPAN)
    expect(
      PLAYER_RIM_DEPTH,
      'the grab line must sit ABOVE the burst line — a carrier bursts BELOW the rim',
    ).toBeGreaterThan(SPLIT_TOO_CLOSE_DEPTH)
  })

  it('leaves the "lethal AND flipping" sliver EMPTY — it was an artefact of 0.92', () => {
    // The story asked for coverage of [PLAYER_RIM_DEPTH, SPLIT_TOO_CLOSE_DEPTH): a child
    // born lethal (above the grab line) yet still flipping (below the no-flip line). With
    // the grab line derived, that interval is inverted and therefore empty. There is no
    // depth at which a newborn child is both. This is the coverage — the band does not exist.
    const bandIsEmpty = PLAYER_RIM_DEPTH >= SPLIT_TOO_CLOSE_DEPTH
    expect(
      bandIsEmpty,
      'a child born below the no-flip line cannot also be above the grab line',
    ).toBe(true)
  })
})

describe('tp1-27 — the grab belongs to the CHASER, not to "deep enough"', () => {
  it('a still-CLIMBING flipper on the player\'s lane does NOT grab — it must reach the rim', () => {
    // The defect, stated. At 0.95 the flipper is past the invented line (0.92) and short
    // of the rim (1.0). The cabinet's invader here is running the wave cam, not TOPPER,
    // so it cannot execute VKITST at all. Ours grabs.
    let s = base(WAVE, 7)
    s.enemies = [flipperAt(WAVE, 7, 0.95)]

    s = stepGame(s, NEUTRAL, FRAME)

    const f = flippersOf(s)[0]
    expect(f, 'premise: the flipper is still on the board').toBeDefined()

    // Premises, pinned to LITERALS — not to the constant under test.
    expect(f!.depth, 'premise: it is past the invented 0.92 line').toBeGreaterThan(INVENTED)
    expect(f!.depth, 'premise: it has NOT reached the rim').toBeLessThan(RIM)
    expect(f!.lane, 'premise: it is on the player\'s lane').toBe(s.player.lane)
    // Without this the test could pass for the wrong reason: JKITST's `IFPL` gate already
    // spares a MID-FLIP invader whatever the depth line says (W-010).
    expect(isJumping(f!), 'premise: it is NOT mid-flip — the pass must come from depth').toBe(false)

    expect(
      s.player.alive,
      'an invader still climbing to the rim cannot grab — only a CHASER runs VKITST',
    ).toBe(true)
  })

  it('but a flipper that REACHES the rim on the player\'s lane DOES grab', () => {
    // The liveness guard. "No grab below the rim" must not be satisfiable by breaking the
    // grab outright — this is the test that fails if PLAYER_RIM_DEPTH is set to something
    // an enemy can never reach.
    let s = base(WAVE, 7)
    s.enemies = [flipperAt(WAVE, 7, 0.95)]

    let died = false
    for (let i = 0; i < 120 && !died; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      if (!s.player.alive) died = true
    }

    expect(died, 'a flipper that takes the rim on the player\'s lane must still kill him').toBe(true)
  })

  it('the depth a CHASER is pinned at IS the grab line — one ROM line, one number', () => {
    // The structural invariant behind the whole story. CHASER does `LDA CURSY / STA X,INVAY`;
    // the grab compares against the cursor's lines. If the depth a chaser rests at and the
    // depth the grab triggers at are different numbers, we have invented one of them.
    //
    // Player parked on the far side so we can watch the arrival without dying.
    let s = base(WAVE, 0)
    const lane = 8
    s.enemies = [flipperAt(WAVE, lane, 0.95)]

    let chaserDepth = -1
    for (let i = 0; i < 120; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      const f = flippersOf(s)[0]
      if (!f) break
      if (f.depth >= RIM - 1e-9) { chaserDepth = f.depth; break }   // literal rim
    }

    expect(chaserDepth, 'premise: the flipper reached the rim and stopped climbing').toBeGreaterThan(0)
    expect(
      chaserDepth,
      'the chaser rests at the rim, so the grab line must BE the rim',
    ).toBe(PLAYER_RIM_DEPTH)
  })
})

describe('tp1-27 — no split child is EVER born lethal (tp1-24, re-verified against the derived line)', () => {
  const TANKER_LANE = 5
  const LANDING_LANES = [4, 6]
  // Wave 3, as tp1-24: its flipper cam is SPIRAL, so a child that is allowed to flip
  // visibly does. Wave 1's NOJUMP cam cannot tell the no-flip rule from the wave's own.
  const SPLIT_WAVE = 3

  /** Let a tanker CLIMB to its own arrival and burst there — the only way it splits near the rim. */
  function climbUntilBurst(level: number, playerLane: number) {
    let s = base(level, playerLane)
    const t = makeEnemy('tanker', TANKER_LANE, 0.5, levelParams(level), 'flipper')
    t.fireCooldown = 999
    s.enemies = [t]

    for (let i = 0; i < 400; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      if (!s.enemies.some((e) => e.kind === 'tanker')) return { s, burstFrame: i }
    }
    throw new Error('fixture: the tanker never burst — it never reached its arrival depth')
  }

  it('a self-arriving tanker drops its children BELOW the rim — they still have to climb', () => {
    const { s } = climbUntilBurst(SPLIT_WAVE, 12)   // player parked far away

    const kids = flippersOf(s)
    expect(kids, 'premise: the tanker burst into two children').toHaveLength(2)

    for (const k of kids) {
      // Born at the parent's depth, which is at/past the $20 burst gate (W-030 — that half
      // of the finding stands, and tp1-24 is right about it).
      expect(k.depth, 'a child is born at its parent\'s depth').toBeGreaterThanOrEqual(TANKER_SPLIT_DEPTH)
      // ...and the parent burst BELOW the rim, because ATOP is tested BEFORE the carrier
      // check (ALWELG.MAC:1744-1750): a carrier that actually reaches CURSY becomes a
      // CHASER, it does not burst. So a newborn child is never at the rim.
      expect(
        k.depth,
        'the children are born BELOW the grab line — the ROM never births a lethal child',
      ).toBeLessThan(RIM)
    }
  })

  it('SPARES the player standing on a landing lane on the burst frame — and kills him once they climb', () => {
    // tp1-24 shipped this case inverted: "is INSTANTLY lethal to a player standing on a
    // child's landing lane". That was true only under the invented 0.92 (the child lands
    // at 0.9286, which clears 0.92 but not the rim). The cabinet gives him his ~11 frames.
    //
    // Both halves are asserted here, because "he survives" alone is also what a board full
    // of INERT children looks like.
    const livesBefore = base(SPLIT_WAVE, LANDING_LANES[0]!).lives
    let { s } = climbUntilBurst(SPLIT_WAVE, LANDING_LANES[0]!)   // player ON lane 4

    expect(flippersOf(s), 'premise: the tanker burst').toHaveLength(2)
    expect(
      flippersOf(s).map((k) => k.lane),
      'premise: a child really did land on the player\'s lane',
    ).toContain(LANDING_LANES[0]!)

    expect(
      s.player.alive,
      'a child is born below the rim — it cannot grab on the burst frame',
    ).toBe(true)
    expect(s.lives, 'and the burst frame must not cost a life').toBe(livesBefore)

    // Liveness: the reprieve is a delay, not an amnesty. The children take the rim and
    // grab him a few frames later.
    let died = false
    for (let i = 0; i < 120 && !died; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      if (!s.player.alive) died = true
    }
    expect(died, 'the children must still kill him once they reach the rim').toBe(true)
  })

  it('a tanker SHOT in the old sliver drops children that cannot grab either', () => {
    // The story's AC-5 band, [0.92, 0.9286) — a BULLET-split child, born flipping (below
    // the no-flip line) and, under the invented constant, instantly lethal. Answered with
    // the ROM's verdict: below the rim is below the rim. It cannot grab.
    const tube = tubeForLevel(SPLIT_WAVE)
    const params = levelParams(SPLIT_WAVE)
    const shotAt = 0.925                            // inside the old band, literal
    expect(shotAt, 'premise: the fixture sits in the old sliver').toBeGreaterThan(INVENTED)
    expect(shotAt, 'premise: ...and below the no-flip line').toBeLessThan(0.9286)

    const parent = makeEnemy('tanker', TANKER_LANE, shotAt, params, 'flipper')
    const kids = splitTanker(parent, tube, params)
    expect(kids).toHaveLength(2)

    let s = base(SPLIT_WAVE, LANDING_LANES[0]!)     // player ON a landing lane
    s.enemies = kids.map((k) => ({ ...k, fireCooldown: 999 }))

    s = stepGame(s, NEUTRAL, FRAME)

    expect(
      s.player.alive,
      'a bullet-split child born below the rim must not grab on the frame it is born',
    ).toBe(true)
  })
})

describe('tp1-27 — the second use site: the enemy BOLT still kills', () => {
  it('a bolt riding the player\'s lane still reaches him', () => {
    // PLAYER_RIM_DEPTH gates resolveEnemyBoltHits (sim.ts) as well as the grab, and the ROM
    // agrees that it should: the enemy charge is tested `CMP CURSY / IFCC ;AT TOP?` ->
    // `JSR CHATOP ;YES. CHECK FOR COLLISION WITH CURSOR` (ALWELG.MAC:2562-2565) — the same
    // CURSY line. Moving the constant must NOT quietly disarm enemy fire: a bolt is culled
    // once it passes the rim, so if the kill line were unreachable the cull would eat it.
    let s = base(WAVE, 7)
    // A decoy, deep and far away: with an EMPTY board checkLevelClear warps out on frame 1
    // and nothing can kill anybody. (It cost me a red guard to notice.) It starts at 0.1 and
    // climbs ~0.006/frame, so it cannot reach the rim inside this window, and it is nowhere
    // near the player's lane.
    s.enemies = [flipperAt(WAVE, 0, 0.1)]
    s.enemyBullets = [{ lane: 7, depth: 0.8 }]

    let died = false
    for (let i = 0; i < 120 && !died; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      if (!s.player.alive) died = true
    }

    expect(died, 'an enemy bolt on the player\'s lane must still kill him').toBe(true)
    expect(
      s.events.some((e) => e.type === 'player-death' && e.cause === 'bolt'),
      'and he must die to the BOLT — not to the decoy wandering onto his lane',
    ).toBe(true)
  })
})

// ── Provenance: re-read from Theurer's own source ────────────────────────────────────
// The claims above are only as good as the ROM reading behind them. These re-open the
// 1981 assembler and prove the three facts the derivation rests on, so that nobody can
// "correct" PLAYER_RIM_DEPTH back to 0.92 without this suite going red.
const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(sourceDir)
const read = (f: string) => readFileSync(join(sourceDir, f), 'utf8').replace(/\r/g, '')

describe.skipIf(!sourceAvailable)('tp1-27 provenance — ALWELG.MAC / ALCOMN.MAC', () => {
  it('CURSY is ILINLIY, and ILINLIY is $10', () => {
    const alcomn = read('ALCOMN.MAC')
    const alwelg = read('ALWELG.MAC')

    // ALCOMN.MAC:819-820 — the two rails of the depth axis.
    expect(alcomn).toMatch(/^ILINLIY=010$/m)
    expect(alcomn).toMatch(/^ILINDDY=0F0$/m)

    // NEWAV2 seats the cursor on it at the start of every wave (ALWELG.MAC:57-58).
    expect(alwelg).toMatch(/LDA I,ILINLIY\n\tSTA CURSY/)

    // And that is exactly the span rules.ts already derives from.
    expect(WARP_ALONG_SPAN).toBe(0xf0 - 0x10)
  })

  it('JKITST tests no depth at all — the grab has no threshold byte to find', () => {
    const alwelg = read('ALWELG.MAC')
    const body = alwelg.slice(alwelg.indexOf('\nJKITST:'))
    const jkitst = body.slice(0, body.indexOf('\nJFUSKI:'))

    expect(jkitst, 'premise: we sliced the real routine').toContain('INIPSQ')
    expect(
      jkitst,
      'JKITST compares INVAY against nothing — there is no grab threshold in the cabinet',
    ).not.toContain('INVAY')
  })

  it('only the CHASER cam can grab, and CHASER seats it exactly at CURSY', () => {
    const alwelg = read('ALWELG.MAC')

    // VKITST occurs twice in the whole file: the opcode definition, and ONE use — inside
    // TOPPER, the chaser cam. If a second cam ever gains it, this story's reasoning breaks.
    const uses = alwelg.split('\n').filter((l) => l.includes('VKITST'))
    expect(uses).toHaveLength(2)
    expect(uses[0], 'the opcode definition').toContain('CAMAC JKITST,VKITST,18')
    expect(uses[1], 'its only use, in TOPPER — "TEST FOR CURSOR KILL"').toContain('KICHEK:')

    // CHASER: "PLACE EXACTLY AT TOP" — the invader's depth is SET to the cursor's.
    expect(alwelg).toMatch(/CHASER:\n\tLDA CURSY\t\t;PLACE EXACTLY AT TOP\n\tSTA X,INVAY/)

    // ...and the climb reaches it via CMP CURSY, not via any constant (ALWELG.MAC:1744-1747).
    expect(alwelg).toMatch(/\tCMP CURSY\n\tBEQ ATOP/)
  })
})
