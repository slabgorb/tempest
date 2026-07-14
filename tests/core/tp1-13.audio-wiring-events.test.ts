// tests/core/tp1-13.audio-wiring-events.test.ts
//
// Story tp1-13 — AUDIO WIRING GAPS (audit cluster C9: S-011, S-013, S-014, S-015).
// RED suite for the PURE-CORE half: three new GameEvents the shell's audio layer
// will consume. None of them exist in src/core/events.ts yet and sim.ts emits
// none of them, so the behavioural assertions below fail today (valid RED).
//
//   - 'warp-space'     — the dive crossed the well's bottom (ILINDDY = $F0) into
//                        space. MOVCUD starts the T3 drone on exactly that frame:
//                        "CMP I,ILINDDY … IFCS ;IS CURSOR PAST BOTTOM? / LDA
//                        I,CENDWA ;YES. INITIALIZE SPACE MODE / JSR SOUTS3
//                        ;START SPACE SOUND" (ALWELG.MAC:1032-1037). S-014.
//   - 'wave-bonus'     — the end-of-wave skill-step bonus was awarded. ENDWAV:
//                        "LDA X,BONUS / IFNE ;BONUS? / JSR BONSCO / … / JSR
//                        SAUSON ;MAKE NOISE" (ALEXEC.MAC:371-376). BONUS is "BONUS
//                        CODE FOR STARTING AT ADVANCED WAVE" (ALCOMN.MAC:704),
//                        set at level select (ALWELG.MAC:233-236) and cleared on
//                        arrival at the next well (ALWELG.MAC:114-117) — so it
//                        fires ONCE, at the end of the starting wave. S-015.
//   - 'bolt-destroyed' — a player shot destroyed an enemy bolt in flight. INCCSQ:
//                        "JSR CCEXPL ;CHARGE-CHARGE" then GENEXP for the explosion
//                        sprite (ALWELG.MAC:2797-2809). Our resolveEnemyBulletHits
//                        implements the collision but emits nothing. S-013.
//
// Design boundary with tp1-10 (THE WARP DIVE, backlog): tp1-10 owns the CAMERA
// work of the second phase ("the eye flies INTO the new well"). This story owns
// the second phase's EXISTENCE AS TIME plus its sound: after the bottom-crossing
// the mode must stay 'warp' for a nonzero interval before warp-end/advance, or
// the T3 loop would start and stop on the same frame — a sound that ships but
// can never be heard. The duration floor pinned here is deliberately weak (>= 2
// frames); the authentic duration is a Dev/Reviewer concern recorded in the
// session's Delivery Findings.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'
import { stepGame, makeEnemy } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import {
  SPIKE_MAX_DEPTH, START_LIVES, EXTRA_LIFE_INTERVAL, levelParams,
} from '../../src/core/rules'
import { initialState } from '../../src/core/state'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const START: Input = { ...NEUTRAL, start: true }
const SPIN_UP: Input = { ...NEUTRAL, spin: 1 }

// ── ROM anchors ───────────────────────────────────────────────────────────────
// The skill-step bonus ladder, decoded from BONSCO's BONPTM table
// (ALWELG.MAC:266-277). ALWELG is .RADIX 16 and the words are BCD digit-pairs
// with an always-zero ones-pair (BONSCO: "LDA I,0 ;LSB ALWAYS 0"), so
// .WORD 60 → 6,000 points; .WORD 160 → 16,000; .WORD 320 → 32,000; …
// The startable waves come from the LEVEL table (ALWELG.MAC:278-280, entries are
// wave#-1): 1, 3, 5, 7, 9, 11, 13, 15, … Index i into LEVEL is also the index
// into BONPTM — ENDWAV awards BONPTM[BONUS] where BONUS is the select index.
// Values are pinned as LITERALS, never re-derived from the code under audit
// (the tp1-27 lesson: a test that re-derives from the audited constant stays
// green for ANY value of it).
const ROM_START_BONUS: ReadonlyArray<{ wave: number; points: number }> = [
  { wave: 1, points: 0 }, // BONPTM[0] = 0 — and ENDWAV's IFNE means NO chime
  { wave: 3, points: 6_000 },
  { wave: 5, points: 16_000 },
  { wave: 7, points: 32_000 },
  { wave: 9, points: 54_000 },
  { wave: 11, points: 74_000 },
  { wave: 13, points: 94_000 },
  { wave: 15, points: 114_000 },
]
// ── helpers ───────────────────────────────────────────────────────────────────

function eventsOfType<T extends GameEvent['type']>(
  events: readonly GameEvent[], type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
}

// A game already in the warp (Claw at the rim, progress = 0). Same staging as
// tests/core/sim.warp-spikes.test.ts: level 1 = closed circle, 16 lanes; board
// and nymph queue cleared so nothing else can end the warp.
function warpingState(opts: {
  playerLane?: number
  spikes?: ReadonlyArray<readonly [number, number]>
} = {}): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.enemyBullets = []
  s.mode = 'warp'
  s.warp.progress = 0
  if (opts.playerLane !== undefined) s.player.lane = opts.playerLane
  for (const [lane, h] of opts.spikes ?? []) s.spikes[lane] = h
  return s
}

// One recorded frame of a dive: the events emitted plus the post-step snapshot
// the assertions need (mode/level/lives).
interface DiveFrame {
  events: GameEvent[]
  mode: GameState['mode']
  level: number
  lives: number
}

// Step until the warp resolves (mode leaves 'warp'), recording every frame.
// `mutate` lets a test intervene mid-dive (e.g. teleport onto a spiked lane the
// frame 'warp-space' fires). Bounded so a never-resolving bug fails loudly.
function runDive(
  s: GameState,
  mutate?: (s: GameState, frame: DiveFrame) => void,
): { frames: DiveFrame[]; state: GameState } {
  const frames: DiveFrame[] = []
  let steps = 0
  while (s.mode === 'warp' && steps < 3000) {
    s = stepGame(s, NEUTRAL, DT)
    const frame: DiveFrame = { events: [...s.events], mode: s.mode, level: s.level, lives: s.lives }
    frames.push(frame)
    mutate?.(s, frame)
    steps++
  }
  return { frames, state: s }
}

// Index of the first frame whose events contain `type`, or -1.
function frameIndexOf(frames: readonly DiveFrame[], type: GameEvent['type']): number {
  return frames.findIndex((f) => f.events.some((e) => e.type === type))
}

// Total occurrences of `type` across all frames.
function countAcross(frames: readonly DiveFrame[], type: GameEvent['type']): number {
  return frames.reduce((n, f) => n + f.events.filter((e) => e.type === type).length, 0)
}

// Drive the REAL framing flow: attract → (start) → select → (spin up to `wave`)
// → (start) → playing at `wave`. Uses the actual select machine, so whatever
// state carries the pending skill-step bonus is exercised end-to-end.
function startAtWave(wave: number, seed = 7): GameState {
  let s = initialState(seed)
  s.mode = 'attract'
  s = stepGame(s, START, DT)
  expect(s.mode, 'start on the title must open level select').toBe('select')
  for (let i = 1; i < wave; i++) s = stepGame(s, SPIN_UP, DT)
  expect(s.select.selectedLevel).toBe(wave)
  s = stepGame(s, START, DT)
  expect(s.mode).toBe('playing')
  expect(s.level).toBe(wave)
  return s
}

// Clear the board and take one step so checkLevelClear enters the warp.
function clearIntoWarp(s: GameState): GameState {
  s.enemies = []
  s.spawn = { nymphs: [] }
  s.bullets = []
  s.enemyBullets = []
  s.spikes = s.spikes.map(() => 0) // no spike threat — no AVOID SPIKES hold
  const next = stepGame(s, NEUTRAL, DT)
  expect(next.mode, 'an empty board must enter the warp').toBe('warp')
  expect(eventsOfType(next.events, 'level-clear')).toHaveLength(1)
  return next
}

// ── AC-1: the warp's second phase — 'warp-space' at the bottom-crossing ───────

describe("tp1-13 AC-1 — 'warp-space' fires when the dive passes the well bottom (S-014)", () => {
  it('emits warp-space exactly once on a completed dive, strictly before warp-end', () => {
    const { frames } = runDive(warpingState())
    expect(countAcross(frames, 'warp-space'), 'exactly one warp-space per completed dive').toBe(1)
    const spaceIdx = frameIndexOf(frames, 'warp-space')
    const endIdx = frameIndexOf(frames, 'warp-end')
    expect(spaceIdx, 'warp-space must fire').toBeGreaterThanOrEqual(0)
    expect(endIdx, 'warp-end must still fire').toBeGreaterThanOrEqual(0)
    // The second phase must exist AS TIME: T3 starting and stopping on the same
    // frame is a sound that ships but can never be heard.
    expect(endIdx, 'warp-end must come strictly after warp-space').toBeGreaterThan(spaceIdx)
    expect(endIdx - spaceIdx, 'the space phase must span at least two frames').toBeGreaterThanOrEqual(2)
  })

  it('stays in the warp on the warp-space frame — play deferred through the fly-in', () => {
    const { frames } = runDive(warpingState())
    const spaceIdx = frameIndexOf(frames, 'warp-space')
    expect(spaceIdx).toBeGreaterThanOrEqual(0)
    // tp1-13's "space is still the warp" intent (mode not yet 'playing') UNIFIED with
    // tp1-10's ROM ordering: ENDWAV increments the wave (INC CURWAV) at the bottom-
    // crossing, BEFORE the NEWAV2 eye fly-in, so the LEVEL has already advanced to the
    // new wave while mode stays 'warp' — play resumes only when the fly-in completes.
    // (tp1-13's provisional model advanced the wave at the END of the space phase; the
    // ROM pays ENDWAV first, which is the ordering tp1-10 established and this unifies to.)
    expect(frames[spaceIdx].mode, 'the bottom-crossing frame is still mode=warp (fly-in)').toBe('warp')
    expect(frames[spaceIdx].level, 'ENDWAV advances the wave before the fly-in (ROM ordering)').toBe(2)
  })

  it('still ends the dive with exactly one warp-end, on the frame play resumes (fly-in end)', () => {
    const { frames, state } = runDive(warpingState())
    expect(countAcross(frames, 'warp-end')).toBe(1)
    const endIdx = frameIndexOf(frames, 'warp-end')
    // UNIFIED: warp-end fires as the eye fly-in completes (mode → 'playing'); the level
    // already advanced earlier, at the warp-space bottom-crossing (ENDWAV before NEWAV2).
    expect(frames[endIdx].mode).toBe('playing')
    expect(frames[endIdx].level).toBe(2)
    expect(state.level).toBe(2)
  })

  it('never emits warp-space on a dive that crashes onto a spike', () => {
    const { frames, state } = runDive(
      warpingState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH]] }),
    )
    expect(state.mode, 'the crash staging must actually crash').toBe('dying')
    expect(countAcross(frames, 'warp-space'), 'a crashed dive never reaches the bottom').toBe(0)
    expect(countAcross(frames, 'warp-end'), 'the crash still ends the dive exactly once').toBe(1)
  })

  it('cannot crash on a spike during the space phase — past ILINDDY the cursor is off the lines', () => {
    // ROM: the dive's spike collision is gated on "CMP I,ILINDDY / IFCC …
    // ;CURSOR STILL ON LINES" (ALWELG.MAC:1083-1085) — past the bottom there is
    // nothing left to hit. Our stepWarp order (spike check after progress
    // advance) would crash a claw sitting on a spiked lane at depth <= 0, so
    // this pins the gate. The player may still rotate during the warp
    // (sim.ts stepGame 'warp' arm), so this state is reachable by play.
    const spiked = 8
    let teleported = false
    const { frames, state } = runDive(
      warpingState({ playerLane: 0, spikes: [[spiked, SPIKE_MAX_DEPTH]] }),
      (s, frame) => {
        if (!teleported && frame.events.some((e) => e.type === 'warp-space')) {
          s.player.lane = spiked // rotate onto the spiked lane, in space
          teleported = true
        }
      },
    )
    expect(teleported, 'staging: warp-space must have fired so the teleport happened').toBe(true)
    expect(countAcross(frames, 'warp-spike-crash'), 'no spike crash in space').toBe(0)
    expect(countAcross(frames, 'player-death'), 'no death in space').toBe(0)
    expect(state.mode).toBe('playing')
    expect(state.level, 'the dive completes normally').toBe(2)
    expect(state.lives).toBe(START_LIVES)
  })
})

// ── AC-2: the end-of-wave skill-step bonus — 'wave-bonus' + score (S-015) ─────

describe("tp1-13 AC-2 — 'wave-bonus' fires once, at the end of the starting wave (S-015)", () => {
  it('awards the ROM bonus for a wave-3 start: one wave-bonus of 6,000 points, in the space phase', () => {
    let s = startAtWave(3)
    expect(s.score, 'a fresh game starts at score 0').toBe(0)
    s = clearIntoWarp(s)
    const { frames, state } = runDive(s)

    const bonuses = frames.flatMap((f) => eventsOfType(f.events, 'wave-bonus'))
    expect(bonuses, 'exactly one wave-bonus for the starting wave').toHaveLength(1)
    expect(bonuses[0].points, 'BONPTM[1] — .WORD 60 in BCD pairs ×100 (ALWELG.MAC:275)').toBe(6_000)
    expect(state.score, 'BONSCO/UPSCOR: the bonus is scored, not just chimed').toBe(6_000)

    // ENDWAV runs after MOVCUD enters space mode (CENDWA), so the award belongs
    // to the space phase — never to the dive's first (in-well) phase.
    const spaceIdx = frameIndexOf(frames, 'warp-space')
    const endIdx = frameIndexOf(frames, 'warp-end')
    const bonusIdx = frameIndexOf(frames, 'wave-bonus')
    expect(bonusIdx, 'the bonus is awarded at/after the bottom-crossing').toBeGreaterThanOrEqual(spaceIdx)
    expect(bonusIdx, 'the bonus is awarded before the dive concludes').toBeLessThanOrEqual(endIdx)
  })

  it('never fires for a wave-1 start — BONPTM[0] = 0 and ENDWAV gates on IFNE', () => {
    let s = startAtWave(1)
    s = clearIntoWarp(s)
    const { frames, state } = runDive(s)
    expect(countAcross(frames, 'wave-bonus')).toBe(0)
    expect(state.score).toBe(0)
  })

  it.each(ROM_START_BONUS.filter((r) => r.wave > 1 && r.wave <= 15))(
    'pays the ROM ladder value for a wave-$wave start: $points points',
    ({ wave, points }) => {
      let s = startAtWave(wave)
      s = clearIntoWarp(s)
      const { frames, state } = runDive(s)
      const bonuses = frames.flatMap((f) => eventsOfType(f.events, 'wave-bonus'))
      expect(bonuses).toHaveLength(1)
      expect(bonuses[0].points).toBe(points)
      expect(state.score).toBe(points)
    },
  )

  it('feeds the extra-life ladder, like the ROM\'s UPSCOR: a 16,000 bonus crosses 10,000 once', () => {
    // ENDWAV awards through UPSCOR, the same score path GIVBON watches
    // (ALEXEC.MAC:374, 561-586) — so a bonus that crosses EXTRA_LIFE_INTERVAL
    // must ALSO award the bonus life. A bonus applied via a private side-door
    // (skipping the shared scoring path) passes the score assertion above and
    // fails this one.
    expect(EXTRA_LIFE_INTERVAL, 'staging premise: one crossing at 16,000').toBe(10_000)
    let s = startAtWave(5)
    s = clearIntoWarp(s)
    const { frames, state } = runDive(s)
    expect(frames.flatMap((f) => eventsOfType(f.events, 'wave-bonus'))[0]?.points).toBe(16_000)
    const extraLives = frames.flatMap((f) => eventsOfType(f.events, 'extra-life'))
    expect(extraLives, 'the bonus score crossing awards the extra life too').toHaveLength(1)
    expect(extraLives[0].count).toBe(1)
    expect(state.lives).toBe(START_LIVES + 1)
  })

  it('fires only for the STARTING wave — the next wave\'s clear pays nothing', () => {
    // ROM: BONUS is cleared when the eye arrives at the next well
    // (ALWELG.MAC:114-117, "CLEAR BONUS") — one award per game start.
    let s = startAtWave(3)
    s = clearIntoWarp(s)
    let result = runDive(s)
    expect(countAcross(result.frames, 'wave-bonus')).toBe(1)
    const scoreAfterFirst = result.state.score

    // Now clear wave 4 (the next wave) and dive again: no second bonus.
    s = clearIntoWarp(result.state)
    result = runDive(s)
    expect(countAcross(result.frames, 'wave-bonus'), 'no bonus on the follow-up wave').toBe(0)
    expect(result.state.score, 'the score is untouched by the second dive').toBe(scoreAfterFirst)
  })

  it('survives a spike crash and pays exactly once, on the eventual successful dive', () => {
    // ROM: BONUS is only cleared on ARRIVAL — a mid-dive death leaves it pending, and
    // the eventual successful dive collects it. tp1-10 (WD-015) UNIFIED: a spike crash
    // REPLAYS the same wave (board re-armed, one life spent) rather than advancing, so the
    // pending bonus stays owed until a SECOND, successful dive off wave 3 arrives and pays.
    let s = startAtWave(3)
    // Stage the crash: clear the board but leave a spike on the player's lane.
    s.enemies = []
    s.spawn = { nymphs: [] }
    s.bullets = []
    s.enemyBullets = []
    s.spikes = s.spikes.map(() => 0)
    const lane = 0
    s.player.lane = lane
    s.spikes[lane] = SPIKE_MAX_DEPTH
    s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('warp')

    const allFrames: DiveFrame[] = []
    let steps = 0
    // Ride through crash → dying → respawn → replayWave (SAME wave 3, board re-armed) →
    // clear the re-armed board → re-warp → successful arrival at wave 4. On the post-
    // respawn 'playing' frame, clear the re-armed board (and any lingering spike) so the
    // retry dive can actually complete — the level stays 3 until that arrival's ENDWAV.
    while (s.level === 3 && steps < 6000) {
      s = stepGame(s, NEUTRAL, DT)
      allFrames.push({ events: [...s.events], mode: s.mode, level: s.level, lives: s.lives })
      if (s.mode === 'playing') {
        s.enemies = []
        s.spawn = { nymphs: [] }
        s.spikes = s.spikes.map(() => 0)
      }
      steps++
    }
    expect(s.level, 'the retry dive must eventually complete').toBe(4)
    expect(countAcross(allFrames, 'warp-spike-crash'), 'staging: the first dive crashed').toBe(1)
    expect(countAcross(allFrames, 'wave-bonus'), 'one bonus total, on the successful dive').toBe(1)
    expect(s.score).toBe(6_000)
  })

  it('start at wave 4 (not ROM-startable): the bonus, if any, is a defined non-negative integer', () => {
    // The ROM's select ladder is odd waves (LEVEL table, ALWELG.MAC:278-280);
    // our select offers contiguous 1..16, so waves 2,4,6,… have NO ROM bonus
    // value. Whatever mapping Dev rules for them (nearest lower ladder entry, or
    // zero), it must be total and sane — never NaN, never undefined, never
    // negative, and the chime/event only exists when points > 0 (ENDWAV's IFNE).
    let s = startAtWave(4)
    s = clearIntoWarp(s)
    const { frames, state } = runDive(s)
    const bonuses = frames.flatMap((f) => eventsOfType(f.events, 'wave-bonus'))
    expect(bonuses.length, 'at most one award').toBeLessThanOrEqual(1)
    if (bonuses.length === 1) {
      expect(Number.isInteger(bonuses[0].points)).toBe(true)
      expect(bonuses[0].points).toBeGreaterThan(0)
      expect(state.score).toBe(bonuses[0].points)
    } else {
      expect(state.score).toBe(0)
    }
    expect(Number.isNaN(state.score)).toBe(false)
  })
})

// ── AC-3: bullet-on-bolt collisions — 'bolt-destroyed' (S-013) ────────────────

describe("tp1-13 AC-3 — 'bolt-destroyed' fires when a player shot downs an enemy bolt (S-013)", () => {
  // A mid-game board with one parked decoy enemy (an empty board would warp out
  // on frame 1 — the checkLevelClear fixture trap), a player bullet and an enemy
  // bolt staged on a collision course. Bullets travel 1 → 0, bolts 0 → 1, so the
  // bullet is staged ABOVE the bolt and they approach each other.
  function boltCollisionState(opts: {
    bulletLane?: number
    boltLane?: number
    bulletDepth?: number
    boltDepth?: number
  } = {}): GameState {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.enemies = [makeEnemy('flipper', 12, 0.05, levelParams(1))] // decoy, deep & far away
    s.bullets = [{ lane: opts.bulletLane ?? 4, depth: opts.bulletDepth ?? 0.56 }]
    s.enemyBullets = [{ lane: opts.boltLane ?? 4, depth: opts.boltDepth ?? 0.5 }]
    return s
  }

  it('emits one bolt-destroyed carrying the BOLT\'s position, and removes both projectiles', () => {
    const staged = boltCollisionState()
    const s = stepGame(staged, NEUTRAL, DT)
    const hits = eventsOfType(s.events, 'bolt-destroyed')
    expect(hits, 'one collision, one event').toHaveLength(1)
    expect(hits[0].lane).toBe(4)
    // INCCSQ places the explosion at the SHOT's coordinates (CHARY+NPCHAR,
    // ALWELG.MAC:2798-2801) — the bolt's position, not the bullet's.
    expect(Math.abs(hits[0].depth - 0.5), 'the event sits at the bolt').toBeLessThan(0.03)
    expect(hits[0].depth, 'the event must not sit at the bullet').toBeLessThan(0.53)

    expect(s.bullets.filter((b) => b.lane === 4), 'the shot is spent').toHaveLength(0)
    expect(s.enemyBullets.filter((b) => b.lane === 4), 'the bolt is destroyed').toHaveLength(0)
  })

  it('scores nothing and kills nothing — INCCSQ awards no points', () => {
    const staged = boltCollisionState()
    const before = staged.score
    const s = stepGame(staged, NEUTRAL, DT)
    expect(s.score, 'no score for shooting down a bolt').toBe(before)
    expect(eventsOfType(s.events, 'enemy-death'), 'a bolt is not an enemy').toHaveLength(0)
    expect(s.enemies.some((e) => e.kind === 'flipper'), 'the decoy is untouched').toBe(true)
    expect(s.player.alive).toBe(true)
  })

  it('emits nothing when the shot and bolt are on different lanes', () => {
    const staged = boltCollisionState({ bulletLane: 4, boltLane: 5 })
    const s = stepGame(staged, NEUTRAL, DT)
    expect(eventsOfType(s.events, 'bolt-destroyed')).toHaveLength(0)
    expect(s.bullets.filter((b) => b.lane === 4), 'the shot flies on').toHaveLength(1)
    expect(s.enemyBullets.filter((b) => b.lane === 5), 'the bolt flies on').toHaveLength(1)
  })

  it('emits nothing when they share a lane but are far apart in depth', () => {
    const staged = boltCollisionState({ bulletDepth: 0.9, boltDepth: 0.2 })
    const s = stepGame(staged, NEUTRAL, DT)
    expect(eventsOfType(s.events, 'bolt-destroyed')).toHaveLength(0)
    expect(s.bullets.filter((b) => b.lane === 4)).toHaveLength(1)
    expect(s.enemyBullets.filter((b) => b.lane === 4)).toHaveLength(1)
  })

  it('emits one event per pair when two collisions land on the same frame', () => {
    const staged = boltCollisionState({ bulletLane: 3, boltLane: 3 })
    staged.bullets.push({ lane: 9, depth: 0.56 })
    staged.enemyBullets.push({ lane: 9, depth: 0.5 })
    const s = stepGame(staged, NEUTRAL, DT)
    const hits = eventsOfType(s.events, 'bolt-destroyed')
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.lane).sort((a, b) => a - b)).toEqual([3, 9])
  })
})
